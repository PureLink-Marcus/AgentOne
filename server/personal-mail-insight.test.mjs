import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalMailInsight, personalMailInsightAuditProjection, personalMailInsightPersistenceProjection, publicPersonalMailInsightError, sanitizeMailInsightContent } from './personal-mail-insight.mjs';

const request={userId:'user-a',accountId:'mail-1',uid:42,uidValidity:'9001'};
const account={userId:'user-a',id:'mail-1',uidValidity:'9001'};
const message={userId:'user-a',accountId:'mail-1',uid:42,uidValidity:'9001',idempotencyKey:'a'.repeat(64),threadKey:'thread-1',sender:'person@example.test',subject:'Besprechung zur Planung',receivedAt:'2026-11-07T08:00:00.000Z'};

test('single-message insight is strictly bound and requests no attachments or remote content',async()=>{
  let calls=0,fetchInput;
  const result=await createPersonalMailInsight({request,account,message,now:'2026-11-07T09:00:00.000Z',fetchMessage:async input=>{calls+=1;fetchInput=input;return {text:'Bitte bestätige das Meeting am 10.11.2026 um 14:30 Uhr.',attachmentCount:1};}});
  assert.equal(calls,1);assert.deepEqual({...fetchInput,signal:undefined},{userId:'user-a',accountId:'mail-1',uid:42,uidValidity:'9001',maxBytes:128*1024,includeAttachments:false,remoteContent:false,bodyParts:['text/plain','text/html'],signal:undefined});assert.ok(fetchInput.signal instanceof AbortSignal);
  assert.equal(result.insight.classification,'CALENDAR_CANDIDATE');assert.equal(result.insight.actionRequired,true);assert.deepEqual(result.calendarDraft,{kind:'MEETING',title:'Besprechung zur Planung',date:'2026-11-10',time:'14:30',allDay:false,durationMinutes:30,timeZone:'Europe/Berlin',readOnlyDraft:true,requiresHumanApproval:true});assert.deepEqual(result.conflictInput,{date:'2026-11-10',time:'14:30',durationMinutes:30,timeZone:'Europe/Berlin'});assert.equal(result.source.attachmentsExcluded,1);assert.equal(result.policy.attachmentsFetched,false);assert.equal(result.policy.remoteContentFetched,false);assert.equal(result.policy.providerMutations,false);
});

test('cross-user, cross-account, UID and UIDVALIDITY mismatches fail before fetch',async()=>{
  for(const change of [{request:{...request,userId:'user-b'}},{request:{...request,accountId:'mail-2'}},{request:{...request,uid:43}},{request:{...request,uidValidity:'9002'}},{account:{...account,userId:'user-b'}},{message:{...message,userId:'user-b'}}]){
    let fetched=false;await assert.rejects(()=>createPersonalMailInsight({request,account,message,...change,fetchMessage:async()=>{fetched=true;return {text:'private'};}}),error=>error.code==='MAIL_INSIGHT_NOT_FOUND'&&error.status===404);assert.equal(fetched,false);
  }
});

test('HTML, tracking and remote resources are stripped before deterministic analysis',()=>{
  const raw='<html><head><style>.x{}</style></head><body><img src="https://track.example/pixel"><p>Bitte prüfen</p><script>steal()</script><a href="https://secret.example/x?token=abc">Termin 2026-11-10 um 09:00</a></body></html>',clean=sanitizeMailInsightContent({html:raw});
  assert.match(clean,/Bitte prüfen/);assert.match(clean,/Termin 2026-11-10/);assert.doesNotMatch(clean,/track\.example|secret\.example|token=abc|steal|<img|<script|href=/i);
});

test('raw body never appears in public, persistence, audit or public errors',async()=>{
  const marker='RAW-BODY-NEVER-PERSIST-7f6b',secret='sk-test-do-not-expose-12345678901234567890',result=await createPersonalMailInsight({request,account,message,fetchMessage:async()=>({html:`<p>${marker} ${secret}</p><img src="https://tracker.example/${secret}">`})}),persisted=personalMailInsightPersistenceProjection(result),audit=personalMailInsightAuditProjection(result),serialized=JSON.stringify({result,persisted,audit});
  assert.doesNotMatch(serialized,new RegExp(marker));assert.doesNotMatch(serialized,/sk-test-do-not-expose|tracker\.example/);assert.equal(persisted.policy.bodyPersisted,false);assert.equal(audit.bodyStored,false);assert.equal(audit.secretsExposed,false);
  const failure=publicPersonalMailInsightError(Object.assign(new Error(`${marker} ${secret}`),{code:'UPSTREAM_SECRET',status:502}));assert.doesNotMatch(JSON.stringify(failure),new RegExp(`${marker}|sk-test-do-not-expose`));assert.equal(failure.error,'MAIL_INSIGHT_FAILED');
});

test('size and timeout limits fail closed with stable redacted errors',async()=>{
  await assert.rejects(()=>createPersonalMailInsight({request,account,message,maxBytes:32,fetchMessage:async()=>({text:'x'.repeat(33)})}),error=>error.code==='MAIL_INSIGHT_TOO_LARGE'&&error.status===413);
  let abortObserved=false;const timeoutError=await createPersonalMailInsight({request,account,message,timeoutMs:10,fetchMessage:async({signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{abortObserved=true;reject(new Error('socket closed'));},{once:true}))}).catch(error=>error);assert.equal(abortObserved,true);assert.equal(timeoutError.code,'MAIL_INSIGHT_FETCH_TIMEOUT');assert.equal(timeoutError.status,504);assert.equal(publicPersonalMailInsightError(timeoutError).retryable,true);
});

test('attachment payloads and remotely fetched content are rejected fail closed',async()=>{
  await assert.rejects(()=>createPersonalMailInsight({request,account,message,fetchMessage:async()=>({text:'safe',attachments:[{content:'private attachment'}]})}),error=>error.code==='MAIL_INSIGHT_FETCH_POLICY_VIOLATION');
  await assert.rejects(()=>createPersonalMailInsight({request,account,message,fetchMessage:async()=>({html:'<p>safe</p>',remoteContentFetched:true})}),error=>error.code==='MAIL_INSIGHT_FETCH_POLICY_VIOLATION');
});

test('deterministic fallback exposes only safe signals and no verbatim body',async()=>{
  const marker='UNIQUE PRIVATE MESSAGE CONTENT',result=await createPersonalMailInsight({request,account,message:{...message,subject:'Information'},fetchMessage:async()=>({text:`${marker}. Nur zur Kenntnis.`})}),serialized=JSON.stringify(result);
  assert.equal(result.insight.classification,'INFORMATION');assert.equal(result.insight.actionRequired,false);assert.equal(result.calendarDraft,null);assert.equal(result.conflictInput,null);assert.doesNotMatch(serialized,/UNIQUE PRIVATE MESSAGE CONTENT/);assert.match(result.insight.summary,/Keine eindeutige Aktion/);
});
