import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPersonalBriefingSources } from './personal-briefing-source-refresh.mjs';

const now=new Date('2026-11-07T12:00:00.000Z');
const connected=(lastSuccessAt,extra={})=>({connected:true,lastSuccessAt,...extra});

test('fresh sources are skipped without calling their operation',async()=>{
  let calls=0;const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{mail:connected('2026-11-07T11:59:00.000Z',{accounts:2})},operations:{mail:async()=>{calls+=1;}},maxAgeMs:5*60_000});
  assert.equal(calls,0);assert.deepEqual(result[0],{source:'mail',status:'FRESH',freshness:'FRESH',lastSuccessAt:'2026-11-07T11:59:00.000Z',attemptedAt:null,outcome:'SKIPPED_FRESH',errorCode:null,accounts:2});
  assert.equal(result[1].status,'NOT_CONNECTED');assert.equal(result[2].status,'NOT_CONNECTED');
});

test('an explicit due marker refreshes even a fresh source',async()=>{
  let calls=0;const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{mail:connected('2026-11-07T11:59:00.000Z',{due:true})},operations:{mail:async()=>{calls+=1;return {lastSuccessAt:now};}}});
  assert.equal(calls,1);assert.equal(result[0].outcome,'REFRESHED');assert.equal(result[0].freshness,'FRESH');assert.equal(result[0].attemptedAt,now.toISOString());
});

test('stale source refreshes successfully and projects no callback payload',async()=>{
  const result=await refreshPersonalBriefingSources({userId:'owner@example.test',now,sources:{mail:connected('2026-11-07T11:00:00.000Z',{accounts:1})},operations:{mail:async context=>{assert.equal(context.userId,'owner@example.test');assert.equal(context.source,'mail');assert.equal(context.signal.aborted,false);return {lastSuccessAt:now.toISOString(),accounts:3,accessToken:'must-not-leak',messages:[{subject:'private'}]};}}});
  assert.deepEqual(result[0],{source:'mail',status:'FRESH',freshness:'FRESH',lastSuccessAt:now.toISOString(),attemptedAt:now.toISOString(),outcome:'REFRESHED',errorCode:null,accounts:3});
  assert.deepEqual(Object.keys(result[0]),['source','status','freshness','lastSuccessAt','attemptedAt','outcome','errorCode','accounts']);assert.doesNotMatch(JSON.stringify(result),/must-not-leak|private|accessToken/);
});

test('busy, timeout and ordinary failures retain only a safe stale fallback',async()=>{
  const stale='2026-11-07T10:00:00.000Z',never=new Promise(()=>{}),result=await refreshPersonalBriefingSources({userId:'guenni',now,timeoutMs:20,maxConcurrent:3,sources:{mail:connected(stale,{due:true,accounts:1}),ics:connected(stale,{due:true}),google:connected(stale,{due:true})},operations:{mail:async()=>{throw Object.assign(new Error('password=hunter2'),{code:'MAIL_SYNC_BUSY',token:'secret'});},ics:async()=>never,google:async()=>{throw new Error('refresh_token=must-not-leak');}}});
  assert.deepEqual(result.map(item=>[item.source,item.status,item.outcome,item.errorCode]),[['mail','STALE_FALLBACK','SKIPPED_BUSY','MAIL_SYNC_BUSY'],['ics','STALE_FALLBACK','FALLBACK','SOURCE_REFRESH_TIMEOUT'],['google','STALE_FALLBACK','FALLBACK','SOURCE_REFRESH_FAILED']]);
  assert.ok(result.every(item=>item.lastSuccessAt===stale&&item.freshness==='STALE_FALLBACK'));assert.doesNotMatch(JSON.stringify(result),/hunter2|must-not-leak|refresh_token|secret/);
});

test('partial success does not fail other sources and missing fallback degrades honestly',async()=>{
  const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{mail:connected('2026-11-07T10:00:00.000Z',{accounts:2}),ics:{connected:true,due:true},google:connected('2026-11-07T10:00:00.000Z')},operations:{mail:async()=>({lastSuccessAt:now}),ics:async()=>{throw Object.assign(new Error('offline'),{code:'ICS_NETWORK_FAILED'});},google:async()=>({lastSuccessAt:'2026-11-07T10:30:00.000Z'})}});
  assert.equal(result[0].status,'FRESH');assert.equal(result[1].status,'DEGRADED');assert.equal(result[1].errorCode,'ICS_NETWORK_FAILED');assert.equal(result[2].status,'STALE_FALLBACK');assert.equal(result[2].errorCode,'SOURCE_REFRESH_STALE_RESULT');
});

test('user binding fails before callbacks and concurrency stays bounded',async()=>{
  let calls=0;await assert.rejects(()=>refreshPersonalBriefingSources({userId:'guenni',sources:{mail:{connected:true,userId:'fressi'}},operations:{mail:async()=>{calls+=1;}}}),error=>error.code==='BRIEFING_REFRESH_USER_MISMATCH');assert.equal(calls,0);
  let active=0,peak=0;const operation=async()=>{active+=1;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active-=1;return {lastSuccessAt:now};};await refreshPersonalBriefingSources({userId:'guenni',now,maxConcurrent:1,sources:{mail:{connected:true},ics:{connected:true},google:{connected:true}},operations:{mail:operation,ics:operation,google:operation}});assert.equal(peak,1);
});

test('secret-looking error codes are replaced with a stable public failure code',async()=>{
  const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{mail:connected('2026-11-07T10:00:00.000Z',{due:true})},operations:{mail:async()=>{throw Object.assign(new Error('redacted'),{code:'ACCESS_TOKEN_SUPERSECRETVALUE'});}}});
  assert.equal(result[0].errorCode,'SOURCE_REFRESH_FAILED');assert.doesNotMatch(JSON.stringify(result),/SUPERSECRETVALUE|ACCESS_TOKEN/);
});

test('provider backoff blocks retries and preserves the last valid snapshot',async()=>{
  let calls=0;const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{mail:{connected:true,due:true,degraded:true,lastSuccessAt:'2026-11-07T10:00:00.000Z',blockedUntil:'2026-11-07T12:15:00.000Z',errorCode:'MAIL_NETWORK_FAILED'}},operations:{mail:async()=>{calls+=1;}}});
  assert.equal(calls,0);assert.deepEqual(result[0],{source:'mail',status:'STALE_FALLBACK',freshness:'STALE_FALLBACK',lastSuccessAt:'2026-11-07T10:00:00.000Z',attemptedAt:null,outcome:'BACKOFF',errorCode:'MAIL_NETWORK_FAILED'});
});

test('provider partial success is never labelled fresh',async()=>{
  const result=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{google:{connected:true,due:true,lastSuccessAt:'2026-11-07T10:00:00.000Z'}},operations:{google:async()=>({lastSuccessAt:now,status:'DEGRADED',degraded:true,errorCode:'GOOGLE_CALENDAR_PARTIAL',accessToken:'never'})}});
  assert.deepEqual(result[2],{source:'google',status:'DEGRADED',freshness:'DEGRADED',lastSuccessAt:now.toISOString(),attemptedAt:now.toISOString(),outcome:'PARTIAL',errorCode:'GOOGLE_CALENDAR_PARTIAL'});assert.doesNotMatch(JSON.stringify(result),/accessToken|never/);
});

test('static calendar snapshot is fresh inside the window and stale without a technical error afterwards',async()=>{
  let calls=0;const fresh=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{ics:{connected:true,static:true,lastSuccessAt:'2026-11-07T11:59:00.000Z'}},operations:{ics:async()=>{calls+=1;}}}),stale=await refreshPersonalBriefingSources({userId:'guenni',now,sources:{ics:{connected:true,static:true,lastSuccessAt:'2026-11-07T10:00:00.000Z'}},operations:{ics:async()=>{calls+=1;}}});
  assert.equal(calls,0);assert.equal(fresh[1].freshness,'FRESH');assert.deepEqual(stale[1],{source:'ics',status:'STALE_FALLBACK',freshness:'STALE_FALLBACK',lastSuccessAt:'2026-11-07T10:00:00.000Z',attemptedAt:null,outcome:'STATIC_SNAPSHOT',errorCode:null});
});
