import crypto from 'node:crypto';

const ID=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/;
const TYPE=/^[a-z][a-z0-9._:-]{1,119}$/;
const HASH=/^[a-f0-9]{64}$/;
const STATES=new Set(['CLAIMED','COMPLETED','FAILED','CANCELLED']);
const ERROR_CODE=/^[A-Z][A-Z0-9_]{2,63}$/;

function effectError(message,code='PERSONAL_EFFECT_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function identifier(value,field){const result=String(value??'').trim();if(!ID.test(result))throw effectError(`${field} ist ungültig`);return result;}
function effectType(value){const result=String(value??'').trim().toLowerCase();if(!TYPE.test(result))throw effectError('effectType ist ungültig');return result;}
function hash(value,field){const result=String(value??'').trim().toLowerCase();if(!HASH.test(result))throw effectError(`${field} ist ungültig`);return result;}
function instant(value=new Date()){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw effectError('Zeitstempel ist ungültig');return date;}
function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;}
function digest(value){return crypto.createHash('sha256').update(typeof value==='string'?value:stable(value)).digest('hex');}
function tokenHash(value){return digest(String(value||''));}
function stableErrorCode(error){const code=String(error?.code||'PERSONAL_EFFECT_FAILED').toUpperCase();return ERROR_CODE.test(code)&&!/(?:SECRET|PASSWORD|TOKEN|AUTH|CREDENTIAL|API_KEY)/.test(code)?code:'PERSONAL_EFFECT_FAILED';}
function transaction(db,operation){db.exec('BEGIN IMMEDIATE');try{const result=operation();db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
function dbRow(db,userId,id){return db.prepare(`SELECT id,user_id AS userId,effect_type AS effectType,run_id AS runId,tool_step_id AS toolStepId,idempotency_key AS idempotencyKey,input_hash AS inputHash,state,attempt,retryable,claim_token_hash AS claimTokenHash,claimed_at AS claimedAt,lease_expires_at AS leaseExpiresAt,completed_at AS completedAt,failed_at AS failedAt,cancelled_at AS cancelledAt,abort_requested_at AS abortRequestedAt,error_code AS errorCode,result_hash AS resultHash,created_at AS createdAt,updated_at AS updatedAt FROM personal_effect_ledger WHERE user_id=? AND id=?`).get(userId,id);}
function publicRow(row){return row?Object.freeze({id:row.id,effectType:row.effectType,runId:row.runId,toolStepId:row.toolStepId,state:row.state,attempt:Number(row.attempt),retryable:Boolean(row.retryable),claimedAt:row.claimedAt,leaseExpiresAt:row.leaseExpiresAt,completedAt:row.completedAt,failedAt:row.failedAt,cancelledAt:row.cancelledAt,abortRequestedAt:row.abortRequestedAt,errorCode:row.errorCode,canRetry:row.state==='FAILED'&&Boolean(row.retryable),canCancel:row.state==='CLAIMED'&&!row.abortRequestedAt,createdAt:row.createdAt,updatedAt:row.updatedAt}):null;}
function requireRow(db,userId,id){const row=dbRow(db,userId,id);if(!row)throw effectError('Effect wurde nicht gefunden','PERSONAL_EFFECT_NOT_FOUND',404);if(!STATES.has(row.state))throw effectError('Effect-Zustand ist beschädigt','PERSONAL_EFFECT_CORRUPT',500);return row;}
function assertClaim(row,claimToken){if(!claimToken||!crypto.timingSafeEqual(Buffer.from(row.claimTokenHash,'hex'),Buffer.from(tokenHash(claimToken),'hex')))throw effectError('Effect-Claim ist nicht mehr gültig','PERSONAL_EFFECT_CLAIM_LOST',409);}

export function personalEffectIdempotencyKey({userId,effectType:value,runId,inputHash}={}){return digest([identifier(userId,'userId'),effectType(value),identifier(runId,'runId'),hash(inputHash,'inputHash')]);}

export function initPersonalEffectLedger(db){db.exec(`
  CREATE TABLE IF NOT EXISTS personal_effect_ledger(
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    effect_type TEXT NOT NULL,
    run_id TEXT NOT NULL,
    tool_step_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    retryable INTEGER NOT NULL,
    claim_token_hash TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    lease_expires_at TEXT NOT NULL,
    completed_at TEXT,
    failed_at TEXT,
    cancelled_at TEXT,
    abort_requested_at TEXT,
    error_code TEXT,
    result_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,id),
    UNIQUE(user_id,idempotency_key)
  );
  CREATE INDEX IF NOT EXISTS personal_effect_ledger_run ON personal_effect_ledger(user_id,run_id,updated_at DESC);
  CREATE INDEX IF NOT EXISTS personal_effect_ledger_state ON personal_effect_ledger(user_id,state,updated_at DESC);
`);}

export function claimPersonalEffect(db,{id=crypto.randomUUID(),userId,effectType:value,runId,toolStepId,idempotencyKey,inputHash,now=new Date(),leaseMs=30_000,retry=false}={}){
  const owner=identifier(userId,'userId'),effectId=identifier(id,'effect.id'),type=effectType(value),run=identifier(runId,'runId'),step=identifier(toolStepId,'toolStepId'),key=hash(idempotencyKey,'idempotencyKey'),input=hash(inputHash,'inputHash'),at=instant(now);if(!Number.isInteger(leaseMs)||leaseMs<1_000||leaseMs>15*60_000)throw effectError('leaseMs ist ungültig');
  return transaction(db,()=>{
    const existing=db.prepare('SELECT id FROM personal_effect_ledger WHERE user_id=? AND idempotency_key=?').get(owner,key);
    const claimToken=crypto.randomBytes(32).toString('base64url'),claimHash=tokenHash(claimToken),claimedAt=at.toISOString(),leaseExpiresAt=new Date(at.getTime()+leaseMs).toISOString();
    if(!existing){db.prepare(`INSERT INTO personal_effect_ledger(id,user_id,effect_type,run_id,tool_step_id,idempotency_key,input_hash,state,attempt,retryable,claim_token_hash,claimed_at,lease_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(effectId,owner,type,run,step,key,input,'CLAIMED',1,0,claimHash,claimedAt,leaseExpiresAt,claimedAt,claimedAt);return {claimed:true,reused:false,claimToken,effect:publicRow(requireRow(db,owner,effectId))};}
    const row=requireRow(db,owner,existing.id);if(row.effectType!==type||row.runId!==run||row.inputHash!==input)throw effectError('Idempotency-Key gehört zu einem anderen Effect','PERSONAL_EFFECT_IDEMPOTENCY_CONFLICT',409);
    if(row.state==='COMPLETED')return {claimed:false,reused:true,claimToken:null,effect:publicRow(row)};
    if(row.state==='CANCELLED')return {claimed:false,reused:false,claimToken:null,effect:publicRow(row)};
    const leaseExpired=Date.parse(row.leaseExpiresAt)<=at.getTime();
    if(row.state==='CLAIMED'&&!leaseExpired)return {claimed:false,reused:false,busy:true,claimToken:null,effect:publicRow(row)};
    if(row.state==='FAILED'&&(!retry||!row.retryable))return {claimed:false,reused:false,claimToken:null,effect:publicRow(row)};
    const updated=db.prepare(`UPDATE personal_effect_ledger SET tool_step_id=?,state='CLAIMED',attempt=attempt+1,retryable=0,claim_token_hash=?,claimed_at=?,lease_expires_at=?,completed_at=NULL,failed_at=NULL,cancelled_at=NULL,abort_requested_at=NULL,error_code=NULL,result_hash=NULL,updated_at=? WHERE user_id=? AND id=? AND state=?`).run(step,claimHash,claimedAt,leaseExpiresAt,claimedAt,owner,row.id,row.state);
    if(updated.changes!==1)throw effectError('Effect konnte nicht atomar beansprucht werden','PERSONAL_EFFECT_CLAIM_CONFLICT',409);
    return {claimed:true,reused:true,claimToken,effect:publicRow(requireRow(db,owner,row.id))};
  });
}

export function completePersonalEffect(db,{userId,id,claimToken,result,now=new Date()}={}){const owner=identifier(userId,'userId'),effectId=identifier(id,'effect.id'),at=instant(now);return transaction(db,()=>{const row=requireRow(db,owner,effectId);if(row.state!=='CLAIMED')throw effectError('Effect ist nicht aktiv','PERSONAL_EFFECT_TRANSITION_DENIED',409);assertClaim(row,claimToken);const resultHash=digest(result??null),updated=db.prepare(`UPDATE personal_effect_ledger SET state='COMPLETED',retryable=0,completed_at=?,lease_expires_at=?,result_hash=?,updated_at=? WHERE user_id=? AND id=? AND state='CLAIMED' AND claim_token_hash=?`).run(at.toISOString(),at.toISOString(),resultHash,at.toISOString(),owner,effectId,row.claimTokenHash);if(updated.changes!==1)throw effectError('Effect-Abschluss verlor seinen Claim','PERSONAL_EFFECT_CLAIM_LOST',409);return publicRow(requireRow(db,owner,effectId));});}
export function failPersonalEffect(db,{userId,id,claimToken,error,retryable=false,now=new Date()}={}){const owner=identifier(userId,'userId'),effectId=identifier(id,'effect.id'),at=instant(now);return transaction(db,()=>{const row=requireRow(db,owner,effectId);if(row.state!=='CLAIMED')throw effectError('Effect ist nicht aktiv','PERSONAL_EFFECT_TRANSITION_DENIED',409);assertClaim(row,claimToken);const code=stableErrorCode(error),updated=db.prepare(`UPDATE personal_effect_ledger SET state='FAILED',retryable=?,failed_at=?,lease_expires_at=?,error_code=?,updated_at=? WHERE user_id=? AND id=? AND state='CLAIMED' AND claim_token_hash=?`).run(retryable?1:0,at.toISOString(),at.toISOString(),code,at.toISOString(),owner,effectId,row.claimTokenHash);if(updated.changes!==1)throw effectError('Effect-Fehler verlor seinen Claim','PERSONAL_EFFECT_CLAIM_LOST',409);return publicRow(requireRow(db,owner,effectId));});}
export function cancelPersonalEffectExecution(db,{userId,id,claimToken,now=new Date()}={}){const owner=identifier(userId,'userId'),effectId=identifier(id,'effect.id'),at=instant(now);return transaction(db,()=>{const row=requireRow(db,owner,effectId);if(row.state==='CANCELLED')return publicRow(row);if(row.state!=='CLAIMED')throw effectError('Effect ist nicht aktiv','PERSONAL_EFFECT_TRANSITION_DENIED',409);assertClaim(row,claimToken);db.prepare(`UPDATE personal_effect_ledger SET state='CANCELLED',retryable=0,cancelled_at=?,lease_expires_at=?,error_code='PERSONAL_EFFECT_CANCELLED',updated_at=? WHERE user_id=? AND id=? AND state='CLAIMED' AND claim_token_hash=?`).run(at.toISOString(),at.toISOString(),at.toISOString(),owner,effectId,row.claimTokenHash);return publicRow(requireRow(db,owner,effectId));});}

export function requestPersonalEffectAbort(db,{userId,id,actor,verifyHuman,now=new Date()}={}){const owner=identifier(userId,'userId'),effectId=identifier(id,'effect.id'),at=instant(now);if(actor?.kind!=='human'||actor?.id!==owner||typeof verifyHuman!=='function'||verifyHuman(actor)!==true)throw effectError('Abbruch benötigt eine bestätigte Benutzersitzung','PERSONAL_EFFECT_HUMAN_REQUIRED',403);return transaction(db,()=>{const row=requireRow(db,owner,effectId);if(row.state!=='CLAIMED')throw effectError('Nur ein aktiver Effect kann abgebrochen werden','PERSONAL_EFFECT_TRANSITION_DENIED',409);if(!row.abortRequestedAt)db.prepare('UPDATE personal_effect_ledger SET abort_requested_at=?,updated_at=? WHERE user_id=? AND id=?').run(at.toISOString(),at.toISOString(),owner,effectId);return publicRow(requireRow(db,owner,effectId));});}
export function personalEffectAbortRequested(db,{userId,id}={}){const row=requireRow(db,identifier(userId,'userId'),identifier(id,'effect.id'));return row.state==='CLAIMED'&&Boolean(row.abortRequestedAt);}
export function getPersonalEffectForRun(db,{userId,runId}={}){const owner=identifier(userId,'userId'),run=identifier(runId,'runId'),row=db.prepare(`SELECT id FROM personal_effect_ledger WHERE user_id=? AND run_id=? ORDER BY updated_at DESC LIMIT 1`).get(owner,run);return row?publicRow(requireRow(db,owner,row.id)):null;}
export function listPersonalEffects(db,{userId,limit=20}={}){const owner=identifier(userId,'userId'),safeLimit=Math.max(1,Math.min(50,Math.trunc(Number(limit)||20)));return Object.freeze(db.prepare(`SELECT id FROM personal_effect_ledger WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT ?`).all(owner,safeLimit).map(row=>publicRow(requireRow(db,owner,row.id))));}

export async function executePersonalEffect(db,{userId,effectType,runId,toolStepId,idempotencyKey,inputHash,operation,retry=false,retryable=true,leaseMs=30_000,pollMs=50,signal}={}){if(typeof operation!=='function')throw effectError('Effect-Operation fehlt');const claim=claimPersonalEffect(db,{userId,effectType,runId,toolStepId,idempotencyKey,inputHash,retry,leaseMs});if(!claim.claimed)return {...claim,executed:false,result:null};const controller=new AbortController(),abort=()=>controller.abort();if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}const poll=setInterval(()=>{try{if(personalEffectAbortRequested(db,{userId,id:claim.effect.id}))abort();}catch{}},Math.max(20,Math.min(1_000,Number(pollMs)||50)));poll.unref?.();try{const result=await operation({signal:controller.signal,effect:claim.effect});if(controller.signal.aborted)throw effectError('Effect wurde abgebrochen','PERSONAL_EFFECT_CANCELLED',409);const effect=completePersonalEffect(db,{userId,id:claim.effect.id,claimToken:claim.claimToken,result});return {claimed:true,reused:claim.reused,executed:true,effect,result};}catch(error){if(controller.signal.aborted||error?.code==='PERSONAL_EFFECT_CANCELLED'){try{cancelPersonalEffectExecution(db,{userId,id:claim.effect.id,claimToken:claim.claimToken});}catch{}throw effectError('Effect wurde abgebrochen','PERSONAL_EFFECT_CANCELLED',409);}const canRetry=typeof retryable==='function'?retryable(error):Boolean(retryable);try{failPersonalEffect(db,{userId,id:claim.effect.id,claimToken:claim.claimToken,error,retryable:canRetry});}catch{}throw error;}finally{clearInterval(poll);if(signal)signal.removeEventListener?.('abort',abort);}}

export const personalEffectLedgerInternals=Object.freeze({digest,stableErrorCode,STATES});
