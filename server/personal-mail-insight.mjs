import crypto from 'node:crypto';

const USER_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;
const ACCOUNT_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEFAULT_MAX_BYTES=128*1024;
const DEFAULT_TIMEOUT_MS=8_000;

function insightError(message,code='MAIL_INSIGHT_INVALID',status=400,{retryable=false}={}){
  return Object.assign(new Error(message),{code,status,retryable});
}

function clean(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function hash(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function safeInteger(value,{min=1,max=Number.MAX_SAFE_INTEGER}={}){const number=Number(value);return Number.isSafeInteger(number)&&number>=min&&number<=max?number:null;}
function same(left,right){return String(left??'')===String(right??'');}

function assertBinding({request,account,message}){
  const requestedUser=String(request?.userId??''),requestedAccount=String(request?.accountId??''),requestedUid=safeInteger(request?.uid),requestedValidity=String(request?.uidValidity??'');
  if(!USER_ID_PATTERN.test(requestedUser)||!ACCOUNT_ID_PATTERN.test(requestedAccount)||!requestedUid||!/^\d{1,40}$/.test(requestedValidity))throw insightError('Mail-Nachricht wurde nicht gefunden','MAIL_INSIGHT_NOT_FOUND',404);
  const valid=account&&message&&same(account.userId,requestedUser)&&same(message.userId,requestedUser)&&same(account.id,requestedAccount)&&same(message.accountId,requestedAccount)&&same(message.uid,requestedUid)&&same(account.uidValidity,requestedValidity)&&same(message.uidValidity,requestedValidity);
  if(!valid)throw insightError('Mail-Nachricht wurde nicht gefunden','MAIL_INSIGHT_NOT_FOUND',404);
  return Object.freeze({userId:requestedUser,accountId:requestedAccount,uid:requestedUid,uidValidity:requestedValidity});
}

function decodeEntities(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_match,entity)=>{if(entity[0]!=='#')return named[entity.toLowerCase()]??' ';const radix=entity[1].toLowerCase()==='x'?16:10,raw=entity.slice(radix===16?2:1),code=Number.parseInt(raw,radix);return Number.isFinite(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';});
}

export function sanitizeMailInsightContent({text='',html=''}={}){
  let value=String(text||'');
  if(!value&&html){
    value=String(html)
      .replace(/<!--[\s\S]*?-->/g,' ')
      .replace(/<(script|style|head|svg|canvas|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
      .replace(/<(img|link|meta|source|video|audio|track|input)[^>]*>/gi,' ')
      .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi,'\n')
      .replace(/<[^>]+>/g,' ');
  }
  return decodeEntities(value)
    .replace(/(?:https?:\/\/|data:)[^\s<>()]+/gi,' [REMOTE_CONTENT_REMOVED] ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ')
    .replace(/[ \t]+/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}

async function boundedFetch(fetchMessage,input,{timeoutMs}){
  if(typeof fetchMessage!=='function')throw insightError('Mail-Abruf ist nicht verfügbar','MAIL_INSIGHT_FETCH_UNAVAILABLE',503,{retryable:true});
  const controller=new AbortController();let timer;
  const timeout=new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(insightError('Mail-Abruf hat das Zeitlimit überschritten','MAIL_INSIGHT_FETCH_TIMEOUT',504,{retryable:true}));},timeoutMs);timer.unref?.();});
  try{return await Promise.race([Promise.resolve().then(()=>fetchMessage({...input,signal:controller.signal})),timeout]);}
  catch(error){if(error?.code==='MAIL_INSIGHT_FETCH_TIMEOUT'||controller.signal.aborted)throw insightError('Mail-Abruf hat das Zeitlimit überschritten','MAIL_INSIGHT_FETCH_TIMEOUT',504,{retryable:true});throw insightError('Mail-Inhalt konnte nicht sicher gelesen werden','MAIL_INSIGHT_FETCH_FAILED',502,{retryable:true});}
  finally{clearTimeout(timer);}
}

function fetchedContent(value,maxBytes){
  if(!value||typeof value!=='object'||Array.isArray(value))throw insightError('Mail-Inhalt ist ungültig','MAIL_INSIGHT_FETCH_INVALID',502);
  if((Array.isArray(value.attachments)&&value.attachments.length)||value.remoteContentFetched===true)throw insightError('Mail-Abruf verletzte die sichere Inhaltsrichtlinie','MAIL_INSIGHT_FETCH_POLICY_VIOLATION',502);
  const text=typeof value.text==='string'?value.text:'',html=typeof value.html==='string'?value.html:'',actualBytes=Buffer.byteLength(text,'utf8')+Buffer.byteLength(html,'utf8'),declaredBytes=value.bytes==null?actualBytes:safeInteger(value.bytes,{min:0,max:Number.MAX_SAFE_INTEGER});
  if(declaredBytes==null)throw insightError('Mail-Größe ist ungültig','MAIL_INSIGHT_FETCH_INVALID',502);
  const bytes=Math.max(actualBytes,declaredBytes);if(bytes>maxBytes)throw insightError('Mail-Inhalt überschreitet das sichere Analyselimit','MAIL_INSIGHT_TOO_LARGE',413);
  return {content:sanitizeMailInsightContent({text,html}),bytes,attachmentsExcluded:safeInteger(value.attachmentCount??0,{min:0,max:100_000})??0};
}

function explicitDate(value){
  let match=String(value).match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/),date;
  if(match)date=`${match[1]}-${match[2]}-${match[3]}`;
  if(!date){match=String(value).match(/\b([0-2]?\d|3[01])[.\/-](0?\d|1[0-2])[.\/-](20\d{2})\b/);if(match)date=`${match[3]}-${String(match[2]).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`;}
  if(!date)return null;const parsed=new Date(`${date}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;
}

function explicitTime(value){const match=String(value).match(/\b(?:um|at)?\s*(?:([01]?\d|2[0-3]):([0-5]\d)|([01]?\d|2[0-3])\s*Uhr)\b/i),hour=match?.[1]??match?.[3];return match?`${String(hour).padStart(2,'0')}:${match[2]||'00'}`:null;}

function deterministicInsight(content){
  const normalized=content.toLocaleLowerCase('de-DE'),request=/(?:\bbitte\b|\bkannst du\b|\bantworte\b|\bbestätige\b|\bprüfe\b|\bsende\b|\berledige\b|\bplease\b|\breply\b|\bconfirm\b|\breview\b|action required)/i.test(normalized),urgent=/(?:\bdringend\b|\bsofort\b|\beilig\b|\burgent\b|\basap\b)/i.test(normalized),calendar=/(?:\btermin\b|\btreffen\b|\bbesprechung\b|\bmeeting\b|\bcall\b|\bzoom\b|\bteams\b)/i.test(normalized),deadline=/(?:\bfrist\b|\bdeadline\b|\bspätestens\b|\bbis zum\b|\bby\b)/i.test(normalized),date=explicitDate(content),time=explicitTime(content),signals=[];
  if(request)signals.push('REQUEST');if(urgent)signals.push('URGENT');if(deadline&&date)signals.push('DEADLINE');if(calendar&&date)signals.push('CALENDAR_CANDIDATE');
  const actionRequired=request||Boolean(deadline&&date),calendarCandidate=Boolean(calendar&&date),classification=calendarCandidate?'CALENDAR_CANDIDATE':actionRequired?'ACTION':'INFORMATION',confidence=Math.min(0.9,0.35+signals.length*0.13+(date?0.08:0));
  const summary=calendarCandidate?'Möglicher Termin erkannt; vor einer Übernahme müssen Zeit und Kalender geprüft werden.':actionRequired?'Handlungsbedarf erkannt; Inhalt und Ziel müssen vor einer Aktion bestätigt werden.':'Keine eindeutige Aktion erkannt; die Nachricht bleibt zur manuellen Prüfung verfügbar.';
  return {summary,classification,actionRequired,urgency:urgent?'HIGH':'NORMAL',signals,confidence:Number(confidence.toFixed(2)),date,time,calendarCandidate,deadlineCandidate:Boolean(deadline&&date)};
}

function calendarDraft({insight,message,timeZone}){
  if(!insight.date)return null;const kind=insight.calendarCandidate?'MEETING':'DEADLINE',title=clean(message.subject||'(Ohne Betreff)',180)||'(Ohne Betreff)',durationMinutes=kind==='MEETING'?30:0;
  return Object.freeze({kind,title,date:insight.date,time:insight.time,allDay:!insight.time,durationMinutes,timeZone,readOnlyDraft:true,requiresHumanApproval:true});
}

export async function createPersonalMailInsight({request,account,message,fetchMessage,maxBytes=DEFAULT_MAX_BYTES,timeoutMs=DEFAULT_TIMEOUT_MS,timeZone='Europe/Berlin',now=new Date()}={}){
  const binding=assertBinding({request,account,message}),byteLimit=safeInteger(maxBytes,{min:1,max:1024*1024}),timeLimit=safeInteger(timeoutMs,{min:10,max:30_000});if(!byteLimit||!timeLimit)throw insightError('Mail-Analyselimit ist ungültig');
  const fetched=await boundedFetch(fetchMessage,{userId:binding.userId,accountId:binding.accountId,uid:binding.uid,uidValidity:binding.uidValidity,maxBytes:byteLimit,includeAttachments:false,remoteContent:false,bodyParts:['text/plain','text/html']},{timeoutMs:timeLimit}),safe=fetchedContent(fetched,byteLimit),analysis=deterministicInsight(safe.content),draft=calendarDraft({insight:analysis,message,timeZone:clean(timeZone,100)||'Europe/Berlin'}),createdAt=new Date(now);if(!Number.isFinite(createdAt.getTime()))throw insightError('Analysezeit ist ungültig');
  const insightId=hash(`${binding.userId}\n${binding.accountId}\n${binding.uidValidity}\n${binding.uid}`),messageIdentity={accountId:binding.accountId,uid:binding.uid,uidValidity:binding.uidValidity,idempotencyKey:clean(message.idempotencyKey,128)||null,threadKey:clean(message.threadKey,128)||null,sender:clean(message.sender,320)||null,subject:clean(message.subject,500)||'(Ohne Betreff)',receivedAt:new Date(message.receivedAt||0).toString()==='Invalid Date'?null:new Date(message.receivedAt).toISOString()};
  const publicInsight={summary:analysis.summary,classification:analysis.classification,actionRequired:analysis.actionRequired,urgency:analysis.urgency,signals:analysis.signals,confidence:analysis.confidence};
  return Object.freeze({schema:'agentone.personal-mail-insight/v1',insightId,createdAt:createdAt.toISOString(),message:messageIdentity,insight:publicInsight,calendarDraft:draft,conflictInput:draft&&!draft.allDay?{date:draft.date,time:draft.time,durationMinutes:draft.durationMinutes,timeZone:draft.timeZone}:null,source:{provider:'imap',mode:'single-message-on-demand',contentBytes:safe.bytes,attachmentsExcluded:safe.attachmentsExcluded},policy:{readOnly:true,singleMessage:true,bodyReturned:false,bodyPersisted:false,attachmentsFetched:false,remoteContentFetched:false,providerMutations:false,requiresHumanAction:true,secretsExposed:false}});
}

export function personalMailInsightAuditProjection(result,{outcome='OK'}={}){
  if(!result||result.schema!=='agentone.personal-mail-insight/v1')throw insightError('Mail-Insight-Ergebnis ist ungültig');
  return Object.freeze({schema:'agentone.personal-mail-insight-audit/v1',insightId:result.insightId,outcome:clean(outcome,40)||'OK',accountId:result.message.accountId,uid:result.message.uid,uidValidity:result.message.uidValidity,classification:result.insight.classification,actionRequired:Boolean(result.insight.actionRequired),calendarDraft:Boolean(result.calendarDraft),contentBytes:Number(result.source.contentBytes)||0,attachmentsExcluded:Number(result.source.attachmentsExcluded)||0,secretsExposed:false,bodyStored:false});
}

export function personalMailInsightPersistenceProjection(result){
  if(!result||result.schema!=='agentone.personal-mail-insight/v1')throw insightError('Mail-Insight-Ergebnis ist ungültig');
  return Object.freeze({schema:'agentone.personal-mail-insight-record/v1',insightId:result.insightId,createdAt:result.createdAt,message:{accountId:result.message.accountId,uid:result.message.uid,uidValidity:result.message.uidValidity,idempotencyKey:result.message.idempotencyKey},insight:{...result.insight},calendarDraft:result.calendarDraft?{...result.calendarDraft}:null,policy:{bodyPersisted:false,attachmentsPersisted:false,secretsExposed:false}});
}

export function publicPersonalMailInsightError(error){
  const known=new Set(['MAIL_INSIGHT_NOT_FOUND','MAIL_INSIGHT_FETCH_UNAVAILABLE','MAIL_INSIGHT_FETCH_TIMEOUT','MAIL_INSIGHT_FETCH_FAILED','MAIL_INSIGHT_FETCH_INVALID','MAIL_INSIGHT_FETCH_POLICY_VIOLATION','MAIL_INSIGHT_TOO_LARGE','MAIL_INSIGHT_INVALID']),code=known.has(error?.code)?error.code:'MAIL_INSIGHT_FAILED',status=Number(error?.status)||500;
  return Object.freeze({status:status>=400&&status<=599?status:500,error:code,message:code==='MAIL_INSIGHT_TOO_LARGE'?'Diese Nachricht ist für die sichere Einmalanalyse zu groß.':code==='MAIL_INSIGHT_NOT_FOUND'?'Die ausgewählte Nachricht ist nicht mehr verfügbar.':code==='MAIL_INSIGHT_FETCH_TIMEOUT'?'Das Postfach antwortet zu langsam. Bitte später erneut versuchen.':'Die Nachricht konnte nicht sicher analysiert werden.',retryable:Boolean(error?.retryable),secretsExposed:false});
}
