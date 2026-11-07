import { normalizeWhoopBundle, verifyWhoopWebhook } from './personal-health.mjs';

const WHOOP_API='https://api.prod.whoop.com/developer/v2';
const WHOOP_TOKEN='https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_REVOKE=`${WHOOP_API}/user/access`;
const READ_SCOPES=Object.freeze(['read:cycles','read:recovery','read:sleep','read:workout','read:body_measurement']);
const ALLOWED_SCOPES=new Set(['offline',...READ_SCOPES]);
const COLLECTIONS=Object.freeze([
  ['cycles','cycle','read:cycles'],
  ['recoveries','recovery','read:recovery'],
  ['sleeps','activity/sleep','read:sleep'],
  ['workouts','activity/workout','read:workout'],
]);
const WEBHOOK_TYPES=new Set(['recovery.updated','recovery.deleted','sleep.updated','sleep.deleted','workout.updated','workout.deleted']);

export class WhoopSyncError extends Error{
  constructor(message,options={}){super(message);Object.assign(this,{code:options.code||'WHOOP_SYNC_FAILED',status:options.status||400,retryable:Boolean(options.retryable),retryAfterSeconds:options.retryAfterSeconds??null,stage:options.stage||'sync'});}
  toPublicJSON(){return {provider:'whoop',code:this.code,stage:this.stage,status:this.status,retryable:this.retryable,retryAfterSeconds:this.retryAfterSeconds,message:this.message,secretsExposed:false};}
}

function clean(value,max=180){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function iso(value,label='Zeitstempel'){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw whoopError(`${label} ist ungültig`,'WHOOP_INPUT_INVALID');return date.toISOString();}
function whoopError(message,code='WHOOP_SYNC_FAILED',{status=400,retryable=false,retryAfterSeconds=null,stage='sync'}={}){return new WhoopSyncError(message,{code,status,retryable,retryAfterSeconds,stage});}
function assertCredentials({clientId,clientSecret}){if(!clean(clientId,512)||!clean(clientSecret,2048))throw whoopError('WHOOP Client-ID und Client-Secret fehlen','WHOOP_CONFIGURATION_REQUIRED',{status:503,stage:'oauth'});}
function allowedScopes(scopes){const values=Array.isArray(scopes)?scopes:String(scopes??'').split(/\s+/);return [...new Set(values.map(value=>clean(value)).filter(scope=>ALLOWED_SCOPES.has(scope)))];}
function retryAfter(response){const raw=response.headers?.get?.('retry-after');if(raw&&/^\d+$/.test(raw))return Number(raw);const date=Date.parse(raw);if(Number.isFinite(date))return Math.max(0,Math.ceil((date-Date.now())/1000));const reset=response.headers?.get?.('x-ratelimit-reset');return reset&&/^\d+$/.test(reset)?Number(reset):null;}
function publicFailure(response,stage){if(response.status===401)return whoopError('WHOOP muss erneut verbunden werden.','WHOOP_AUTHORIZATION_REQUIRED',{status:401,stage});if(response.status===429)return whoopError('WHOOP begrenzt Anfragen vorübergehend.','WHOOP_RATE_LIMITED',{status:429,retryable:true,retryAfterSeconds:retryAfter(response),stage});if(response.status>=500)return whoopError('WHOOP ist vorübergehend nicht erreichbar.','WHOOP_PROVIDER_UNAVAILABLE',{status:response.status,retryable:true,retryAfterSeconds:retryAfter(response),stage});return whoopError('WHOOP hat die Anfrage abgelehnt.','WHOOP_REQUEST_REJECTED',{status:response.status,stage});}
async function responseJson(response,stage){if(!response.ok)throw publicFailure(response,stage);try{return await response.json();}catch{throw whoopError('WHOOP lieferte keine gültige JSON-Antwort.','WHOOP_INVALID_RESPONSE',{status:502,retryable:true,stage});}}
function tokenSession(payload,{refreshTokenRequired=false}={}){
  const accessToken=clean(payload?.access_token,8192),refreshToken=clean(payload?.refresh_token,8192),expiresInSeconds=Number(payload?.expires_in),scopes=allowedScopes(payload?.scope);
  if(!accessToken||!Number.isFinite(expiresInSeconds)||expiresInSeconds<=0)throw whoopError('WHOOP lieferte keinen nutzbaren Zugriffsschlüssel.','WHOOP_INVALID_TOKEN_RESPONSE',{status:502,retryable:true,stage:'oauth'});
  if(refreshTokenRequired&&!refreshToken)throw whoopError('WHOOP lieferte keinen neuen erneuerbaren Zugriffsschlüssel.','WHOOP_INVALID_TOKEN_RESPONSE',{status:502,retryable:false,stage:'oauth'});
  const value={provider:'whoop',tokenType:clean(payload?.token_type||'bearer',32).toLowerCase(),expiresInSeconds,expiresAt:new Date(Date.now()+expiresInSeconds*1000).toISOString(),scopes,refreshRotated:Boolean(payload?.refresh_token),secretsExposed:false};
  Object.defineProperties(value,{accessToken:{value:accessToken,enumerable:false},refreshToken:{value:refreshToken,enumerable:false}});
  return Object.freeze(value);
}
async function requestToken(parameters,{fetchImpl=fetch,signal,onRotatedRefreshToken,refreshTokenRequired=false}={}){
  let response;try{response=await fetchImpl(WHOOP_TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams(parameters),signal});}catch{throw whoopError('WHOOP-Anmeldung ist vorübergehend nicht erreichbar.','WHOOP_NETWORK_FAILURE',{status:503,retryable:true,stage:'oauth'});}
  if(!response.ok){if(response.status===400||response.status===401)throw whoopError('WHOOP muss erneut verbunden werden.','WHOOP_AUTHORIZATION_REQUIRED',{status:401,stage:'oauth'});throw publicFailure(response,'oauth');}
  const payload=await responseJson(response,'oauth'),session=tokenSession(payload,{refreshTokenRequired});
  if(payload.refresh_token&&onRotatedRefreshToken)await onRotatedRefreshToken(session.refreshToken);
  return session;
}

export async function exchangeWhoopAuthorizationCode({clientId,clientSecret,code,redirectUri,fetchImpl=fetch,signal,onRotatedRefreshToken}={}){
  assertCredentials({clientId,clientSecret});if(!clean(code,4096)||!/^https:\/\//i.test(String(redirectUri??'')))throw whoopError('WHOOP-Code oder HTTPS-Redirect fehlt.','WHOOP_INPUT_INVALID',{stage:'oauth'});
  return requestToken({grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri},{fetchImpl,signal,onRotatedRefreshToken,refreshTokenRequired:true});
}

export async function refreshWhoopToken({clientId,clientSecret,refreshToken,fetchImpl=fetch,signal,onRotatedRefreshToken}={}){
  assertCredentials({clientId,clientSecret});if(!clean(refreshToken,8192))throw whoopError('WHOOP Refresh-Token fehlt.','WHOOP_AUTHORIZATION_REQUIRED',{status:401,stage:'oauth'});
  return requestToken({grant_type:'refresh_token',refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret,scope:'offline'},{fetchImpl,signal,onRotatedRefreshToken,refreshTokenRequired:true});
}

export async function revokeWhoopAccess({accessToken,fetchImpl=fetch,signal}={}){
  const token=clean(accessToken,8192);if(!token)throw whoopError('WHOOP Zugriffsschlüssel fehlt.','WHOOP_AUTHORIZATION_REQUIRED',{status:401,stage:'revoke'});
  let response;try{response=await fetchImpl(WHOOP_REVOKE,{method:'DELETE',headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal});}catch{throw whoopError('WHOOP-Widerruf ist vorübergehend nicht erreichbar.','WHOOP_NETWORK_FAILURE',{status:503,retryable:true,stage:'revoke'});}
  if(response.status===204)return Object.freeze({provider:'whoop',revoked:true,alreadyRevoked:false,secretsExposed:false});
  throw publicFailure(response,'revoke');
}

async function whoopJson(url,{accessToken,fetchImpl,signal,stage}){let response;try{response=await fetchImpl(url,{headers:{authorization:`Bearer ${accessToken}`,accept:'application/json'},signal});}catch{throw whoopError('WHOOP-Daten sind vorübergehend nicht erreichbar.','WHOOP_NETWORK_FAILURE',{status:503,retryable:true,stage});}return responseJson(response,stage);}

async function fetchCollection(path,{accessToken,fetchImpl,signal,start,end,maxPages=40,maxRecords=1000}={}){
  const records=[],tokens=new Set();let nextToken=null,pages=0;
  do{
    if(pages>=maxPages)throw whoopError('WHOOP-Datenrückstand überschreitet das sichere Seitenlimit.','WHOOP_BACKLOG_TOO_LARGE',{status:503,retryable:true,stage:path});
    const url=new URL(`${WHOOP_API}/${path}`);url.searchParams.set('limit','25');if(start)url.searchParams.set('start',start);if(end)url.searchParams.set('end',end);if(nextToken)url.searchParams.set('nextToken',nextToken);
    const payload=await whoopJson(url,{accessToken,fetchImpl,signal,stage:path});if(!Array.isArray(payload.records))throw whoopError('WHOOP-Sammlung hat ein ungültiges Schema.','WHOOP_INVALID_RESPONSE',{status:502,retryable:true,stage:path});records.push(...payload.records);if(records.length>maxRecords)throw whoopError('WHOOP-Datenrückstand überschreitet das sichere Datensatzlimit.','WHOOP_BACKLOG_TOO_LARGE',{status:503,retryable:true,stage:path});
    nextToken=clean(payload.next_token,2048)||null;if(nextToken&&tokens.has(nextToken))throw whoopError('WHOOP-Paginierung wiederholt denselben Cursor.','WHOOP_CURSOR_LOOP',{status:502,retryable:true,stage:path});if(nextToken)tokens.add(nextToken);pages+=1;
  }while(nextToken);
  return {records,pages};
}

function resolveWindow({cursor,start,end,now,retentionDays,overlapHours}){const finish=iso(end??now,'Sync-Ende'),floor=new Date(new Date(finish).getTime()-retentionDays*86_400_000),cursorDate=cursor?.syncedThrough?new Date(cursor.syncedThrough):null,requested=start?new Date(start):null;let begin=requested&&Number.isFinite(requested.getTime())?requested:cursorDate&&Number.isFinite(cursorDate.getTime())?new Date(cursorDate.getTime()-overlapHours*3_600_000):floor;if(begin<floor)begin=floor;if(begin>=new Date(finish))throw whoopError('WHOOP-Sync-Zeitraum ist leer.','WHOOP_INPUT_INVALID');return {start:begin.toISOString(),end:finish};}
function retainMetrics(previous,current,{now,retentionDays,retentionLimit}){const cutoff=new Date(now).getTime()-retentionDays*86_400_000,map=new Map();for(const item of [...(Array.isArray(previous)?previous:[]),...(Array.isArray(current)?current:[])])if(item?.id&&new Date(item.startAt).getTime()>=cutoff)map.set(item.id,item);return [...map.values()].sort((a,b)=>new Date(b.startAt)-new Date(a.startAt)).slice(0,retentionLimit);}

export async function syncWhoopReadOnly({clientId,clientSecret,refreshToken,consent,cursor=null,previousMetrics=[],grantedScopes=READ_SCOPES,fetchImpl=fetch,signal,onRotatedRefreshToken,now=new Date(),start,end,retentionDays=120,retentionLimit=20_000,overlapHours=6,maxPages=40,maxRecords=1000}={}){
  if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>730||!Number.isInteger(retentionLimit)||retentionLimit<1||retentionLimit>50_000)throw whoopError('WHOOP-Retention ist ungültig.','WHOOP_INPUT_INVALID');
  const session=await refreshWhoopToken({clientId,clientSecret,refreshToken,fetchImpl,signal,onRotatedRefreshToken}),sessionReadScopes=session.scopes.filter(scope=>READ_SCOPES.includes(scope)),tokenScopes=sessionReadScopes.length?session.scopes:allowedScopes(['offline',...grantedScopes]),requestedScopes=new Set(allowedScopes(grantedScopes)),scopes=new Set(tokenScopes.filter(scope=>scope==='offline'||requestedScopes.has(scope))),window=resolveWindow({cursor,start,end,now,retentionDays,overlapHours});
  const requested=COLLECTIONS.filter(([, ,scope])=>scopes.has(scope)),settlements=await Promise.allSettled(requested.map(async([key,path])=>[key,await fetchCollection(path,{accessToken:session.accessToken,fetchImpl,signal,start:window.start,end:window.end,maxPages,maxRecords})]));
  const bundle={cycles:[],recoveries:[],sleeps:[],workouts:[]},stats={},failures=[];for(let index=0;index<settlements.length;index+=1){const settlement=settlements[index],key=requested[index][0];if(settlement.status==='fulfilled'){const [,result]=settlement.value;bundle[key]=result.records;stats[key]={records:result.records.length,pages:result.pages,status:'LIVE'};}else{const error=settlement.reason,publicError=typeof error?.toPublicJSON==='function'?error.toPublicJSON():whoopError('WHOOP-Teilquelle ist vorübergehend nicht erreichbar.','WHOOP_PROVIDER_UNAVAILABLE',{status:503,retryable:true,stage:key}).toPublicJSON();failures.push({component:key,...publicError});stats[key]={records:0,pages:0,status:'DEGRADED'};}}
  if(scopes.has('read:body_measurement'))try{bundle.bodyMeasurement=await whoopJson(`${WHOOP_API}/user/measurement/body`,{accessToken:session.accessToken,fetchImpl,signal,stage:'body_measurement'});stats.bodyMeasurement={records:1,pages:1,status:'LIVE'};}catch(error){failures.push({component:'bodyMeasurement',...(typeof error?.toPublicJSON==='function'?error.toPublicJSON():whoopError('WHOOP-Körpermessung ist vorübergehend nicht erreichbar.','WHOOP_PROVIDER_UNAVAILABLE',{status:503,retryable:true,stage:'body_measurement'}).toPublicJSON())});stats.bodyMeasurement={records:0,pages:0,status:'DEGRADED'};}
  const attempted=requested.length+(scopes.has('read:body_measurement')?1:0);if(!attempted)throw whoopError('Kein freigegebener WHOOP-Lesebereich ist verfügbar.','WHOOP_SCOPE_REQUIRED',{status:403});if(failures.length===attempted){const firstRejected=settlements.find(item=>item.status==='rejected');if(firstRejected?.reason?.toPublicJSON)throw firstRejected.reason;throw whoopError('WHOOP-Daten konnten nicht synchronisiert werden.','WHOOP_SYNC_FAILED',{status:503,retryable:true});}
  const normalized=normalizeWhoopBundle(bundle,{consent,receivedAt:window.end}),metrics=retainMetrics(previousMetrics,normalized.metrics,{now:window.end,retentionDays,retentionLimit}),live=failures.length===0;
  return {schema:'agentone.whoop-sync/v1',provider:'whoop',status:live?'LIVE':'PARTIAL',syncedAt:window.end,window,metrics,cursor:live?{syncedThrough:window.end,overlapHours}:cursor,stats,failures,excludedByConsent:normalized.excludedByConsent,duplicatesRemoved:normalized.duplicatesRemoved+Math.max(0,(previousMetrics?.length||0)+normalized.metrics.length-metrics.length),token:{expiresAt:session.expiresAt,refreshRotated:session.refreshRotated,scopes:[...scopes],persisted:false},policy:{readOnly:true,medicalDiagnosis:false,rawRecordsPersisted:false,partialSuccess:!live,accessTokenReturned:false,refreshTokenReturned:false,secretsExposed:false}};
}

function header(headers,name){if(headers?.get)return headers.get(name);const key=Object.keys(headers||{}).find(value=>value.toLowerCase()===name.toLowerCase());return key?headers[key]:undefined;}
export function prepareWhoopWebhookEnvelope({rawBody,headers={},secret,replayCache=new Set(),now=Date.now(),toleranceMs=5*60_000}={}){
  const body=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(String(rawBody??''),'utf8');if(!body.length||body.length>65_536)throw whoopError('WHOOP-Webhook ist leer oder zu groß.','WHOOP_WEBHOOK_INVALID',{status:400,stage:'webhook'});
  const signature=header(headers,'x-whoop-signature'),timestamp=header(headers,'x-whoop-signature-timestamp');if(!verifyWhoopWebhook({rawBody:body,signature,timestamp,secret,now,toleranceMs}))throw whoopError('WHOOP-Webhook-Signatur ist ungültig.','WHOOP_WEBHOOK_SIGNATURE_INVALID',{status:401,stage:'webhook'});
  let payload;try{payload=JSON.parse(body.toString('utf8'));}catch{throw whoopError('WHOOP-Webhook enthält kein gültiges JSON.','WHOOP_WEBHOOK_INVALID',{status:400,stage:'webhook'});}const type=clean(payload.type,80),traceId=clean(payload.trace_id,128),resourceId=clean(payload.id,128),whoopUserId=clean(payload.user_id,80),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;if(!WEBHOOK_TYPES.has(type)||!uuid.test(traceId)||!uuid.test(resourceId)||!/^\d{1,20}$/.test(whoopUserId))throw whoopError('WHOOP-Webhook-Schema ist ungültig.','WHOOP_WEBHOOK_INVALID',{status:400,stage:'webhook'});if(replayCache.has(traceId))throw whoopError('WHOOP-Webhook wurde bereits angenommen.','WHOOP_WEBHOOK_REPLAY',{status:409,stage:'webhook'});replayCache.add(traceId);
  return Object.freeze({schema:'agentone.whoop-webhook-envelope/v1',provider:'whoop',traceId,whoopUserId,resourceId,type,operation:type.endsWith('.deleted')?'delete':'refresh',receivedAt:new Date(now).toISOString(),signatureVerified:true,queued:false,rawBodyRetained:false,secretsExposed:false});
}

export const whoopLiveSyncCapabilities=Object.freeze({apiVersion:'v2',authorization:'oauth2-authorization-code',tokenRotation:true,revocation:{method:'DELETE',path:'user/access',successStatus:204},scopes:['offline',...READ_SCOPES],collections:COLLECTIONS.map(([id,path,scope])=>({id,path,scope})),bodyMeasurementPath:'user/measurement/body',webhookModel:'v2',webhookQueueRequired:true});
