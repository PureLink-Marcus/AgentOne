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
