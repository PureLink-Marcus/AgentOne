import crypto from 'node:crypto';

import { createHealthConsent } from './personal-health.mjs';
import { getHealthConsent, queryHealthMetrics, revokeHealthConsent, saveHealthConsent, storeHealthImport } from './personal-health-store.mjs';
import { exchangeWhoopAuthorizationCode, refreshWhoopToken, revokeWhoopAccess, syncWhoopReadOnly } from './whoop-live-sync.mjs';
import { createWhoopOnboardingStart, normalizeWhoopOnboardingConfig, verifyWhoopOnboardingState, whoopOnboardingViewModel } from './whoop-onboarding.mjs';
import {
  acquireWhoopSyncLease,
  consumeWhoopOAuthState,
  deleteWhoopConnection,
  getWhoopConnection,
  hasPendingWhoopOAuthState,
  publicWhoopConnection,
  recordWhoopSyncFailure,
  recordWhoopSyncSuccess,
  releaseWhoopSyncLease,
  rotateWhoopRefreshToken,
  saveWhoopConnection,
  saveWhoopOAuthState,
  updateWhoopTokenMetadata,
} from './whoop-connection-store.mjs';

const SAFE_MESSAGES=Object.freeze({
  WHOOP_NOT_CONFIGURED:'WHOOP ist noch nicht vollständig konfiguriert.',
  WHOOP_TOKEN_ENCRYPTION_NOT_CONFIGURED:'Die sichere WHOOP-Tokenablage ist noch nicht konfiguriert.',
  WHOOP_NOT_CONNECTED:'WHOOP ist noch nicht verbunden.',
  WHOOP_STATE_INVALID:'Die WHOOP-Anmeldung ist ungültig oder gehört zu einer anderen Sitzung.',
  WHOOP_STATE_EXPIRED:'Die WHOOP-Anmeldung ist abgelaufen. Bitte erneut starten.',
  WHOOP_STATE_REPLAY:'Diese WHOOP-Anmeldung wurde bereits verwendet.',
  WHOOP_STATE_USER_MISMATCH:'Die WHOOP-Anmeldung gehört zu einem anderen Benutzer.',
  WHOOP_STATE_REDIRECT_MISMATCH:'Die WHOOP-Anmeldung gehört zu einer anderen Rücksprungadresse.',
  WHOOP_OAUTH_DENIED:'Die WHOOP-Freigabe wurde abgebrochen oder abgelehnt.',
  WHOOP_AUTHORIZATION_REQUIRED:'WHOOP muss erneut verbunden werden.',
  WHOOP_RATE_LIMITED:'WHOOP begrenzt Anfragen vorübergehend.',
  WHOOP_PROVIDER_UNAVAILABLE:'WHOOP ist vorübergehend nicht erreichbar.',
  WHOOP_NETWORK_FAILURE:'WHOOP ist vorübergehend nicht erreichbar.',
  WHOOP_SYNC_BUSY:'Ein WHOOP-Sync läuft bereits.',
  HEALTH_ENCRYPTION_NOT_CONFIGURED:'Die Health-Verschlüsselung ist noch nicht konfiguriert.',
});

function serviceError(message,code='WHOOP_REQUEST_FAILED',status=400,options={}){return Object.assign(new Error(message),{code,status,retryable:Boolean(options.retryable),retryAfterSeconds:options.retryAfterSeconds??null});}
function stable(value){if(value===undefined)return'null';if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;return JSON.stringify(value);}
function healthScopes(whoopScopes){const source=new Set(whoopScopes||[]),result=[];if(source.has('read:cycles'))result.push('activity','vitals');if(source.has('read:recovery'))result.push('vitals');if(source.has('read:sleep'))result.push('sleep','vitals');if(source.has('read:workout'))result.push('workouts');if(source.has('read:body_measurement'))result.push('body');return[...new Set(result)];}
function begin(db){if(db.isTransaction)return false;db.exec('BEGIN IMMEDIATE');return true;}
function finish(db,started,error){if(!started)return;if(error){try{db.exec('ROLLBACK');}catch{}}else db.exec('COMMIT');}
function retryAt(error,failureCount=0,now=Date.now()){const explicit=Number(error?.retryAfterSeconds);if(Number.isFinite(explicit)&&explicit>0)return new Date(now+Math.min(24*60*60,explicit)*1000).toISOString();const minutes=Math.min(360,15*(2**Math.min(5,Math.max(0,Number(failureCount)||0))));return new Date(now+minutes*60_000).toISOString();}
function nextSyncAt(result){const at=new Date(result?.syncedAt).getTime(),retrySeconds=result?.status==='PARTIAL'?Math.max(0,...(Array.isArray(result?.failures)?result.failures:[]).map(item=>Number(item?.retryAfterSeconds)).filter(value=>Number.isFinite(value)&&value>0)):0,delaySeconds=Math.min(24*60*60,Math.max(15*60,retrySeconds));return new Date(at+delaySeconds*1000).toISOString();}
const TERMINAL_REFRESH_ERRORS=new Set(['WHOOP_AUTHORIZATION_REQUIRED','WHOOP_INVALID_TOKEN_RESPONSE','WHOOP_SCOPE_REQUIRED']);
const LOCAL_DISCONNECT_REASONS=new Set([...TERMINAL_REFRESH_ERRORS,'WHOOP_NOT_CONFIGURED','WHOOP_TOKEN_CORRUPT','WHOOP_TOKEN_ENCRYPTION_NOT_CONFIGURED']);
function providerDeadline(timeoutMs,fallback=30_000){const bounded=Math.max(25,Math.min(60_000,Number(timeoutMs)||fallback)),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),bounded);timer.unref?.();return{signal:controller.signal,clear:()=>clearTimeout(timer),timeoutMs:bounded};}

export function whoopConfigFromEnv(env={}){const configuredScopes=String(env.WHOOP_SCOPES||'').split(/[\s,]+/).filter(Boolean);return normalizeWhoopOnboardingConfig({clientId:env.WHOOP_CLIENT_ID,clientSecret:env.WHOOP_CLIENT_SECRET,stateSecret:env.WHOOP_OAUTH_STATE_SECRET,publicOrigin:env.WHOOP_PUBLIC_ORIGIN||env.AGENTONE_PUBLIC_ORIGIN||env.PUBLIC_ORIGIN,redirectUri:env.WHOOP_REDIRECT_URI,scopes:configuredScopes.length?configuredScopes:undefined});}

export function whoopStatus({db,userId,config,tokenCryptoReady=false,now=new Date()}={}){const connection=getWhoopConnection(db,{userId}),model=whoopOnboardingViewModel({config,connection}),ready=model.configured&&tokenCryptoReady,connected=Boolean(connection),pending=ready&&hasPendingWhoopOAuthState(db,{userId,asOf:now}),locked=connected&&connection.syncLockedUntil&&Date.parse(connection.syncLockedUntil)>new Date(now).getTime(),errorCode=String(connection?.lastSync?.errorCode||'');let status,reason=model.reason;if(!ready){status='NOT_CONFIGURED';reason=!tokenCryptoReady?'Die sichere WHOOP-Tokenablage ist noch nicht konfiguriert.':model.reason;}else if(pending||locked){status='CONNECTING';reason=pending?'WHOOP-Autorisierung wartet auf den sicheren Rücksprung.':'WHOOP-Synchronisierung läuft.';}else if(!connected){status='READY';}else if(TERMINAL_REFRESH_ERRORS.has(errorCode)){status='RECONNECT_REQUIRED';reason='Die WHOOP-Freigabe muss erneuert werden.';}else if(connection.lastSync?.status==='LIVE'){status='LIVE';reason=null;}else{status='DEGRADED';reason=connection.lastSync?.status==='PARTIAL'?'Der letzte WHOOP-Sync war nur teilweise erfolgreich.':errorCode?'Der letzte WHOOP-Sync konnte nicht abgeschlossen werden.':'WHOOP ist verbunden; der erste Sync steht noch aus.';}const reconnect=status==='RECONNECT_REQUIRED',actions=Object.freeze({connect:ready&&(!connected||reconnect)&&!pending,sync:connected&&!pending&&!locked&&!reconnect,disconnect:connected&&!locked});return Object.freeze({...model,schema:'agentone.whoop-onboarding-view/v2',connected,status,reason,actions,connection:publicWhoopConnection(connection),cta:ready?Object.freeze({...model.cta,state:reconnect?'RECONNECT':model.cta.state,label:reconnect?'WHOOP neu verbinden':model.cta.label,enabled:actions.connect||actions.sync,routeAvailable:true,route:actions.connect?'/api/internal/personal/whoop/start':'/api/internal/personal/whoop/sync'}):Object.freeze({...model.cta,enabled:false,routeAvailable:false}),policy:Object.freeze({readOnly:true,minimalScopes:true,oauthStartEnabled:ready,stateStore:'persistent-atomic-single-use',refreshTokenEncryptedAtRest:true,accessTokenPersisted:false,userIsolated:true,medicalDiagnosis:false,secretsExposed:false}),secretsExposed:false});}

export function startWhoopAuthorization({db,userId,config,now=new Date()}={}){const start=createWhoopOnboardingStart({config,userId,now});saveWhoopOAuthState(db,{record:start.stateRecord});return start;}

export async function completeWhoopAuthorization({db,userId,config,masterSecret,code,state,providerError,fetchImpl=fetch,now=new Date(),encryptHealth,timeoutMs=30_000}={}){
  const previous=getWhoopConnection(db,{userId});let leaseHeld=false;if(previous){acquireWhoopSyncLease(db,{userId,now});leaseHeld=true;}
  try{
    const verified=consumeWhoopOAuthState(db,{state,userId,config,redirectUri:config.redirectUri,verify:verifyWhoopOnboardingState,now});
    if(providerError)throw serviceError(SAFE_MESSAGES.WHOOP_OAUTH_DENIED,'WHOOP_OAUTH_DENIED',403);
    if(!String(code||'').trim())throw serviceError('WHOOP hat keinen Anmeldecode geliefert.','WHOOP_AUTHORIZATION_CODE_REQUIRED',400);
    const deadline=providerDeadline(timeoutMs);let session;try{session=await exchangeWhoopAuthorizationCode({clientId:config.clientId,clientSecret:config.clientSecret,code,redirectUri:config.redirectUri,fetchImpl,signal:deadline.signal});}finally{deadline.clear();}const reported=session.scopes.filter(scope=>scope.startsWith('read:')),granted=(reported.length?session.scopes:verified.scopes).filter(scope=>verified.scopes.includes(scope));if(!session.refreshToken||!granted.some(scope=>scope.startsWith('read:')))throw serviceError('WHOOP hat keinen erneuerbaren Lesezugriff freigegeben.','WHOOP_SCOPE_REQUIRED',403);
    const consent=createHealthConsent({id:`whoop-${crypto.randomUUID()}`,userId,providers:['whoop'],scopes:healthScopes(granted),grantedAt:now,purpose:'Persönliche deskriptive WHOOP-Trend- und Planungsanalyse'});let started=false;
    try{started=begin(db);saveHealthConsent(db,{userId,consent,encrypt:encryptHealth});saveWhoopConnection(db,{userId,refreshToken:session.refreshToken,masterSecret,grantedScopes:granted,consentId:consent.id,authorizedAt:now,tokenExpiresAt:session.expiresAt});if(previous?.consentId&&previous.consentId!==consent.id)try{revokeHealthConsent(db,{userId,consentId:previous.consentId});}catch{}finish(db,started);leaseHeld=false;return{schema:'agentone.whoop-connection/v1',connection:publicWhoopConnection(getWhoopConnection(db,{userId})),consent:{id:consent.id,scopes:[...consent.scopes]},secretsExposed:false};}catch(error){finish(db,started,error);throw error;}
  }finally{if(leaseHeld)try{releaseWhoopSyncLease(db,{userId});}catch{}}
}

export async function syncWhoopConnection({db,userId,config,masterSecret,encryptHealth,decryptHealth,fetchImpl=fetch,now=new Date(),reason='manual',timeoutMs=45_000}={}){
  const before=getWhoopConnection(db,{userId,masterSecret,includeRefreshToken:true});if(!before)throw serviceError(SAFE_MESSAGES.WHOOP_NOT_CONNECTED,'WHOOP_NOT_CONNECTED',409);
  if(TERMINAL_REFRESH_ERRORS.has(String(before.lastSync?.errorCode||'')))throw serviceError(SAFE_MESSAGES.WHOOP_AUTHORIZATION_REQUIRED,'WHOOP_AUTHORIZATION_REQUIRED',401);
  acquireWhoopSyncLease(db,{userId,now});let leaseHeld=true;
  try{
    const consent=getHealthConsent(db,{userId,consentId:before.consentId,decrypt:decryptHealth});if(consent.status!=='ACTIVE')throw serviceError('Eine aktive WHOOP-Gesundheitsfreigabe fehlt.','HEALTH_CONSENT_REQUIRED',403);
    const previousMetrics=queryHealthMetrics(db,{userId,source:'whoop',limit:5_000,decrypt:decryptHealth});
    const controller=new AbortController(),boundedTimeout=Math.max(5_000,Math.min(120_000,Number(timeoutMs)||45_000)),timer=setTimeout(()=>controller.abort(),boundedTimeout);timer.unref?.();let result;try{result=await syncWhoopReadOnly({clientId:config.clientId,clientSecret:config.clientSecret,refreshToken:before.refreshToken,consent,cursor:before.cursor,previousMetrics,grantedScopes:before.scopes,fetchImpl,signal:controller.signal,now,onRotatedRefreshToken:token=>rotateWhoopRefreshToken(db,{userId,refreshToken:token,masterSecret})});}finally{clearTimeout(timer);}
    updateWhoopTokenMetadata(db,{userId,tokenExpiresAt:result.token.expiresAt,grantedScopes:result.token.scopes});
    const sourceHash=crypto.createHash('sha256').update(stable({schema:'agentone.whoop-sync-source/v1',userId,window:result.window,metrics:result.metrics.map(item=>[item.id,item.value,item.startAt,item.endAt])})).digest('hex');let stored,connection,started=false;
    try{started=begin(db);stored=storeHealthImport(db,{userId,provider:'whoop',consentId:before.consentId,sourceHash,metrics:result.metrics,duplicateCount:result.duplicatesRemoved,metadata:{schema:'agentone.whoop-sync/v1',reason,status:result.status,window:result.window,stats:result.stats,failures:result.failures.map(item=>({component:item.component,code:item.code})),excludedByConsent:result.excludedByConsent,medicalDiagnosis:false},encrypt:encryptHealth});connection=recordWhoopSyncSuccess(db,{userId,cursor:result.cursor,lastSync:{status:result.status,syncedAt:result.syncedAt,metrics:result.metrics.length,inserted:stored.inserted,updated:stored.updated,unchanged:stored.unchanged,duplicatesRemoved:result.duplicatesRemoved,failures:result.failures.length},nextAttemptAt:nextSyncAt(result)});finish(db,started);leaseHeld=false;}catch(error){finish(db,started,error);throw error;}
    return{schema:'agentone.whoop-sync-result/v1',status:result.status,syncedAt:result.syncedAt,window:result.window,metrics:result.metrics.length,stored,failures:result.failures.map(item=>({component:item.component,code:item.code,retryable:Boolean(item.retryable)})),connection:publicWhoopConnection(connection),policy:{readOnly:true,incremental:true,timeoutMs:boundedTimeout,rawRecordsPersisted:false,medicalDiagnosis:false,secretsExposed:false},secretsExposed:false};
  }catch(error){const latest=getWhoopConnection(db,{userId});if(latest)try{recordWhoopSyncFailure(db,{userId,code:error.code||'WHOOP_SYNC_FAILED',nextAttemptAt:TERMINAL_REFRESH_ERRORS.has(String(error.code||''))?null:retryAt(error,latest.failureCount,new Date(now).getTime())});leaseHeld=false;}catch{}throw error;}finally{if(leaseHeld)try{releaseWhoopSyncLease(db,{userId});}catch{}}
}

function removeLocalWhoopConnection(db,{userId,connection,revokeConsent,providerRevocationConfirmed,reasonCode=null}={}){let started=false,removed;try{started=begin(db);removed=deleteWhoopConnection(db,{userId});if(revokeConsent)try{revokeHealthConsent(db,{userId,consentId:connection.consentId});}catch(error){if(error?.code!=='HEALTH_CONSENT_NOT_FOUND')throw error;}finish(db,started);const safeReason=LOCAL_DISCONNECT_REASONS.has(String(reasonCode||''))?String(reasonCode):'WHOOP_AUTHORIZATION_REQUIRED';return{schema:'agentone.whoop-disconnect/v1',disconnected:true,alreadyDisconnected:false,providerRevocationConfirmed:Boolean(providerRevocationConfirmed),providerReviewRequired:!providerRevocationConfirmed,providerStatus:providerRevocationConfirmed?'REVOKED_CONFIRMED':'REVOCATION_UNCONFIRMED',reasonCode:providerRevocationConfirmed?null:safeReason,connectionRemoved:removed.deleted,dataRetainedUntilExplicitDeletion:true,secretsExposed:false};}catch(error){finish(db,started,error);throw error;}}

export async function disconnectWhoop({db,userId,config,masterSecret,fetchImpl=fetch,revokeConsent=true,timeoutMs=30_000}={}){
  const metadata=getWhoopConnection(db,{userId});if(!metadata)return{schema:'agentone.whoop-disconnect/v1',disconnected:true,alreadyDisconnected:true,providerRevocationConfirmed:false,providerReviewRequired:false,providerStatus:'NO_LOCAL_CONNECTION',dataRetainedUntilExplicitDeletion:true,secretsExposed:false};if(TERMINAL_REFRESH_ERRORS.has(String(metadata.lastSync?.errorCode||'')))return removeLocalWhoopConnection(db,{userId,connection:metadata,revokeConsent,providerRevocationConfirmed:false,reasonCode:metadata.lastSync.errorCode});
  if(!String(config?.clientId||'').trim()||!String(config?.clientSecret||'').trim())return removeLocalWhoopConnection(db,{userId,connection:metadata,revokeConsent,providerRevocationConfirmed:false,reasonCode:'WHOOP_NOT_CONFIGURED'});
  let connection;try{connection=getWhoopConnection(db,{userId,masterSecret,includeRefreshToken:true});}catch(error){if(['WHOOP_TOKEN_CORRUPT','WHOOP_TOKEN_ENCRYPTION_NOT_CONFIGURED'].includes(String(error?.code||'')))return removeLocalWhoopConnection(db,{userId,connection:metadata,revokeConsent,providerRevocationConfirmed:false,reasonCode:error.code});throw error;}
  acquireWhoopSyncLease(db,{userId});let leaseHeld=true;const deadline=providerDeadline(timeoutMs);
  try{
    const session=await refreshWhoopToken({clientId:config.clientId,clientSecret:config.clientSecret,refreshToken:connection.refreshToken,fetchImpl,signal:deadline.signal,onRotatedRefreshToken:token=>rotateWhoopRefreshToken(db,{userId,refreshToken:token,masterSecret})}),reportedRead=session.scopes.some(scope=>scope.startsWith('read:'));updateWhoopTokenMetadata(db,{userId,tokenExpiresAt:session.expiresAt,grantedScopes:reportedRead?session.scopes:connection.scopes});await revokeWhoopAccess({accessToken:session.accessToken,fetchImpl,signal:deadline.signal});const result=removeLocalWhoopConnection(db,{userId,connection,revokeConsent,providerRevocationConfirmed:true});leaseHeld=false;return result;
  }catch(error){if(TERMINAL_REFRESH_ERRORS.has(String(error.code||''))){const result=removeLocalWhoopConnection(db,{userId,connection,revokeConsent,providerRevocationConfirmed:false,reasonCode:error.code});leaseHeld=false;return result;}throw error;}finally{deadline.clear();if(leaseHeld)try{releaseWhoopSyncLease(db,{userId});}catch{}}
}

export function publicWhoopError(error){const raw=String(error?.code||'WHOOP_REQUEST_FAILED'),code=/^WHOOP_[A-Z0-9_]{2,60}$/.test(raw)||/^HEALTH_[A-Z0-9_]{2,60}$/.test(raw)?raw:'WHOOP_REQUEST_FAILED',status=Math.max(400,Math.min(599,Number(error?.status)||500));return{error:code,message:SAFE_MESSAGES[code]||'WHOOP-Aktion konnte nicht abgeschlossen werden.',retryable:Boolean(error?.retryable),retryAfterSeconds:Number.isFinite(Number(error?.retryAfterSeconds))?Number(error.retryAfterSeconds):null,status,secretsExposed:false};}

export const whoopServiceInternals=Object.freeze({healthScopes,retryAt,nextSyncAt});
