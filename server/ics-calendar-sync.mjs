import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { validatePublicServiceEndpoint } from './personal-services.mjs';

const MAX_BYTES=4*1024*1024;
const MAX_EVENTS=20_000;
const NON_PUBLIC_IPV4=new net.BlockList(),NON_PUBLIC_IPV6=new net.BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])NON_PUBLIC_IPV4.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',3],['2001::',32],['2001:2::',48],['2001:10::',28],['2001:20::',28],['2001:db8::',32],['2002::',16],['3fff::',20],['4000::',2],['8000::',1]])NON_PUBLIC_IPV6.addSubnet(address,prefix,'ipv6');

export class IcsCalendarError extends Error{
  constructor(message,{code='ICS_SYNC_FAILED',status=400,retryable=false}={}){super(message);this.name='IcsCalendarError';this.code=code;this.status=status;this.retryable=retryable;}
  toPublicJSON(){return {provider:'ics-calendar',code:this.code,message:this.message,retryable:this.retryable,secretsExposed:false};}
}

function fail(message,options){throw new IcsCalendarError(message,options);}
function safeText(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function unescapeText(value){return String(value??'').replace(/\\[nN]/g,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');}

function normalizeFeedUrl(value){
  const raw=String(value??'').trim(),normalized=/^webcal:/i.test(raw)?`https:${raw.slice(raw.indexOf(':')+1)}`:raw,url=new URL(normalized),hostname=url.hostname.replace(/\.+$/,'');
  if(hostname!==url.hostname)url.hostname=hostname;
  const literal=hostname.startsWith('[')&&hostname.endsWith(']')?hostname.slice(1,-1):hostname,lower=hostname.toLowerCase();
  if(!hostname||net.isIP(literal)||lower==='localhost'||lower.endsWith('.localhost')||lower.endsWith('.local'))throw new Error('local endpoint');
  return url;
}

function normalizeResolvedAddresses(value){
  const entries=Array.isArray(value)?value:[value],addresses=entries.map(item=>{const address=typeof item==='string'?item:item?.address,family=net.isIP(address),blocked=family===4?NON_PUBLIC_IPV4.check(address,'ipv4'):family===6?NON_PUBLIC_IPV6.check(address,'ipv6'):true;if(blocked)throw new Error('non-public DNS address');return {address,family};});
  if(!addresses.length)throw new Error('empty DNS response');
  return addresses;
}

async function validateAndResolveFeed(value,lookup){
  const normalized=normalizeFeedUrl(value);let addresses=[];
  const capturingLookup=async(hostname,options)=>{addresses=normalizeResolvedAddresses(await lookup(hostname,{...options,all:true}));return addresses;};
  const endpoint=await validatePublicServiceEndpoint(normalized,capturingLookup);
  if(!addresses.length)throw new Error('empty DNS response');
  return {endpoint,addresses};
}

function createPinnedLookup(endpoint,addresses){
  const expected=endpoint.hostname.toLowerCase(),pinned=addresses.map(item=>({...item}));let cursor=0;
  return (hostname,options,callback)=>{
    if(typeof options==='function'){callback=options;options={};}
    const actual=String(hostname||'').toLowerCase();
    if(actual!==expected){const error=Object.assign(new Error('DNS pin mismatch'),{code:'ENOTFOUND',hostname:actual});callback(error);return;}
    const family=Number(options?.family)||0,candidates=family?pinned.filter(item=>item.family===family):pinned;
    if(!candidates.length){const error=Object.assign(new Error('No validated address for requested family'),{code:'ENOTFOUND',hostname:actual});callback(error);return;}
    if(options?.all){callback(null,candidates.map(item=>({...item})));return;}
    const selected=candidates[cursor++%candidates.length];callback(null,selected.address,selected.family);
  };
}

function responseHeaders(headers={}){return {get(name){const value=headers[String(name||'').toLowerCase()];return Array.isArray(value)?value.join(', '):value==null?null:String(value);}};}
function discardResponseBody(response){try{const pending=response?.body?.cancel?.();pending?.catch?.(()=>{});}catch{}try{response?.body?.destroy?.();}catch{}}

function pinnedHttpsFetch(endpoint,{method='GET',headers={},signal}={},addresses,requestImpl=https.request){
  return new Promise((resolve,reject)=>{
    const request=requestImpl(endpoint,{method,headers,signal,agent:false,servername:endpoint.hostname,rejectUnauthorized:true,lookup:createPinnedLookup(endpoint,addresses)},response=>{const status=Number(response.statusCode)||0;resolve({ok:status>=200&&status<300,status,headers:responseHeaders(response.headers),body:response});});
    request.once('error',reject);request.end();
  });
}

function unfold(input){
  const normalized=String(input).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(normalized.includes('\0'))fail('Kalenderdatei enthält ungültige Binärdaten',{code:'ICS_INVALID_CONTENT'});
  const output=[];
  for(const line of normalized.split('\n')){
    if((line.startsWith(' ')||line.startsWith('\t'))&&output.length)output[output.length-1]+=line.slice(1);
    else output.push(line);
  }
  return output;
}

function property(line){
  const colon=line.indexOf(':');if(colon<1)return null;
  const left=line.slice(0,colon),segments=left.split(';'),name=segments.shift().toUpperCase(),params={};
  for(const segment of segments){const equal=segment.indexOf('=');if(equal<1)continue;params[segment.slice(0,equal).toUpperCase()]=segment.slice(equal+1).replace(/^"|"$/g,'');}
  return {name,params,value:line.slice(colon+1)};
}

function zoneParts(date,timeZone){
  try{return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));}
  catch{fail('Kalender verwendet eine unbekannte Zeitzone',{code:'ICS_TIMEZONE_UNSUPPORTED'});}
}

function localToUtc(parts,timeZone){
  const target=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second),probe=new Date(target),shown=zoneParts(probe,timeZone),offset=Date.UTC(Number(shown.year),Number(shown.month)-1,Number(shown.day),Number(shown.hour),Number(shown.minute),Number(shown.second))-target;
  let result=target-offset;
  const verify=zoneParts(new Date(result),timeZone),secondOffset=Date.UTC(Number(verify.year),Number(verify.month)-1,Number(verify.day),Number(verify.hour),Number(verify.minute),Number(verify.second))-result;
  result=target-secondOffset;
  return new Date(result).toISOString();
}

function parseDate(value,params={},defaultTimeZone='UTC'){
  const raw=String(value||'').trim(),dateOnly=/^(\d{4})(\d{2})(\d{2})$/.exec(raw),dateTime=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if(dateOnly){const parts={year:Number(dateOnly[1]),month:Number(dateOnly[2]),day:Number(dateOnly[3])},date=new Date(Date.UTC(parts.year,parts.month-1,parts.day));if(date.getUTCFullYear()!==parts.year||date.getUTCMonth()!==parts.month-1||date.getUTCDate()!==parts.day)fail('Kalender enthält ein ungültiges Datum',{code:'ICS_DATE_INVALID'});return {iso:date.toISOString(),allDay:true,timeZone:params.TZID||defaultTimeZone};}
  if(!dateTime)fail('Kalender enthält ein ungültiges Datum',{code:'ICS_DATE_INVALID'});
  const parts={year:Number(dateTime[1]),month:Number(dateTime[2]),day:Number(dateTime[3]),hour:Number(dateTime[4]),minute:Number(dateTime[5]),second:Number(dateTime[6])},timeZone=dateTime[7]?'UTC':params.TZID||defaultTimeZone;
  const basic=new Date(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second));if(basic.getUTCFullYear()!==parts.year||basic.getUTCMonth()!==parts.month-1||basic.getUTCDate()!==parts.day||basic.getUTCHours()!==parts.hour||basic.getUTCMinutes()!==parts.minute||basic.getUTCSeconds()!==parts.second)fail('Kalender enthält ein ungültiges Datum',{code:'ICS_DATE_INVALID'});
  const iso=dateTime[7]?new Date(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)).toISOString():localToUtc(parts,timeZone);
  if(Number.isNaN(new Date(iso).getTime()))fail('Kalender enthält ein ungültiges Datum',{code:'ICS_DATE_INVALID'});
  return {iso,allDay:false,timeZone};
}

function parseRule(value,defaultTimeZone){
  if(!value)return null;const pairs=Object.fromEntries(String(value).split(';').map(item=>{const index=item.indexOf('=');return index<1?[item,'']:[item.slice(0,index).toUpperCase(),item.slice(index+1)];})),frequency=String(pairs.FREQ||'').toUpperCase();
  if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(frequency))return {supported:false};
  const interval=Math.max(1,Math.min(999,Number(pairs.INTERVAL)||1)),count=pairs.COUNT?Math.max(1,Math.min(10000,Number(pairs.COUNT)||1)):null,until=pairs.UNTIL?parseDate(pairs.UNTIL,{},defaultTimeZone).iso:null,byDay=pairs.BYDAY?pairs.BYDAY.split(',').map(item=>item.toUpperCase()).filter(item=>/^[+-]?\d{0,2}(?:MO|TU|WE|TH|FR|SA|SU)$/.test(item)).slice(0,31):[];
  return {supported:true,frequency,interval,count,until,byDay};
}

function eventFromProperties(entries,{accountId,calendarId,defaultTimeZone}){
  const first=name=>entries.find(item=>item.name===name),uid=safeText(first('UID')?.value,300),startProperty=first('DTSTART');if(!uid||!startProperty)return null;
  const start=parseDate(startProperty.value,startProperty.params,defaultTimeZone),endProperty=first('DTEND'),end=endProperty?parseDate(endProperty.value,endProperty.params,start.timeZone):null,recurrenceProperty=first('RECURRENCE-ID'),recurrenceId=recurrenceProperty?parseDate(recurrenceProperty.value,recurrenceProperty.params,start.timeZone).iso:null,title=safeText(unescapeText(first('SUMMARY')?.value||'(Ohne Titel)'),500)||'(Ohne Titel)',status=safeText(first('STATUS')?.value||'CONFIRMED',30).toLowerCase(),sequence=Math.max(0,Number(first('SEQUENCE')?.value)||0),updatedProperty=first('LAST-MODIFIED')||first('DTSTAMP'),updatedAt=updatedProperty?parseDate(updatedProperty.value,updatedProperty.params,'UTC').iso:null,recurrence=parseRule(first('RRULE')?.value,start.timeZone),identity={accountId,calendarId,uid,recurrenceId};
  return {schema:'agentone.calendar.event/v1',accountId:safeText(accountId,100),calendarId:safeText(calendarId,300),providerId:uid,uid,idempotencyKey:hash(identity),revisionKey:hash({identity,title,start:start.iso,end:end?.iso||null,status,sequence,recurrence}),title,start:start.iso,end:end?.iso||null,timeZone:start.timeZone,allDay:start.allDay,status,recurrenceId,recurrence,sequence,updatedAt,source:'ics-calendar',privacy:{descriptionStored:false,locationStored:false,attendeesStored:false}};
}

export function parseIcsCalendar(input,{accountId='ics',calendarId='default',defaultTimeZone='UTC',now=new Date(),retentionDays=400,retentionLimit=10_000,maxBytes=MAX_BYTES}={}){
  const buffer=Buffer.isBuffer(input)?input:Buffer.from(String(input??''),'utf8'),limit=Math.min(MAX_BYTES,Math.max(1,Number(maxBytes)||MAX_BYTES));
  if(!buffer.length)fail('Kalenderdatei ist leer',{code:'ICS_EMPTY'});if(buffer.length>limit)fail('Kalenderdatei ist zu groß',{code:'ICS_TOO_LARGE',status:413});
  if(!accountId||!calendarId||retentionDays<1||retentionDays>3650||retentionLimit<1||retentionLimit>20_000)fail('Kalenderimport ist ungültig',{code:'ICS_IMPORT_INVALID'});
  const lines=unfold(buffer.toString('utf8'));if(lines.length>200_000)fail('Kalenderdatei enthält zu viele Zeilen',{code:'ICS_TOO_COMPLEX',status:413});if(!lines.some(line=>line.toUpperCase()==='BEGIN:VCALENDAR')||!lines.some(line=>line.toUpperCase()==='END:VCALENDAR'))fail('Kalenderstruktur ist ungültig',{code:'ICS_STRUCTURE_INVALID'});
  const events=[],seen=new Map();let current=null,parsedCount=0;
  for(const line of lines){const upper=line.toUpperCase();if(upper==='BEGIN:VEVENT'){if(current)fail('Kalenderstruktur ist ungültig',{code:'ICS_STRUCTURE_INVALID'});current=[];continue;}if(upper==='END:VEVENT'){if(!current)continue;const event=eventFromProperties(current,{accountId,calendarId,defaultTimeZone});parsedCount+=1;if(event)seen.set(event.idempotencyKey,event);current=null;if(seen.size>MAX_EVENTS)fail('Kalender enthält zu viele Termine',{code:'ICS_TOO_COMPLEX',status:413});continue;}if(current){const item=property(line);if(item)current.push(item);}}if(current)fail('Kalenderstruktur ist unvollständig',{code:'ICS_STRUCTURE_INVALID'});
  const currentTime=now instanceof Date?now:new Date(now);if(Number.isNaN(currentTime.getTime()))fail('Importzeitpunkt ist ungültig',{code:'ICS_IMPORT_INVALID'});const oldest=currentTime.getTime()-retentionDays*86_400_000;
  for(const event of seen.values()){const edge=new Date(event.end||event.start).getTime();if(Number.isFinite(edge)&&edge>=oldest)events.push(event);}
  events.sort((a,b)=>String(a.start).localeCompare(String(b.start)));const retained=events.slice(-retentionLimit);
  return {schema:'agentone.ics-calendar-sync/v1',accountId:safeText(accountId,100),calendarId:safeText(calendarId,300),syncedAt:currentTime.toISOString(),events:retained,stats:{parsed:parsedCount,unique:seen.size,retained:retained.length,deduplicated:Math.max(0,parsedCount-seen.size),expired:Math.max(0,seen.size-events.length),truncated:Math.max(0,events.length-retained.length)},policy:{readOnly:true,descriptionStored:false,locationStored:false,attendeesStored:false,secretsExposed:false}};
}

async function limitedBody(response,maxBytes){
  const declared=response.headers?.get?.('content-length');if(declared&&Number(declared)>maxBytes)fail('Kalenderdatei ist zu groß',{code:'ICS_TOO_LARGE',status:413});
  if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();fail('Kalenderdatei ist zu groß',{code:'ICS_TOO_LARGE',status:413});}chunks.push(Buffer.from(value));}return Buffer.concat(chunks,size);}
  if(response.body?.[Symbol.asyncIterator]){const chunks=[];let size=0;for await(const value of response.body){const chunk=Buffer.from(value);size+=chunk.length;if(size>maxBytes){response.body.destroy?.();fail('Kalenderdatei ist zu groß',{code:'ICS_TOO_LARGE',status:413});}chunks.push(chunk);}return Buffer.concat(chunks,size);}
  const data=response.arrayBuffer?Buffer.from(await response.arrayBuffer()):Buffer.alloc(0);if(data.length>maxBytes)fail('Kalenderdatei ist zu groß',{code:'ICS_TOO_LARGE',status:413});return data;
}

export async function fetchIcsCalendar({url,fetchImpl=fetch,lookup=dns.lookup,httpsRequestImpl=https.request,timeoutMs=12_000,maxBytes=MAX_BYTES,signal,...options}={}){
  let endpoint,addresses;try{({endpoint,addresses}=await validateAndResolveFeed(url,lookup));}catch{fail('Kalender-URL wurde aus Sicherheitsgründen abgelehnt',{code:'ICS_ENDPOINT_REJECTED'});}
  const timeoutSignal=AbortSignal.timeout(Math.max(1000,Math.min(30_000,Number(timeoutMs)||12_000))),requestOptions={method:'GET',headers:{accept:'text/calendar, text/plain;q=0.8'},redirect:'error',signal:signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal};
  let response;try{response=fetchImpl===fetch?await pinnedHttpsFetch(endpoint,requestOptions,addresses,httpsRequestImpl):await fetchImpl(endpoint,requestOptions);}catch{fail('Kalenderquelle ist vorübergehend nicht erreichbar',{code:'ICS_SOURCE_UNAVAILABLE',status:503,retryable:true});}
  if(!response.ok){discardResponseBody(response);if(response.status===401||response.status===403)fail('Kalenderfreigabe ist ungültig oder abgelaufen',{code:'ICS_AUTHORIZATION_REQUIRED',status:401});if(response.status===429||response.status>=500)fail('Kalenderquelle ist vorübergehend nicht erreichbar',{code:'ICS_SOURCE_UNAVAILABLE',status:503,retryable:true});fail('Kalenderquelle konnte nicht gelesen werden',{code:'ICS_SOURCE_REJECTED',status:422});}
  const limit=Math.min(MAX_BYTES,Math.max(1,Number(maxBytes)||MAX_BYTES));let data;try{data=await limitedBody(response,limit);}catch(error){if(error instanceof IcsCalendarError)throw error;fail('Kalenderquelle ist vorübergehend nicht erreichbar',{code:'ICS_SOURCE_UNAVAILABLE',status:503,retryable:true});}const snapshot=parseIcsCalendar(data,{...options,maxBytes:limit});return {...snapshot,source:{type:'https-ics',endpointHash:hash(endpoint.origin+endpoint.pathname)}};
}

export function publicIcsError(error){return error instanceof IcsCalendarError?error.toPublicJSON():new IcsCalendarError('Kalender konnte nicht verarbeitet werden').toPublicJSON();}

export const icsCalendarInternals=Object.freeze({createPinnedLookup,normalizeFeedUrl,parseDate,parseRule,unfold});
