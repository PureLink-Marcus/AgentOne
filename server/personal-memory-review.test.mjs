import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { listMemoryEntries, saveMemoryEntry } from './personal-memory.mjs';
import {
  approveMemoryCandidate,
  initPersonalMemoryReviewStore,
  listMemoryAreaPolicies,
  listMemoryCandidates,
  listMemoryReviewAudit,
  personalMemoryReviewLimits,
  rejectMemoryCandidate,
  setMemoryAreaPolicy,
  stageMemoryCandidate,
} from './personal-memory-review.mjs';

function database(){const db=new DatabaseSync(':memory:');initPersonalMemoryReviewStore(db);return db;}
const human=id=>({type:'human',id});
const ownerInput=(content,area='communication')=>({area,content,source:'user',sourceRef:'direct',sensitivity:'PRIVATE'});
const agentInput=(content,area='communication')=>({area,content,source:'chat',sourceRef:'review',sensitivity:'PRIVATE'});
const evidence=value=>String(value).repeat(64).slice(0,64);

test('server area policy blocks writes and recall while remaining user isolated',()=>{
  const db=database();
  saveMemoryEntry(db,{id:'existing',userId:'u1',input:ownerInput('Kurze Antworten bevorzugt')});
  setMemoryAreaPolicy(db,{userId:'u1',area:'communication',enabled:false,actor:human('u1')});
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,0);
  assert.throws(()=>saveMemoryEntry(db,{id:'blocked',userId:'u1',input:ownerInput('Noch ein Eintrag')}),error=>error.code==='MEMORY_AREA_DISABLED'&&error.status===403);
  assert.doesNotThrow(()=>saveMemoryEntry(db,{id:'other',userId:'u2',input:ownerInput('Eigener Benutzer')}));
  assert.equal(listMemoryEntries(db,{userId:'u2'}).length,1);
  setMemoryAreaPolicy(db,{userId:'u1',area:'communication',enabled:true,actor:human('u1')});
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,1);
  assert.equal(listMemoryAreaPolicies(db,{userId:'u1'}).find(item=>item.area==='communication').enabled,true);
  assert.throws(()=>setMemoryAreaPolicy(db,{userId:'u1',area:'health',enabled:false,actor:{type:'agent',id:'u1'}}),error=>error.code==='MEMORY_REVIEW_HUMAN_REQUIRED');
  db.close();
});

test('ADD candidates need exact human approval and apply idempotently with content-free audit',()=>{
  const db=database(),now=new Date('2026-11-07T10:00:00.000Z');
  const candidate=stageMemoryCandidate(db,{id:'candidate-add',userId:'u1',operation:'ADD',input:ownerInput('Bitte kurze Antworten geben'),provenanceClass:'owner',evidenceHashes:[evidence('a')],now});
  assert.equal(candidate.state,'PENDING');
  assert.equal(candidate.evidenceCount,1);
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,0);
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:{type:'agent',id:'u1'},now}),error=>error.code==='MEMORY_REVIEW_HUMAN_REQUIRED');
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:'0'.repeat(64),actor:human('u1'),now}),error=>error.code==='MEMORY_REVIEW_HASH_MISMATCH');
  const applied=approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now});
  assert.equal(applied.candidate.state,'APPLIED');
  assert.equal(applied.entry.content,'Bitte kurze Antworten geben');
  assert.equal(applied.idempotent,false);
  const replay=approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now});
  assert.equal(replay.idempotent,true);
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,1);
  const audit=listMemoryReviewAudit(db,{userId:'u1'});
  assert.deepEqual(audit.items.map(item=>item.action).sort(),['CANDIDATE_APPROVED','CANDIDATE_STAGED']);
  assert.equal(audit.secretsExposed,false);
  assert.doesNotMatch(JSON.stringify(audit),/kurze Antworten|direct|evidence/i);
  db.close();
});

test('candidate hash detects persisted proposal tampering before approval',()=>{
  const db=database(),now=new Date('2026-11-07T10:30:00.000Z');
  const candidate=stageMemoryCandidate(db,{id:'candidate-tampered',userId:'u1',operation:'ADD',input:ownerInput('Unveränderter Vorschlag'),provenanceClass:'owner',evidenceHashes:[],now});
  db.prepare('UPDATE personal_memory_candidates SET proposal_json=? WHERE id=?').run(JSON.stringify(ownerInput('Manipulierter Vorschlag')),candidate.id);
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now}),error=>error.code==='MEMORY_REVIEW_HASH_MISMATCH'&&error.status===409);
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,0);
  db.close();
});

test('PATCH and REMOVE are bound to the exact target snapshot',()=>{
  const db=database(),now=new Date('2026-11-07T11:00:00.000Z');
  saveMemoryEntry(db,{id:'target',userId:'u1',input:ownerInput('Antworten normal lang')});
  const stale=stageMemoryCandidate(db,{id:'candidate-stale',userId:'u1',operation:'PATCH',targetEntryId:'target',input:agentInput('Antworten kurz halten'),provenanceClass:'agent',evidenceHashes:[evidence('b')],now});
  db.prepare("UPDATE personal_memory_entries SET content='Manuell geändert',updated_at='2026-11-07T11:01:00.000Z' WHERE id='target'").run();
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:stale.id,candidateHash:stale.candidateHash,actor:human('u1'),now:new Date('2026-11-07T11:02:00.000Z')}),error=>error.code==='MEMORY_REVIEW_TARGET_CHANGED'&&error.status===409);
  const patch=stageMemoryCandidate(db,{id:'candidate-patch',userId:'u1',operation:'PATCH',targetEntryId:'target',input:agentInput('Antworten wirklich kurz halten'),provenanceClass:'agent',evidenceHashes:[evidence('c')],now:new Date('2026-11-07T11:03:00.000Z')});
  const patched=approveMemoryCandidate(db,{userId:'u1',id:patch.id,candidateHash:patch.candidateHash,actor:human('u1'),now:new Date('2026-11-07T11:04:00.000Z')});
  assert.equal(patched.entry.content,'Antworten wirklich kurz halten');
  const remove=stageMemoryCandidate(db,{id:'candidate-remove',userId:'u1',operation:'REMOVE',targetEntryId:'target',provenanceClass:'owner',evidenceHashes:[],now:new Date('2026-11-07T11:05:00.000Z')});
  const removed=approveMemoryCandidate(db,{userId:'u1',id:remove.id,candidateHash:remove.candidateHash,actor:human('u1'),now:new Date('2026-11-07T11:06:00.000Z')});
  assert.equal(removed.entry,null);
  assert.equal(approveMemoryCandidate(db,{userId:'u1',id:remove.id,candidateHash:remove.candidateHash,actor:human('u1'),now:new Date('2026-11-07T11:07:00.000Z')}).idempotent,true);
  assert.equal(listMemoryEntries(db,{userId:'u1'}).length,0);
  db.close();
});

test('untrusted provenance cannot promote and rejection is owner-bound and idempotent',()=>{
  const db=database(),now=new Date('2026-11-07T12:00:00.000Z');
  for(const provenanceClass of ['connector','untrusted','system'])assert.throws(()=>stageMemoryCandidate(db,{id:'blocked-'+provenanceClass,userId:'u1',operation:'ADD',input:ownerInput('Nicht übernehmen'),provenanceClass,evidenceHashes:[],now}),error=>error.code==='MEMORY_REVIEW_PROVENANCE_BLOCKED'&&error.status===403);
  const candidate=stageMemoryCandidate(db,{id:'candidate-reject',userId:'u1',operation:'ADD',input:ownerInput('Später prüfen'),provenanceClass:'owner',evidenceHashes:[],now});
  assert.equal(listMemoryCandidates(db,{userId:'u2'}).length,0);
  assert.throws(()=>rejectMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u2'),now}),error=>error.code==='MEMORY_REVIEW_HUMAN_REQUIRED');
  assert.equal(rejectMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now}).idempotent,false);
  assert.equal(rejectMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now}).idempotent,true);
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:candidate.id,candidateHash:candidate.candidateHash,actor:human('u1'),now}),error=>error.code==='MEMORY_REVIEW_NOT_PENDING');
  db.close();
});

test('candidate expiry, evidence and pending caps are enforced',()=>{
  const db=database(),now=new Date('2026-11-07T13:00:00.000Z');
  assert.throws(()=>stageMemoryCandidate(db,{id:'too-many-evidence',userId:'u1',operation:'ADD',input:ownerInput('Evidenzgrenze'),provenanceClass:'owner',evidenceHashes:Array.from({length:personalMemoryReviewLimits.maxEvidence+1},(_,index)=>index.toString(16).padStart(64,'0')),now}),/Evidenzliste/);
  const expiring=stageMemoryCandidate(db,{id:'expiring',userId:'u1',operation:'ADD',input:ownerInput('Kurzlebiger Vorschlag'),provenanceClass:'owner',candidateExpiresAt:'2026-11-08T13:00:00.000Z',now});
  assert.equal(listMemoryCandidates(db,{userId:'u1',state:'EXPIRED',now:new Date('2026-11-09T13:00:00.000Z')})[0].id,expiring.id);
  assert.throws(()=>approveMemoryCandidate(db,{userId:'u1',id:expiring.id,candidateHash:expiring.candidateHash,actor:human('u1'),now:new Date('2026-11-09T13:00:00.000Z')}),error=>error.code==='MEMORY_REVIEW_NOT_PENDING'&&error.status===410);
  for(let index=0;index<personalMemoryReviewLimits.maxPending;index+=1)stageMemoryCandidate(db,{id:'cap-'+index,userId:'u2',operation:'ADD',input:ownerInput('Vorschlag '+index),provenanceClass:'owner',now});
  assert.throws(()=>stageMemoryCandidate(db,{id:'cap-overflow',userId:'u2',operation:'ADD',input:ownerInput('Zu viel'),provenanceClass:'owner',now}),error=>error.code==='MEMORY_REVIEW_PENDING_LIMIT'&&error.status===429);
  db.close();
});
