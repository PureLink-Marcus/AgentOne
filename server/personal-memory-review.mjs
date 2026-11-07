import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { initPersonalMemoryStore, isMemoryAreaEnabled, normalizeMemoryEntry, personalMemoryAreas } from './personal-memory.mjs';

const OPERATIONS=new Set(['ADD','PATCH','REMOVE']);
const ELIGIBLE_PROVENANCE=new Set(['owner','agent']);
const ALL_PROVENANCE=new Set(['owner','agent','connector','untrusted','system']);
const STATES=new Set(['PENDING','APPLIED','REJECTED','EXPIRED']);
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_PENDING=100;
const MAX_EVIDENCE=20;
const MAX_CANDIDATE_AGE_MS=90*86_400_000;

function reviewError(message,code='MEMORY_REVIEW_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function validId(value,label='id'){const id=String(value??'').trim();if(!ID.test(id))throw reviewError(`${label} ist ungültig`);return id;}
function validDate(value,label='date'){const date=value instanceof Date?value:new Date(value);if(!Number.isFinite(date.getTime()))throw reviewError(`${label} ist ungültig`);return date;}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function sameHash(left,right){if(!HASH.test(String(left||''))||!HASH.test(String(right||'')))return false;return timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));}
function actorId(actor,userId){const id=String(actor?.id||'').trim();if(actor?.type!=='human'||!ID.test(id)||id!==userId)throw reviewError('Menschliche Freigabe durch den Besitzer erforderlich','MEMORY_REVIEW_HUMAN_REQUIRED',403);return id;}
function transaction(db,callback){db.exec('BEGIN IMMEDIATE');try{const result=callback();db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
function parseJson(value,fallback){try{return JSON.parse(value);}catch{return fallback;}}

function rowEntry(row){if(!row)return null;return {id:row.id,userId:row.user_id,area:row.area,content:row.content,source:row.source,sourceRef:row.source_ref??null,sensitivity:row.sensitivity,expiresAt:row.expires_at??null,createdAt:row.created_at,updatedAt:row.updated_at};}
function loadEntry(db,userId,id){return rowEntry(db.prepare('SELECT * FROM personal_memory_entries WHERE id=? AND user_id=?').get(id,userId));}
export function memoryEntryHash(entry){if(!entry)return null;return hash({id:entry.id,userId:entry.userId,area:entry.area,content:entry.content,source:entry.source,sourceRef:entry.sourceRef??null,sensitivity:entry.sensitivity,expiresAt:entry.expiresAt??null,createdAt:entry.createdAt,updatedAt:entry.updatedAt});}

function audit(db,{userId,candidateId=null,operation,action,outcome,now}){db.prepare('INSERT INTO personal_memory_review_audit(id,user_id,candidate_id,operation,action,outcome,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),userId,candidateId,operation,action,outcome,now.toISOString());}
function expirePending(db,userId,now){db.prepare("UPDATE personal_memory_candidates SET state='EXPIRED',decided_at=? WHERE user_id=? AND state='PENDING' AND candidate_expires_at<=?").run(now.toISOString(),userId,now.toISOString());}

function rowCandidate(row){if(!row)return null;const proposal=parseJson(row.proposal_json,null),evidence=parseJson(row.evidence_hashes,'[]');return {id:row.id,userId:row.user_id,operation:row.operation,area:row.area,proposal,targetEntryId:row.target_entry_id??null,targetHash:row.target_hash??null,candidateHash:row.candidate_hash,provenanceClass:row.provenance_class,evidenceCount:Array.isArray(evidence)?evidence.length:0,state:row.state,createdAt:row.created_at,candidateExpiresAt:row.candidate_expires_at,decidedAt:row.decided_at??null,decidedBy:row.decided_by??null,appliedEntryId:row.applied_entry_id??null};}
function loadCandidateRow(db,userId,id){return db.prepare('SELECT * FROM personal_memory_candidates WHERE id=? AND user_id=?').get(id,userId);}
function candidateRowHash(row){return hash({id:row.id,userId:row.user_id,operation:row.operation,area:row.area,proposal:row.proposal_json?parseJson(row.proposal_json,null):null,targetEntryId:row.target_entry_id??null,targetHash:row.target_hash??null,provenanceClass:row.provenance_class,evidenceHashes:parseJson(row.evidence_hashes,[]),createdAt:row.created_at,candidateExpiresAt:row.candidate_expires_at});}

export function initPersonalMemoryReviewStore(db){
  initPersonalMemoryStore(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_memory_candidates(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('ADD','PATCH','REMOVE')),
      area TEXT NOT NULL,
      proposal_json TEXT,
      target_entry_id TEXT,
      target_hash TEXT,
      candidate_hash TEXT NOT NULL,
      provenance_class TEXT NOT NULL,
      evidence_hashes TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PENDING','APPLIED','REJECTED','EXPIRED')),
      created_at TEXT NOT NULL,
      candidate_expires_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT,
      applied_entry_id TEXT
    );
    CREATE INDEX IF NOT EXISTS personal_memory_candidates_user_state ON personal_memory_candidates(user_id,state,created_at DESC);
    CREATE TABLE IF NOT EXISTS personal_memory_review_audit(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      candidate_id TEXT,
      operation TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS personal_memory_review_audit_user ON personal_memory_review_audit(user_id,created_at DESC);
  `);
}

export function listMemoryAreaPolicies(db,{userId}={}){const owner=validId(userId,'userId'),stored=new Map(db.prepare('SELECT area,enabled,updated_at AS updatedAt FROM personal_memory_area_policy WHERE user_id=?').all(owner).map(row=>[row.area,row]));return personalMemoryAreas.map(area=>({area,enabled:stored.has(area)?Number(stored.get(area).enabled)===1:true,updatedAt:stored.get(area)?.updatedAt??null}));}

export function setMemoryAreaPolicy(db,{userId,area,enabled,actor,now=new Date()}={}){const owner=validId(userId,'userId'),normalizedArea=String(area||''),at=validDate(now,'now');actorId(actor,owner);if(!personalMemoryAreas.includes(normalizedArea)||typeof enabled!=='boolean')throw reviewError('Memory-Bereich oder Zustand ist ungültig');return transaction(db,()=>{db.prepare('INSERT INTO personal_memory_area_policy(user_id,area,enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,area) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').run(owner,normalizedArea,enabled?1:0,at.toISOString());audit(db,{userId:owner,operation:'POLICY',action:'AREA_POLICY_UPDATED',outcome:enabled?'ENABLED':'DISABLED',now:at});return {area:normalizedArea,enabled,updatedAt:at.toISOString()};});}

function normalizeEvidence(values){if(!Array.isArray(values)||values.length>MAX_EVIDENCE)throw reviewError('Evidenzliste ist ungültig');const unique=[...new Set(values.map(value=>String(value||'').toLowerCase()))];if(unique.some(value=>!HASH.test(value)))throw reviewError('Evidenz darf nur SHA-256-Hashes enthalten','MEMORY_REVIEW_EVIDENCE_INVALID',400);return unique;}
function eligibleProvenance(value){const provenance=String(value||'');if(!ALL_PROVENANCE.has(provenance))throw reviewError('Provenienzklasse ist ungültig');if(!ELIGIBLE_PROVENANCE.has(provenance))throw reviewError('Diese Provenienz darf kein dauerhaftes Memory erzeugen','MEMORY_REVIEW_PROVENANCE_BLOCKED',403);return provenance;}
function validateProposalSource(proposal,provenance){if((provenance==='owner'&&proposal.source!=='user')||(provenance==='agent'&&proposal.source!=='chat'))throw reviewError('Memory-Quelle passt nicht zur Provenienz','MEMORY_REVIEW_PROVENANCE_MISMATCH',400);}

export function stageMemoryCandidate(db,{id=randomUUID(),userId,operation,input,targetEntryId=null,provenanceClass,evidenceHashes=[],candidateExpiresAt,now=new Date()}={}){
  const owner=validId(userId,'userId'),candidateId=validId(id),op=String(operation||'').toUpperCase(),provenance=eligibleProvenance(provenanceClass),at=validDate(now,'now');
  if(!OPERATIONS.has(op))throw reviewError('Operation ist ungültig');
  const evidence=normalizeEvidence(evidenceHashes),expires=candidateExpiresAt?validDate(candidateExpiresAt,'candidateExpiresAt'):new Date(at.getTime()+30*86_400_000);
  if(expires<=at||expires.getTime()-at.getTime()>MAX_CANDIDATE_AGE_MS)throw reviewError('Kandidatenablauf muss innerhalb von 90 Tagen liegen','MEMORY_REVIEW_EXPIRY_INVALID',400);
  expirePending(db,owner,at);
  const pending=Number(db.prepare("SELECT COUNT(*) AS count FROM personal_memory_candidates WHERE user_id=? AND state='PENDING'").get(owner)?.count||0);
  if(pending>=MAX_PENDING)throw reviewError('Zu viele offene Memory-Vorschläge','MEMORY_REVIEW_PENDING_LIMIT',429);
  let target=null,proposal=null,area='';
  if(op==='ADD'){
    if(targetEntryId)throw reviewError('ADD darf kein Ziel besitzen');
    proposal=normalizeMemoryEntry(input);validateProposalSource(proposal,provenance);area=proposal.area;
  }else{
    const targetId=validId(targetEntryId,'targetEntryId');target=loadEntry(db,owner,targetId);if(!target)throw reviewError('Memory-Ziel wurde nicht gefunden','MEMORY_REVIEW_TARGET_NOT_FOUND',404);if(!isMemoryAreaEnabled(db,{userId:owner,area:target.area}))throw reviewError('Memory-Bereich ist deaktiviert','MEMORY_AREA_DISABLED',403);area=target.area;
    if(op==='PATCH'){proposal=normalizeMemoryEntry(input);validateProposalSource(proposal,provenance);area=proposal.area;}
    else if(input!=null)throw reviewError('REMOVE darf keinen neuen Inhalt besitzen');
  }
  if(!isMemoryAreaEnabled(db,{userId:owner,area}))throw reviewError('Memory-Bereich ist deaktiviert','MEMORY_AREA_DISABLED',403);
  const targetHash=memoryEntryHash(target),createdAt=at.toISOString(),candidateExpiry=expires.toISOString(),proposalJson=proposal?JSON.stringify(proposal):null;
  const candidateHash=hash({id:candidateId,userId:owner,operation:op,area,proposal,targetEntryId:target?.id??null,targetHash,provenanceClass:provenance,evidenceHashes:evidence,createdAt,candidateExpiresAt:candidateExpiry});
  try{return transaction(db,()=>{db.prepare("INSERT INTO personal_memory_candidates(id,user_id,operation,area,proposal_json,target_entry_id,target_hash,candidate_hash,provenance_class,evidence_hashes,state,created_at,candidate_expires_at) VALUES(?,?,?,?,?,?,?,?,?,?, 'PENDING',?,?)").run(candidateId,owner,op,area,proposalJson,target?.id??null,targetHash,candidateHash,provenance,JSON.stringify(evidence),createdAt,candidateExpiry);audit(db,{userId:owner,candidateId,operation:op,action:'CANDIDATE_STAGED',outcome:'PENDING',now:at});return rowCandidate(loadCandidateRow(db,owner,candidateId));});}catch(error){if(String(error.message||error).includes('UNIQUE'))throw reviewError('Kandidaten-ID existiert bereits','MEMORY_REVIEW_DUPLICATE',409);throw error;}
}

export function listMemoryCandidates(db,{userId,state='',limit=100,now=new Date()}={}){const owner=validId(userId,'userId'),at=validDate(now,'now');if(!Number.isInteger(limit)||limit<1||limit>100)throw reviewError('limit ist ungültig');expirePending(db,owner,at);const normalizedState=String(state||'').toUpperCase();if(normalizedState&&!STATES.has(normalizedState))throw reviewError('state ist ungültig');const rows=normalizedState?db.prepare('SELECT * FROM personal_memory_candidates WHERE user_id=? AND state=? ORDER BY created_at DESC LIMIT ?').all(owner,normalizedState,limit):db.prepare('SELECT * FROM personal_memory_candidates WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(owner,limit);return rows.map(rowCandidate);}

function requireCandidate(db,{userId,id,candidateHash}){const row=loadCandidateRow(db,userId,id);if(!row)throw reviewError('Memory-Vorschlag wurde nicht gefunden','MEMORY_REVIEW_NOT_FOUND',404);const exactHash=candidateRowHash(row);if(!sameHash(row.candidate_hash,exactHash)||!sameHash(exactHash,candidateHash))throw reviewError('Memory-Vorschlag hat sich geändert','MEMORY_REVIEW_HASH_MISMATCH',409);return row;}
function writeProposal(db,{row,proposal,now,entryId}){if(row.operation==='ADD'){db.prepare('INSERT INTO personal_memory_entries(id,user_id,area,content,source,source_ref,sensitivity,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(entryId,row.user_id,proposal.area,proposal.content,proposal.source,proposal.sourceRef,proposal.sensitivity,proposal.expiresAt,now,now);return loadEntry(db,row.user_id,entryId);}if(row.operation==='PATCH'){db.prepare('UPDATE personal_memory_entries SET area=?,content=?,source=?,source_ref=?,sensitivity=?,expires_at=?,updated_at=? WHERE id=? AND user_id=?').run(proposal.area,proposal.content,proposal.source,proposal.sourceRef,proposal.sensitivity,proposal.expiresAt,now,row.target_entry_id,row.user_id);return loadEntry(db,row.user_id,row.target_entry_id);}db.prepare('DELETE FROM personal_memory_entries WHERE id=? AND user_id=?').run(row.target_entry_id,row.user_id);return null;}

export function approveMemoryCandidate(db,{userId,id,candidateHash,actor,now=new Date()}={}){const owner=validId(userId,'userId'),candidateId=validId(id),at=validDate(now,'now'),human=actorId(actor,owner);expirePending(db,owner,at);return transaction(db,()=>{const row=requireCandidate(db,{userId:owner,id:candidateId,candidateHash});if(row.state==='APPLIED')return {candidate:rowCandidate(row),entry:row.applied_entry_id?loadEntry(db,owner,row.applied_entry_id):null,idempotent:true};if(row.state!=='PENDING')throw reviewError('Memory-Vorschlag ist nicht mehr freigabefähig','MEMORY_REVIEW_NOT_PENDING',row.state==='EXPIRED'?410:409);if(!ELIGIBLE_PROVENANCE.has(row.provenance_class))throw reviewError('Provenienz darf nicht promoviert werden','MEMORY_REVIEW_PROVENANCE_BLOCKED',403);if(!isMemoryAreaEnabled(db,{userId:owner,area:row.area}))throw reviewError('Memory-Bereich ist deaktiviert','MEMORY_AREA_DISABLED',403);const target=row.target_entry_id?loadEntry(db,owner,row.target_entry_id):null;if(row.operation!=='ADD'&&(!target||!isMemoryAreaEnabled(db,{userId:owner,area:target.area})||!sameHash(memoryEntryHash(target),row.target_hash)))throw reviewError('Memory-Ziel wurde seit dem Vorschlag geändert oder sein Bereich deaktiviert','MEMORY_REVIEW_TARGET_CHANGED',409);const proposal=row.proposal_json?parseJson(row.proposal_json,null):null,appliedEntryId=row.operation==='ADD'?randomUUID():row.operation==='PATCH'?row.target_entry_id:null,entry=writeProposal(db,{row,proposal,now:at.toISOString(),entryId:appliedEntryId});db.prepare("UPDATE personal_memory_candidates SET state='APPLIED',decided_at=?,decided_by=?,applied_entry_id=? WHERE id=? AND user_id=? AND state='PENDING'").run(at.toISOString(),human,appliedEntryId,candidateId,owner);audit(db,{userId:owner,candidateId,operation:row.operation,action:'CANDIDATE_APPROVED',outcome:'APPLIED',now:at});return {candidate:rowCandidate(loadCandidateRow(db,owner,candidateId)),entry,idempotent:false};});}

export function rejectMemoryCandidate(db,{userId,id,candidateHash,actor,now=new Date()}={}){const owner=validId(userId,'userId'),candidateId=validId(id),at=validDate(now,'now'),human=actorId(actor,owner);expirePending(db,owner,at);return transaction(db,()=>{const row=requireCandidate(db,{userId:owner,id:candidateId,candidateHash});if(row.state==='REJECTED')return {candidate:rowCandidate(row),idempotent:true};if(row.state!=='PENDING')throw reviewError('Memory-Vorschlag ist nicht mehr ablehnbar','MEMORY_REVIEW_NOT_PENDING',row.state==='EXPIRED'?410:409);db.prepare("UPDATE personal_memory_candidates SET state='REJECTED',decided_at=?,decided_by=? WHERE id=? AND user_id=? AND state='PENDING'").run(at.toISOString(),human,candidateId,owner);audit(db,{userId:owner,candidateId,operation:row.operation,action:'CANDIDATE_REJECTED',outcome:'REJECTED',now:at});return {candidate:rowCandidate(loadCandidateRow(db,owner,candidateId)),idempotent:false};});}

export function listMemoryReviewAudit(db,{userId,limit=100}={}){const owner=validId(userId,'userId');if(!Number.isInteger(limit)||limit<1||limit>500)throw reviewError('limit ist ungültig');const items=db.prepare('SELECT id,candidate_id AS candidateId,operation,action,outcome,created_at AS createdAt FROM personal_memory_review_audit WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?').all(owner,limit);return {items,secretsExposed:false};}

export const personalMemoryReviewLimits=Object.freeze({maxPending:MAX_PENDING,maxEvidence:MAX_EVIDENCE,maxCandidateAgeDays:90});
