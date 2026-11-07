import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWhoopAuthorizationUrl } from './personal-health.mjs';
import { whoopLiveSyncCapabilities } from './whoop-live-sync.mjs';

const CALLBACK_PATH='/agentone/whoop/callback';
const DEFAULT_SCOPES=Object.freeze(['offline','read:cycles','read:recovery','read:sleep','read:workout']);
const OPTIONAL_SCOPES=Object.freeze(['read:body_measurement']);
const ALL_SCOPES=new Set([...DEFAULT_SCOPES,...OPTIONAL_SCOPES]);

function onboardingError(message,code='WHOOP_ONBOARDING_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function clean(value,max=2048){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function digest(value){return createHash('sha256').update(String(value??'')).digest('base64url');}
function constantEqual(left,right){const a=Buffer.from(String(left??'')),b=Buffer.from(String(right??''));return a.length===b.length&&timingSafeEqual(a,b);}
function parseHttps(value,label){let url;try{url=new URL(String(value??''));}catch{throw onboardingError(`${label} muss eine absolute HTTPS-URL sein.`,'WHOOP_REDIRECT_INVALID');}if(url.protocol!=='https:'||url.username||url.password||url.hash)throw onboardingError(`${label} muss eine absolute HTTPS-URL ohne Zugangsdaten oder Fragment sein.`,'WHOOP_REDIRECT_INVALID');return url;}
function normalizeScopes(values){
  const requested=Array.isArray(values)?[...new Set(values.map(value=>clean(value,80)).filter(Boolean))]:[...DEFAULT_SCOPES];
  const unknown=requested.filter(value=>!ALL_SCOPES.has(value));
  if(unknown.length)throw onboardingError(`Unbekannter WHOOP-Scope: ${unknown.join(', ')}`,'WHOOP_SCOPE_INVALID');
  if(!requested.some(value=>value!=='offline'))throw onboardingError('Mindestens ein WHOOP-Lesebereich ist erforderlich.','WHOOP_SCOPE_REQUIRED');
  if(!requested.includes('offline'))requested.unshift('offline');
  return requested;
}

export function resolveWhoopRedirectUri({publicOrigin,explicitRedirectUri}={}){
  const originValue=clean(publicOrigin),explicitValue=clean(explicitRedirectUri);
  if(!originValue&&!explicitValue)throw onboardingError('WHOOP Public Origin oder Redirect URI fehlt.','WHOOP_REDIRECT_INVALID');
  const explicit=explicitValue?parseHttps(explicitValue,'WHOOP Redirect URI'):null;
  if(explicit&&(explicit.pathname!==CALLBACK_PATH||explicit.search))throw onboardingError(`WHOOP Redirect URI muss auf ${CALLBACK_PATH} ohne Query zeigen.`,'WHOOP_REDIRECT_MISMATCH');
  if(!originValue)return explicit.toString();
  const origin=parseHttps(originValue,'WHOOP Public Origin');origin.pathname='/';origin.search='';
  const expected=new URL(CALLBACK_PATH,origin);
  if(!explicit)return expected.toString();
  if(explicit.origin!==origin.origin)throw onboardingError(`WHOOP Redirect URI muss exakt ${expected.toString()} entsprechen.`,'WHOOP_REDIRECT_MISMATCH');
  return explicit.toString();
}

export function normalizeWhoopOnboardingConfig(input={}){
  const clientId=clean(input.clientId??input.WHOOP_CLIENT_ID,512),clientSecret=clean(input.clientSecret??input.WHOOP_CLIENT_SECRET,4096),stateSecret=clean(input.stateSecret??input.WHOOP_OAUTH_STATE_SECRET,4096),publicOrigin=clean(input.publicOrigin??input.PUBLIC_ORIGIN,2048),explicitRedirectUri=clean(input.redirectUri??input.WHOOP_REDIRECT_URI,2048),scopes=normalizeScopes(input.scopes);
  let redirectUri=null,redirectError=null;try{redirectUri=resolveWhoopRedirectUri({publicOrigin,explicitRedirectUri});}catch(error){redirectError={code:error.code||'WHOOP_REDIRECT_INVALID',message:error.message};}
  const stateSecretStrong=Buffer.byteLength(stateSecret,'utf8')>=32;
  const missing=[!clientId&&'WHOOP_CLIENT_ID',!clientSecret&&'WHOOP_CLIENT_SECRET',!stateSecretStrong&&'WHOOP_OAUTH_STATE_SECRET',!redirectUri&&'WHOOP_REDIRECT_URI'].filter(Boolean),configured=missing.length===0;
  const validationIssue=stateSecret&&!stateSecretStrong?'WHOOP_OAUTH_STATE_SECRET muss mindestens 32 Byte lang sein.':redirectError?.message;
  const config={provider:'whoop',configured,redirectUri,scopes:Object.freeze([...scopes]),missing:Object.freeze([...missing]),reason:configured?null:validationIssue||`Fehlende Konfiguration: ${missing.join(', ')}`,oauth:Object.freeze({flow:'authorization_code',pkceSupported:false,stateRequired:true,stateStorage:'server-side-single-use',tokenRotationRequired:true}),webhook:Object.freeze({routeEnabled:false,queueRequired:true,persistentReplayStoreRequired:true}),secretsExposed:false};
  Object.defineProperties(config,{clientId:{value:clientId,enumerable:false},clientSecret:{value:clientSecret,enumerable:false},stateSecret:{value:stateSecret,enumerable:false}});
  return Object.freeze(config);
}

export function whoopOnboardingStatus({config,connection=null}={}){
  const normalized=normalizeWhoopOnboardingConfig(config||{}),authorizedAt=validIso(connection?.authorizedAt),lastSyncAt=validIso(connection?.lastSync?.syncedAt),connected=Boolean(authorizedAt),syncStatus=clean(connection?.lastSync?.status,40);
  if(!normalized.configured)return {provider:'whoop',status:'NOT_CONFIGURED',configured:false,connected:false,reason:normalized.reason,missing:[...normalized.missing],redirectUri:normalized.redirectUri,scopes:[...normalized.scopes],oauth:normalized.oauth,webhook:normalized.webhook,secretsExposed:false};
  if(connected&&syncStatus==='LIVE'&&lastSyncAt)return {provider:'whoop',status:'LIVE',configured:true,connected:true,reason:null,redirectUri:normalized.redirectUri,scopes:[...normalized.scopes],authorizedAt,lastSyncAt,oauth:normalized.oauth,webhook:normalized.webhook,secretsExposed:false};
  return {provider:'whoop',status:'READY',configured:true,connected,reason:connected?`Letzter Sync ist ${syncStatus||'noch nicht erfolgt'}.`:'Persönliche WHOOP-Freigabe steht noch aus.',redirectUri:normalized.redirectUri,scopes:[...normalized.scopes],authorizedAt,lastSyncAt,oauth:normalized.oauth,webhook:normalized.webhook,secretsExposed:false};
}

export function whoopOnboardingViewModel({config,connection=null}={}){
  const normalized=normalizeWhoopOnboardingConfig(config||{}),status=whoopOnboardingStatus({config:normalized,connection});
  const scopeLabels={offline:'Offline-Zugriff für erneuerbare Sitzungen','read:cycles':'Zyklen','read:recovery':'Erholung','read:sleep':'Schlaf','read:workout':'Training','read:body_measurement':'Körpermaße'};
  const scopes=normalized.scopes.map(id=>({id,label:scopeLabels[id]||id,access:'read-only',optional:OPTIONAL_SCOPES.includes(id)}));
  let cta;
  if(status.status==='NOT_CONFIGURED')cta={state:'CONFIGURE',label:'WHOOP konfigurieren',action:'OPEN_INTEGRATION_SETTINGS',enabled:true};
  else if(status.status==='LIVE')cta={state:'OPEN',label:'Gesundheitsdaten öffnen',action:'OPEN_WHOOP_HEALTH',enabled:true};
  else if(status.connected)cta={state:'CHECK_SYNC',label:'WHOOP-Sync prüfen',action:'OPEN_WHOOP_DETAILS',enabled:true};
  else cta={state:'CONNECT',label:'WHOOP verbinden',action:'START_WHOOP_OAUTH',enabled:true};
  return Object.freeze({id:'whoop',title:'WHOOP',status:status.status,configured:status.configured,connected:status.connected,reason:status.reason,missingEnv:Object.freeze([...normalized.missing]),redirectUri:normalized.redirectUri,scopes:Object.freeze(scopes.map(scope=>Object.freeze(scope))),lastSyncAt:status.lastSyncAt||null,oauth:Object.freeze({flow:'authorization_code',pkceSupported:false}),cta:Object.freeze(cta),secretsExposed:false});
}

function validIso(value){const text=clean(value,80);return text&&Number.isFinite(Date.parse(text))?new Date(text).toISOString():null;}
function signedState(record,stateSecret){const payload=['v1',record.nonce,record.issuedAt,record.expiresAt,record.userRef,record.redirectRef,record.scopes.join(',')].join('.'),signature=createHmac('sha256',stateSecret).update(payload).digest('base64url');return `${record.nonce}_${signature}`;}

export function createWhoopOnboardingStart({config,userId,scopes,now=new Date(),ttlSeconds=600}={}){
  const normalized=normalizeWhoopOnboardingConfig(config||{});if(!normalized.configured)throw onboardingError(normalized.reason||'WHOOP ist nicht konfiguriert.','WHOOP_NOT_CONFIGURED',503);const owner=clean(userId,128);if(!owner)throw onboardingError('Benutzer fehlt.','WHOOP_USER_REQUIRED');if(!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>900)throw onboardingError('WHOOP State-Gültigkeit muss zwischen 60 und 900 Sekunden liegen.','WHOOP_STATE_TTL_INVALID');const issued=new Date(now);if(!Number.isFinite(issued.getTime()))throw onboardingError('WHOOP State-Zeitpunkt ist ungültig.','WHOOP_STATE_INVALID');const requested=Object.freeze(normalizeScopes(scopes??normalized.scopes)),configuredScopes=new Set(normalized.scopes);if(requested.some(scope=>!configuredScopes.has(scope)))throw onboardingError('WHOOP Scope ist für diese Instanz nicht freigegeben.','WHOOP_SCOPE_NOT_CONFIGURED',403);
  const record=Object.freeze({version:1,nonce:randomBytes(24).toString('base64url'),userId:owner,userRef:digest(`${normalized.stateSecret}\u001f${owner}`),redirectRef:digest(normalized.redirectUri),scopes:Object.freeze([...requested]),issuedAt:issued.toISOString(),expiresAt:new Date(issued.getTime()+ttlSeconds*1000).toISOString(),consumedAt:null}),state=signedState(record,normalized.stateSecret),authorizationUrl=createWhoopAuthorizationUrl({clientId:normalized.clientId,redirectUri:normalized.redirectUri,state,scopes:requested});
  const result={provider:'whoop',status:'READY',authorizationUrl,state,expiresAt:record.expiresAt,redirectUri:normalized.redirectUri,scopes:requested,oauth:{flow:'authorization_code',pkceSupported:false,stateRequired:true},secretsExposed:false};Object.defineProperty(result,'stateRecord',{value:record,enumerable:false});return Object.freeze(result);
}

export function verifyWhoopOnboardingState({config,state,stateRecord,userId,redirectUri,now=new Date(),usedNonces}={}){
  const normalized=normalizeWhoopOnboardingConfig(config||{});if(!normalized.configured)throw onboardingError('WHOOP ist nicht konfiguriert.','WHOOP_NOT_CONFIGURED',503);const record=stateRecord;if(!record||record.version!==1||!/^[A-Za-z0-9_-]{24,128}$/.test(String(record.nonce??''))||!Array.isArray(record.scopes))throw onboardingError('WHOOP State-Datensatz fehlt oder ist ungültig.','WHOOP_STATE_INVALID');if(!usedNonces||typeof usedNonces.has!=='function'||typeof usedNonces.add!=='function')throw onboardingError('Ein serverseitiger Single-Use-State-Speicher ist erforderlich.','WHOOP_STATE_STORE_REQUIRED',503);const issuedAt=validIso(record.issuedAt),expiresAt=validIso(record.expiresAt),current=new Date(now);if(!issuedAt||!expiresAt||!Number.isFinite(current.getTime())||current>=new Date(expiresAt)||current<new Date(issuedAt))throw onboardingError('WHOOP State ist abgelaufen.','WHOOP_STATE_EXPIRED',401);const expected=signedState(record,normalized.stateSecret);if(!constantEqual(state,expected))throw onboardingError('WHOOP State-Signatur ist ungültig.','WHOOP_STATE_INVALID',401);if(record.userId!==clean(userId,128)||record.userRef!==digest(`${normalized.stateSecret}\u001f${record.userId}`))throw onboardingError('WHOOP State gehört zu einem anderen Benutzer.','WHOOP_STATE_USER_MISMATCH',403);const callback=resolveWhoopRedirectUri({publicOrigin:new URL(normalized.redirectUri).origin,explicitRedirectUri:redirectUri||normalized.redirectUri});if(record.redirectRef!==digest(callback)||callback!==normalized.redirectUri)throw onboardingError('WHOOP State gehört zu einem anderen Redirect.','WHOOP_STATE_REDIRECT_MISMATCH',403);if(usedNonces.has(record.nonce))throw onboardingError('WHOOP State wurde bereits verwendet.','WHOOP_STATE_REPLAY',409);usedNonces.add(record.nonce);
  return {provider:'whoop',valid:true,userId:record.userId,scopes:[...record.scopes],nonce:record.nonce,issuedAt,expiresAt,consumed:true,secretsExposed:false};
}

export const whoopOnboardingCapabilities=Object.freeze({callbackPath:CALLBACK_PATH,states:Object.freeze(['NOT_CONFIGURED','READY','LIVE']),pkceSupported:false,pkceReason:'WHOOP dokumentiert für den Standard-Nutzerflow Client-Secret und state, aber keinen PKCE-Parameter.',stateStore:'persistent-atomic-single-use-required',oauth:whoopLiveSyncCapabilities.authorization,scopeCatalog:Object.freeze([...DEFAULT_SCOPES,...OPTIONAL_SCOPES]),optionalScopes:Object.freeze([...OPTIONAL_SCOPES])});
