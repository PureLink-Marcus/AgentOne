import crypto from 'node:crypto';
import { classifyMail,emptyMailGroups } from './mail-classifier.mjs';

function text(value,max=500){return String(value??'').trim().slice(0,max);}
function iso(value){const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function headerEntries(headers){
  if(Array.isArray(headers))return headers.map(item=>[String(item?.name||'').toLowerCase(),String(item?.value||'')]);
  if(headers instanceof Map)return [...headers].map(([name,value])=>[String(name).toLowerCase(),String(value)]);
  return Object.entries(headers||{}).map(([name,value])=>[name.toLowerCase(),Array.isArray(value)?value.join(' '):String(value??'')]);
}
function headerMap(headers){return new Map(headerEntries(headers));}
function address(value){return text(value,320).match(/<([^>]+)>/)?.[1]?.toLowerCase()||text(value,320).toLowerCase();}

export function normalizeMailMessage({provider='imap',accountId,input,includeContent=false}={}){
  if(!input||!accountId)throw new Error('mail_message_requires_account');
  const headers=headerMap(input.headers||input.payload?.headers),sender=address(input.sender||input.from||headers.get('from'));
  const providerId=text(input.id||input.uid||headers.get('message-id'),240),providerThreadId=text(input.threadId||'',240);
  const subject=text(input.subject||headers.get('subject'),500),receivedAt=iso(input.internalDate?Number(input.internalDate):input.receivedAt||input.date||headers.get('date'));
  const classification=classifyMail({sender,subject,headers});
  const identity={provider:text(provider,30).toLowerCase(),accountId:text(accountId,100),providerId:providerId||null,messageId:text(headers.get('message-id'),320)||null,receivedAt,subject,sender};
  const idempotencyKey=hash(identity),threadKey=providerThreadId?`${identity.provider}:${identity.accountId}:${providerThreadId}`:hash({accountId:identity.accountId,subject:subject.replace(/^\s*(?:(?:re|aw|fwd|wg):\s*)+/i,'').toLowerCase(),participants:[sender,address(headers.get('to'))].sort()});
  return {schema:'agentone.mail.message/v1',...identity,idempotencyKey,threadKey,subject,sender,to:address(headers.get('to')),receivedAt,...(includeContent?{snippet:text(input.snippet||input.text||'',600)}:{}),labels:[...(input.labelIds||input.labels||[])].map(value=>text(value,100)).filter(Boolean),category:classification.category,confidence:classification.confidence,classificationSignals:classification.signals,needsReview:Boolean(classification.needsReview)};
}

export function mergeMailPage(previous=[],incoming=[],deletedKeys=[]){
  const byKey=new Map(previous.map(item=>[item.idempotencyKey,item]));
  for(const key of deletedKeys)byKey.delete(String(key));
  for(const item of incoming){if(!item?.idempotencyKey)throw new Error('mail_message_missing_idempotency_key');byKey.set(item.idempotencyKey,item);}
  return [...byKey.values()].sort((a,b)=>String(b.receivedAt||'').localeCompare(String(a.receivedAt||'')));
}

export function groupMailMessages(messages=[]){
  const groups=emptyMailGroups(),seen=new Set();
  for(const item of messages){if(!item?.idempotencyKey||seen.has(item.idempotencyKey))continue;seen.add(item.idempotencyKey);(groups[item.category]||groups.people).push(item);}
  return groups;
}

export function planMailSync({provider='imap',cursor=null,remote=null}={}){
  if(provider==='gmail'){
    if(remote?.status===404)return {provider,mode:'full',reason:'history_expired',cursor:null};
    return cursor?.historyId?{provider,mode:'incremental',startHistoryId:String(cursor.historyId)}:{provider,mode:'full',reason:'initial_sync'};
  }
  if(cursor?.uidValidity&&remote?.uidValidity&&String(cursor.uidValidity)!==String(remote.uidValidity))return {provider:'imap',mode:'full',reason:'uid_validity_changed',cursor:null};
  return cursor?.lastUid?{provider:'imap',mode:'incremental',fromUid:Number(cursor.lastUid)+1,uidValidity:String(cursor.uidValidity||remote?.uidValidity||'')}:{provider:'imap',mode:'full',reason:'initial_sync'};
}

export function normalizeCalendars(accountId,items=[]){
  return items.map(item=>({schema:'agentone.calendar/v1',accountId:text(accountId,100),id:text(item.id,300),name:text(item.summary||item.name||item.id,300),description:text(item.description,500),timeZone:text(item.timeZone||'UTC',100),primary:Boolean(item.primary),selected:Boolean(item.selected),hidden:Boolean(item.hidden),accessRole:text(item.accessRole||'reader',60),color:text(item.backgroundColor||item.color,30)})).filter(item=>item.id);
}

export function selectCalendars(calendars=[],selectedIds=[]){
  const selected=new Set(selectedIds.map(String));
  return calendars.map(calendar=>({...calendar,selected:selected.has(calendar.id)}));
}

export function selectedCalendarIds(calendars=[]){return calendars.filter(item=>item.selected&&!item.hidden).map(item=>item.id);}

export function normalizeCalendarEvent({accountId,calendarId,input}={}){
  if(!accountId||!calendarId||!input?.id)throw new Error('calendar_event_identity_required');
  const start=iso(input.start?.dateTime||input.start?.date),end=iso(input.end?.dateTime||input.end?.date);
  return {schema:'agentone.calendar.event/v1',accountId:text(accountId,100),calendarId:text(calendarId,300),providerId:text(input.id,300),idempotencyKey:hash({accountId,calendarId,id:input.id}),revisionKey:hash({etag:input.etag||'',updated:input.updated||''}),title:text(input.summary||'(Ohne Titel)',500),description:text(input.description,2000),location:text(input.location,500),start,end,timeZone:text(input.start?.timeZone||input.end?.timeZone||'UTC',100),status:text(input.status||'confirmed',30),recurringEventId:text(input.recurringEventId,300)||null,attendees:(input.attendees||[]).slice(0,100).map(item=>({email:address(item.email),responseStatus:text(item.responseStatus,40),self:Boolean(item.self)})),updatedAt:iso(input.updated),source:'google-calendar'};
}

export function planCalendarSync(calendars=[],cursors={}){
  return calendars.filter(item=>item.selected&&!item.hidden).map(item=>({calendarId:item.id,mode:cursors[item.id]?.syncToken?'incremental':'full',syncToken:cursors[item.id]?.syncToken||null,showDeleted:true,singleEvents:true}));
}

export function publicSyncError(error,{provider='mail',stage='sync'}={}){
  const source=[error?.code,error?.status,error?.message,error?.response?.status].filter(Boolean).join(' '),retryable=/429|5\d\d|timeout|ETIMEDOUT|ECONNRESET/i.test(source);
  if(/401|403|invalid_grant|AUTH/i.test(source))return {provider,stage,code:'AUTHORIZATION_REQUIRED',retryable:false,message:`${provider==='google-calendar'?'Google-Kalender':'Postfach'} muss erneut verbunden werden.`};
  if(/404/.test(source)&&provider==='gmail')return {provider,stage,code:'CURSOR_EXPIRED',retryable:true,message:'Der Gmail-Synchronisationsstand ist abgelaufen. Ein sicherer Vollabgleich wird gestartet.'};
  if(retryable)return {provider,stage,code:'TEMPORARY_FAILURE',retryable:true,message:'Der Dienst ist vorübergehend nicht erreichbar. AgentOne versucht es später erneut.'};
  return {provider,stage,code:'SYNC_FAILED',retryable:false,message:'Die Synchronisierung konnte nicht abgeschlossen werden. Details stehen redigiert im Audit.'};
}
