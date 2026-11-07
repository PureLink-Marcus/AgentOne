const SOURCE_IDS=Object.freeze(['mail','ics','google']);
const USER_ID=/^[^\s\u0000-\u001f\u007f]{1,128}$/;
const ERROR_CODE=/^[A-Z][A-Z0-9_]{2,63}$/;
const SENSITIVE_ERROR_CODE=/(?:PASSWORD|PASSWORT|SECRET|ACCESS_?TOKEN|REFRESH_?TOKEN|API_?KEY|CLIENT_?SECRET|AUTHORIZATION|BEARER|CREDENTIAL)/;
const FRESHNESS_STATES=new Set(['FRESH','STALE_FALLBACK','NOT_CONNECTED','DEGRADED']);

function refreshError(message,code='BRIEFING_SOURCE_REFRESH_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function instant(value,name){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw refreshError(`${name} ist ungültig`);return date;}
function timestamp(value){if(value==null||value==='')return null;const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null;}
function integer(value,max=1_000){if(value==null||value==='')return null;const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(max,Math.trunc(number))):null;}
function ageSeconds(lastSuccessAt,now){if(!lastSuccessAt)return null;return Math.max(0,Math.floor((now.getTime()-Date.parse(lastSuccessAt))/1_000));}
function stableErrorCode(error,fallback='SOURCE_REFRESH_FAILED'){
  if(error?.code==='SOURCE_REFRESH_TIMEOUT')return 'SOURCE_REFRESH_TIMEOUT';
  const code=String(error?.code||'').toUpperCase();
  return ERROR_CODE.test(code)&&!SENSITIVE_ERROR_CODE.test(code)?code:fallback;
}
function projection({source,status,freshness=status,lastSuccessAt=null,attemptedAt=null,outcome,errorCode=null,accounts}){
  if(!SOURCE_IDS.includes(source)||!FRESHNESS_STATES.has(status)||!FRESHNESS_STATES.has(freshness))throw refreshError('Interne Quellenprojektion ist ungültig');
  const result={source,status,freshness,lastSuccessAt,attemptedAt,outcome,errorCode};
  const safeAccounts=integer(accounts);if(safeAccounts!=null)result.accounts=safeAccounts;
  return Object.freeze(result);
}
function normalizeState(source,state,userId){
  const value=state&&typeof state==='object'&&!Array.isArray(state)?state:{};
  if(value.userId!=null&&String(value.userId)!==userId)throw refreshError(`Quellenstatus ${source} gehört einem anderen Benutzer`,'BRIEFING_REFRESH_USER_MISMATCH',403);
  return Object.freeze({connected:value.connected===true,due:value.due===true,degraded:value.degraded===true,static:value.static===true,lastSuccessAt:timestamp(value.lastSuccessAt),blockedUntil:timestamp(value.blockedUntil),errorCode:value.errorCode?stableErrorCode({code:value.errorCode},'SOURCE_DEGRADED'):null,accounts:integer(value.accounts)});
}
async function withTimeout(operation,context,timeoutMs){
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(refreshError('Quellenaktualisierung hat das Zeitlimit überschritten','SOURCE_REFRESH_TIMEOUT',504));},timeoutMs);});
  try{return await Promise.race([Promise.resolve().then(()=>operation({...context,signal:controller.signal})),timeout]);}
  finally{clearTimeout(timer);}
}
async function refreshOne({source,state,operation,userId,now,maxAgeMs,timeoutMs}){
  const previous=state.lastSuccessAt,accounts=state.accounts,isFresh=previous&&now.getTime()-Date.parse(previous)<=maxAgeMs;
  if(!state.connected)return projection({source,status:'NOT_CONNECTED',lastSuccessAt:null,attemptedAt:null,outcome:'NOT_ATTEMPTED',errorCode:null,accounts});
  if(state.blockedUntil&&Date.parse(state.blockedUntil)>now.getTime())return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt:null,outcome:'BACKOFF',errorCode:state.errorCode||'SOURCE_REFRESH_BACKOFF',accounts});
  if(isFresh&&!state.due&&!state.degraded)return projection({source,status:'FRESH',lastSuccessAt:previous,attemptedAt:null,outcome:'SKIPPED_FRESH',errorCode:null,accounts});
  if(state.static)return projection({source,status:'STALE_FALLBACK',lastSuccessAt:previous,attemptedAt:null,outcome:'STATIC_SNAPSHOT',errorCode:null,accounts});
  const attemptedAt=now.toISOString();
  if(typeof operation!=='function')return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt,outcome:'FALLBACK',errorCode:'SOURCE_REFRESH_UNAVAILABLE',accounts});
  try{
    const raw=await withTimeout(operation,{userId,source,attemptedAt},timeoutMs),value=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},partial=value.degraded===true||String(value.status||'').toUpperCase()==='DEGRADED',lastSuccessAt=timestamp(value.lastSuccessAt)||(partial?previous:attemptedAt),nextAccounts=integer(value.accounts)??accounts,refreshedIsFresh=lastSuccessAt&&now.getTime()-Date.parse(lastSuccessAt)<=maxAgeMs;
    if(partial)return projection({source,status:'DEGRADED',lastSuccessAt,attemptedAt,outcome:'PARTIAL',errorCode:stableErrorCode({code:value.errorCode},'SOURCE_REFRESH_PARTIAL'),accounts:nextAccounts});
    if(!refreshedIsFresh)return projection({source,status:'STALE_FALLBACK',lastSuccessAt,attemptedAt,outcome:'STALE_RESULT',errorCode:'SOURCE_REFRESH_STALE_RESULT',accounts:nextAccounts});
    return projection({source,status:'FRESH',lastSuccessAt,attemptedAt,outcome:'REFRESHED',errorCode:null,accounts:nextAccounts});
  }catch(error){
    const code=stableErrorCode(error),busy=code.endsWith('_BUSY')||code==='SOURCE_REFRESH_BUSY';
    return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt,outcome:busy?'SKIPPED_BUSY':'FALLBACK',errorCode:code,accounts});
  }
}

function preparedInput({userId,sources,now,maxAgeMs}){
  const owner=String(userId||'').trim();if(!USER_ID.test(owner))throw refreshError('userId ist ungültig','BRIEFING_REFRESH_USER_INVALID');
  const at=instant(now,'now');if(!Number.isInteger(maxAgeMs)||maxAgeMs<1_000||maxAgeMs>7*86_400_000)throw refreshError('maxAgeMs ist ungültig');
  const states=Object.fromEntries(SOURCE_IDS.map(source=>[source,normalizeState(source,sources?.[source],owner)]));
  return {owner,at,states};
}

export function inspectPersonalBriefingSources({userId,sources={},now=new Date(),maxAgeMs=5*60_000}={}){
  const {at,states}=preparedInput({userId,sources,now,maxAgeMs});
  return Object.freeze(SOURCE_IDS.map(source=>{
    const state=states[source],previous=state.lastSuccessAt,accounts=state.accounts,isFresh=previous&&at.getTime()-Date.parse(previous)<=maxAgeMs;
    if(!state.connected)return projection({source,status:'NOT_CONNECTED',lastSuccessAt:null,attemptedAt:null,outcome:'NOT_ATTEMPTED',errorCode:null,accounts});
    if(state.blockedUntil&&Date.parse(state.blockedUntil)>at.getTime())return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt:null,outcome:'BACKOFF',errorCode:state.errorCode||'SOURCE_REFRESH_BACKOFF',accounts});
    if(isFresh&&!state.degraded)return projection({source,status:'FRESH',lastSuccessAt:previous,attemptedAt:null,outcome:'CURRENT',errorCode:null,accounts});
    if(state.degraded)return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt:null,outcome:'DEGRADED_STATE',errorCode:state.errorCode||'SOURCE_DEGRADED',accounts});
    if(state.static)return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt:null,outcome:'STATIC_SNAPSHOT',errorCode:null,accounts});
    return projection({source,status:previous?'STALE_FALLBACK':'DEGRADED',lastSuccessAt:previous,attemptedAt:null,outcome:previous?'STALE':'NO_SNAPSHOT',errorCode:null,accounts});
  }));
}

export async function refreshPersonalBriefingSources({userId,sources={},operations={},now=new Date(),maxAgeMs=5*60_000,timeoutMs=10_000,maxConcurrent=2}={}){
  const {owner,at,states}=preparedInput({userId,sources,now,maxAgeMs});
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>60_000)throw refreshError('timeoutMs ist ungültig');
  if(!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>SOURCE_IDS.length)throw refreshError('maxConcurrent ist ungültig');
  const results=new Array(SOURCE_IDS.length);let cursor=0;
  const worker=async()=>{while(true){const index=cursor++;if(index>=SOURCE_IDS.length)return;const source=SOURCE_IDS[index];results[index]=await refreshOne({source,state:states[source],operation:operations?.[source],userId:owner,now:at,maxAgeMs,timeoutMs});}};
  await Promise.all(Array.from({length:maxConcurrent},()=>worker()));
  return Object.freeze(results);
}

export const personalBriefingSourceRefreshInternals=Object.freeze({SOURCE_IDS,FRESHNESS_STATES,ageSeconds,stableErrorCode});
