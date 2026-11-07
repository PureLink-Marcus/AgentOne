import { groupMailMessages, normalizeMailMessage, planMailSync } from './mail-calendar-sync.mjs';

export const IMAP_CLASSIFICATION_HEADERS=Object.freeze([
  'Authentication-Results',
  'List-Id',
  'List-Unsubscribe',
  'Precedence',
  'Auto-Submitted',
  'X-Spam-Flag',
  'X-Spam-Status',
  'X-Bogosity',
  'Message-ID',
  'To',
]);

const DEFAULT_INITIAL_WINDOW=500;
const DEFAULT_INCREMENTAL_LIMIT=2_000;

function boundedInteger(value,fallback,{min=1,max=10_000}={}){
  const parsed=Number(value);
  return Number.isSafeInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;
}
function safeUid(value){
  const parsed=Number(value);
  return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
}

function insightError(message,code,status=502){return Object.assign(new Error(message),{code,status,retryable:status>=500});}
function decodeQuotedPrintable(value){const text=Buffer.from(value).toString('latin1').replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_match,hex)=>String.fromCharCode(Number.parseInt(hex,16)));return Buffer.from(text,'latin1');}
function decodeInsightPart(value,part,{binary=false}={}){
  let bytes=Buffer.from(value||Buffer.alloc(0));
  if(!binary){const encoding=String(part.encoding||'').toLowerCase();if(encoding==='base64')bytes=Buffer.from(bytes.toString('ascii').replace(/\s+/g,''),'base64');else if(encoding==='quoted-printable')bytes=decodeQuotedPrintable(bytes);}
  const requested=String(part.parameters?.charset||'utf-8').trim().toLowerCase(),charset=requested==='us-ascii'?'utf-8':requested;
  try{return new TextDecoder(charset,{fatal:false}).decode(bytes);}catch{return bytes.toString('utf8');}
}
function insightTextParts(structure){
  const parts=[],attachments=[];
  const visit=node=>{if(!node||typeof node!=='object')return;for(const child of node.childNodes||[])visit(child);if(node.childNodes?.length)return;const disposition=String(node.disposition||'').toLowerCase(),filename=String(node.dispositionParameters?.filename||node.parameters?.name||'');if(disposition==='attachment'||filename){attachments.push(node);return;}const type=String(node.type||'').toLowerCase();if((type==='text/plain'||type==='text/html')&&node.part)parts.push(node);};
  visit(structure);parts.sort((left,right)=>(left.type==='text/plain'?0:1)-(right.type==='text/plain'?0:1));return {parts,attachmentCount:attachments.length};
}

function address(value){
  if(!value||typeof value!=='object')return '';
  if(value.address)return String(value.address).trim().toLowerCase().slice(0,320);
  const mailbox=String(value.mailbox||'').trim(),host=String(value.host||'').trim();
  return mailbox&&host?`${mailbox}@${host}`.toLowerCase().slice(0,320):'';
}

function headerMap(raw){
  const text=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw||'');
  const unfolded=text.replace(/\r?\n[ \t]+/g,' '),headers=new Map();
  for(const line of unfolded.split(/\r?\n/)){
    const separator=line.indexOf(':');
    if(separator<1)continue;
    const name=line.slice(0,separator).trim().toLowerCase(),value=line.slice(separator+1).trim();
    if(!name||!value)continue;
    headers.set(name,headers.has(name)?`${headers.get(name)} ${value}`:value);
  }
  return headers;
}

export function normalizeImapFetchMessage({account,message,uidValidity}={}){
  if(!account?.id||!message)throw new Error('imap_message_identity_required');
  const uid=safeUid(message.uid);
  if(!uid)throw new Error('imap_message_uid_required');
  const flags=[...(message.flags||[])].map(String),labels=[...(message.labels||[])].map(String),from=message.envelope?.from?.[0],to=message.envelope?.to?.[0],headers=headerMap(message.headers);
  const normalized=normalizeMailMessage({
    provider:'imap',
    accountId:account.id,
    input:{
      id:String(uid),
      uid,
      threadId:message.threadId||'',
      sender:address(from),
      to:address(to)||headers.get('to')||'',
      subject:message.envelope?.subject||'(ohne Betreff)',
      headers,
      receivedAt:message.internalDate,
      labels:[...labels,...flags],
    },
  });
  return {
    ...normalized,
    uid,
    uidValidity:String(uidValidity||''),
    size:Number.isSafeInteger(Number(message.size))&&Number(message.size)>=0?Number(message.size):null,
    unread:!flags.some(flag=>flag.toLowerCase()==='\\seen'),
    flagged:flags.some(flag=>flag.toLowerCase()==='\\flagged'),
  };
}

export function buildImapFetchPlan({mailbox,cursor,maxInitial=DEFAULT_INITIAL_WINDOW}={}){
  const exists=Math.max(0,Number(mailbox?.exists)||0),uidValidity=String(mailbox?.uidValidity||''),uidNext=safeUid(mailbox?.uidNext),plan=planMailSync({provider:'imap',cursor,remote:{uidValidity}}),window=boundedInteger(maxInitial,DEFAULT_INITIAL_WINDOW,{max:2_500});
  if(!/^\d+$/.test(uidValidity))throw Object.assign(new Error('imap_uidvalidity_required'),{code:'IMAP_UIDVALIDITY_REQUIRED',retryable:true});
  if(!exists)return {plan,exists,uidValidity,uidNext,range:null,options:{uid:plan.mode==='incremental'},replace:plan.mode==='full'};
  if(plan.mode==='incremental')return {plan,exists,uidValidity,uidNext,range:uidNext&&plan.fromUid>=uidNext?null:`${plan.fromUid}:*`,options:{uid:true},replace:false};
  return {plan,exists,uidValidity,uidNext,range:`${Math.max(1,exists-window+1)}:*`,options:{uid:false},replace:true};
}

export async function syncImapMailbox({client,account,cursor=null,maxInitial=DEFAULT_INITIAL_WINDOW,maxIncremental=DEFAULT_INCREMENTAL_LIMIT}={}){
  if(!client?.getMailboxLock||!client?.fetch)throw new Error('imap_client_required');
  if(!account?.id)throw new Error('imap_account_required');
  const lock=await client.getMailboxLock('INBOX'),startedAt=Date.now();
  try{
    const fetchPlan=buildImapFetchPlan({mailbox:client.mailbox,cursor,maxInitial}),messages=[],seen=new Set(),incrementalLimit=boundedInteger(maxIncremental,DEFAULT_INCREMENTAL_LIMIT,{max:10_000});
    if(fetchPlan.range){
      const query={uid:true,envelope:true,internalDate:true,flags:true,size:true,threadId:true,labels:true,headers:[...IMAP_CLASSIFICATION_HEADERS]};
      for await(const raw of client.fetch(fetchPlan.range,query,fetchPlan.options)){
        const item=normalizeImapFetchMessage({account,message:raw,uidValidity:fetchPlan.uidValidity});
        if(seen.has(item.idempotencyKey))continue;
        seen.add(item.idempotencyKey);messages.push(item);
        if(fetchPlan.plan.mode==='incremental'&&messages.length>incrementalLimit){
          const error=Object.assign(new Error('imap_incremental_backlog_limit'),{code:'IMAP_INCREMENTAL_BACKLOG_LIMIT',retryable:true});
          throw error;
        }
      }
    }
    messages.sort((left,right)=>String(right.receivedAt||'').localeCompare(String(left.receivedAt||'')));
    const fetchedLastUid=messages.reduce((highest,item)=>Math.max(highest,item.uid||0),0),previousLastUid=safeUid(cursor?.lastUid)||0,snapshotLastUid=fetchPlan.plan.mode==='incremental'&&fetchPlan.uidNext?fetchPlan.uidNext-1:0,lastUid=Math.max(fetchPlan.plan.mode==='incremental'?previousLastUid:0,fetchedLastUid,snapshotLastUid)||null;
    return {
      schema:'agentone.imap-sync/v1',
      readOnly:true,
      mutationsApplied:false,
      mode:fetchPlan.plan.mode,
      reason:fetchPlan.plan.reason||null,
      replace:fetchPlan.replace,
      exists:fetchPlan.exists,
      fetched:messages.length,
      messages,
      groups:groupMailMessages(messages),
      cursor:{uidValidity:fetchPlan.uidValidity,lastUid},
      latencyMs:Date.now()-startedAt,
      policy:{bodyFetched:false,attachmentsFetched:false,providerMutations:false,maxInitial:boundedInteger(maxInitial,DEFAULT_INITIAL_WINDOW,{max:2_500}),maxIncremental:incrementalLimit},
    };
  }finally{lock.release();}
}

export async function fetchSingleImapInsightContent({client,uid,uidValidity,maxBytes=128*1024,signal}={}){
  if(!client?.getMailboxLock||!client?.fetchOne)throw insightError('imap_client_required','MAIL_INSIGHT_FETCH_UNAVAILABLE',503);
  const safeMessageUid=safeUid(uid),safeValidity=String(uidValidity||''),limit=boundedInteger(maxBytes,128*1024,{min:1024,max:1024*1024});
  if(!safeMessageUid||!/^\d+$/.test(safeValidity))throw insightError('imap_message_identity_required','MAIL_INSIGHT_FETCH_INVALID',400);
  const lock=await client.getMailboxLock('INBOX');
  try{
    if(signal?.aborted)throw insightError('imap_fetch_aborted','MAIL_INSIGHT_FETCH_TIMEOUT',504);
    if(String(client.mailbox?.uidValidity||'')!==safeValidity)throw insightError('imap_uidvalidity_changed','MAIL_INSIGHT_NOT_FOUND',404);
    const metadata=await client.fetchOne(safeMessageUid,{uid:true,bodyStructure:true,size:true},{uid:true});
    if(!metadata||Number(metadata.uid)!==safeMessageUid)throw insightError('imap_message_not_found','MAIL_INSIGHT_NOT_FOUND',404);
    const {parts,attachmentCount}=insightTextParts(metadata.bodyStructure);if(!parts.length)throw insightError('imap_text_part_not_found','MAIL_INSIGHT_FETCH_INVALID',422);
    const part=parts[0];if(Number(part.size)>limit)throw insightError('imap_text_part_too_large','MAIL_INSIGHT_TOO_LARGE',413);
    const fetched=await client.fetchOne(safeMessageUid,{uid:true,bodyParts:[{key:part.part,start:0,maxLength:limit+1}]},{uid:true}),buffer=fetched&&fetched.bodyParts?.get(part.part);
    if(!Buffer.isBuffer(buffer))throw insightError('imap_text_part_missing','MAIL_INSIGHT_FETCH_INVALID',502);
    if(buffer.length>limit)throw insightError('imap_text_part_too_large','MAIL_INSIGHT_TOO_LARGE',413);
    if(signal?.aborted)throw insightError('imap_fetch_aborted','MAIL_INSIGHT_FETCH_TIMEOUT',504);
    const decoded=decodeInsightPart(buffer,part,{binary:Boolean(fetched.binaryParts?.has(part.part))}),bytes=Buffer.byteLength(decoded,'utf8');if(bytes>limit)throw insightError('imap_text_part_too_large','MAIL_INSIGHT_TOO_LARGE',413);
    return {text:part.type.toLowerCase()==='text/plain'?decoded:'',html:part.type.toLowerCase()==='text/html'?decoded:'',bytes,attachmentCount,remoteContentFetched:false,attachments:[]};
  }finally{lock.release();}
}
