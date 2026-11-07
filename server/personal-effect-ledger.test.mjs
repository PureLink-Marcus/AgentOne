import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  claimPersonalEffect,
  executePersonalEffect,
  getPersonalEffectForRun,
  initPersonalEffectLedger,
  listPersonalEffects,
  personalEffectIdempotencyKey,
  requestPersonalEffectAbort,
} from './personal-effect-ledger.mjs';

function database(){const db=new DatabaseSync(':memory:');initPersonalEffectLedger(db);return db;}
const base={userId:'guenni',effectType:'personal.briefing',runId:'run-1',toolStepId:'tool-1',inputHash:'a'.repeat(64)};
const key=personalEffectIdempotencyKey(base);

test('atomically claims one effect and reuses the same idempotency key',()=>{const db=database(),first=claimPersonalEffect(db,{...base,idempotencyKey:key}),second=claimPersonalEffect(db,{...base,idempotencyKey:key});assert.equal(first.claimed,true);assert.ok(first.claimToken);assert.equal(second.claimed,false);assert.equal(second.busy,true);assert.equal(second.effect.id,first.effect.id);assert.doesNotMatch(JSON.stringify(listPersonalEffects(db,{userId:'guenni'})),/claimToken|idempotency|inputHash|a{32}/);db.close();});

test('completed effect is returned without executing the operation twice',async()=>{const db=database();let calls=0;const input={...base,idempotencyKey:key,operation:async()=>{calls+=1;return {safeCount:3,secret:'not persisted'};}};const first=await executePersonalEffect(db,input),second=await executePersonalEffect(db,input);assert.equal(first.executed,true);assert.equal(second.executed,false);assert.equal(second.reused,true);assert.equal(calls,1);const effect=getPersonalEffectForRun(db,{userId:'guenni',runId:'run-1'});assert.equal(effect.state,'COMPLETED');assert.equal(effect.canRetry,false);assert.doesNotMatch(JSON.stringify(effect),/not persisted|resultHash|secret/);db.close();});

test('retry keeps the effect id and idempotency key while rotating the claim',async()=>{const db=database();let calls=0;await assert.rejects(()=>executePersonalEffect(db,{...base,idempotencyKey:key,operation:async()=>{calls+=1;throw Object.assign(new Error('provider secret'),{code:'NETWORK_FAILED'});},retryable:true}),/provider secret/);let effect=getPersonalEffectForRun(db,{userId:'guenni',runId:'run-1'});assert.equal(effect.state,'FAILED');assert.equal(effect.canRetry,true);const retried=await executePersonalEffect(db,{...base,toolStepId:'tool-2',idempotencyKey:key,retry:true,operation:async()=>{calls+=1;return {ok:true};}});assert.equal(retried.effect.id,effect.id);assert.equal(retried.effect.attempt,2);assert.equal(retried.effect.toolStepId,'tool-2');assert.equal(calls,2);db.close();});

test('human abort request reaches the running operation and becomes terminal',async()=>{const db=database();let started;const ready=new Promise(resolve=>{started=resolve;}),execution=executePersonalEffect(db,{...base,idempotencyKey:key,pollMs:10,operation:async({signal})=>{started();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{code:'ABORTED'})),{once:true});});}});await ready;const effect=getPersonalEffectForRun(db,{userId:'guenni',runId:'run-1'});requestPersonalEffectAbort(db,{userId:'guenni',id:effect.id,actor:{kind:'human',id:'guenni'},verifyHuman:()=>true});await assert.rejects(execution,error=>error.code==='PERSONAL_EFFECT_CANCELLED');assert.equal(getPersonalEffectForRun(db,{userId:'guenni',runId:'run-1'}).state,'CANCELLED');db.close();});

test('stale claim is recovered once but user and payload conflicts fail closed',()=>{const db=database(),now=new Date('2026-11-07T10:00:00.000Z'),first=claimPersonalEffect(db,{...base,idempotencyKey:key,now,leaseMs:1_000}),reclaimed=claimPersonalEffect(db,{...base,toolStepId:'tool-2',idempotencyKey:key,now:new Date(now.getTime()+1_001)});assert.equal(first.claimed,true);assert.equal(reclaimed.claimed,true);assert.equal(reclaimed.effect.attempt,2);assert.throws(()=>claimPersonalEffect(db,{...base,inputHash:'b'.repeat(64),idempotencyKey:key}),error=>error.code==='PERSONAL_EFFECT_IDEMPOTENCY_CONFLICT');assert.equal(listPersonalEffects(db,{userId:'fressi'}).length,0);db.close();});
