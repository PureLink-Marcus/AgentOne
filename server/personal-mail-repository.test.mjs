import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deletePersonalMailAccountData,
  getPersonalMailMessage,
  listDuePersonalMailSyncs,
  listPersonalMailMessages,
  normalizePersonalMailMessage,
  persistPersonalMailSync,
  personalMailBackoffMinutes,
  recordPersonalMailSyncFailure,
} from './postgres.mjs';

const hash=value=>String(value).repeat(64).slice(0,64);
const message=(overrides={})=>({idempotencyKey:hash('a'),providerId:'imap-42',uid:42,threadKey:hash('b'),sender:'person@example.test',subject:'Treffen morgen',receivedAt:'2026-11-07T09:00:00.000Z',labels:['\\Seen'],category:'people',confidence:.86,classificationSignals:['dmarc-pass','person-authenticated'],needsReview:false,...overrides});

class FakeClient {
  constructor(handler=()=>({rows:[],rowCount:0})){this.handler=handler;this.calls=[];}
  async query(sql,params=[]){this.calls.push({sql,params});return this.handler(sql,params,this.calls.length);}
  release(){this.released=true;}
}

test('mail repository allowlists metadata and rejects body-shaped fields',()=>{
  const value=normalizePersonalMailMessage({...message(),body:'must-not-persist',snippet:'must-not-persist',headers:{authorization:'secret'}});
  assert.deepEqual(Object.keys(value).sort(),['category','classificationSignals','confidence','idempotencyKey','labels','needsReview','providerId','receivedAt','sender','subject','threadKey','uid','uidValidity'].sort());
  assert.equal(JSON.stringify(value).includes('must-not-persist'),false);
  assert.equal(value.subject,'Treffen morgen');
  assert.throws(()=>normalizePersonalMailMessage(message({category:'unknown'})),/Kategorie/);
  assert.throws(()=>normalizePersonalMailMessage(message({idempotencyKey:'not-a-hash'})),/Idempotenz/);
  assert.deepEqual([1,2,3,4,5,6,7].map(personalMailBackoffMinutes),[15,30,60,120,240,360,360]);
});

test('incremental persistence is atomic, idempotent, bounded and content-free',async()=>{
  const rowsBySql=sql=>{
    if(sql.startsWith('SELECT idempotency_key'))return {rows:[{idempotency_key:hash('a')}]};
    if(sql.startsWith('SELECT COUNT'))return {rows:[{total:2}]};
    if(sql.includes('RETURNING account_id AS "accountId"'))return {rows:[{accountId:'mail-1',uidValidity:'9001',lastUid:43,status:'LIVE',lastMode:'incremental',lastSeenCount:2,lastNewCount:1,failureCount:0,lastSuccessAt:'2026-11-07T10:00:00.000Z',nextSyncAt:'2026-11-07T10:15:00.000Z'}]};
    return {rows:[],rowCount:0};
  },client=new FakeClient(rowsBySql),runtime={pool:{connect:async()=>client}},result=await persistPersonalMailSync(runtime,{userId:'user-a',accountId:'mail-1',messages:[message({body:'private body'}),message({idempotencyKey:hash('c'),uid:43,subject:'Neue Nachricht'})],cursor:{uidValidity:'9001',lastUid:43},mode:'incremental',syncedAt:'2026-11-07T10:00:00.000Z'});
  assert.equal(result.stored,2);assert.equal(result.newCount,1);assert.equal(result.updated,1);assert.equal(result.contentStored,false);assert.equal(client.calls[0].sql,'BEGIN');assert.equal(client.calls.at(-1).sql,'COMMIT');assert.equal(client.released,true);
  const serialized=JSON.stringify(client.calls);assert.doesNotMatch(serialized,/private body|snippet|raw.headers/i);assert.match(serialized,/ON CONFLICT\(user_id,account_id,idempotency_key\)/);assert.match(serialized,/OFFSET \$3/);assert.equal(client.calls.every(call=>!call.sql.includes('user-a')&&!call.sql.includes('mail-1')),true);
});

test('message listing is user scoped, parameterized and returns deterministic public metadata',async()=>{
  const injection="%' OR 1=1 --",pool=new FakeClient((sql,params)=>{
    if(sql.startsWith('SELECT account_id'))return {rows:[{accountId:'mail-1',idempotencyKey:hash('a'),providerId:'imap-42',uid:'42',uidValidity:'9001',threadKey:hash('b'),sender:'person@example.test',subject:'Treffen morgen',receivedAt:'2026-11-07T09:00:00.000Z',labels:[],category:'people',confidence:.86,classificationSignals:['person-authenticated'],needsReview:false}]};
    if(sql.startsWith('SELECT COUNT'))return {rows:[{total:4,threads:3,people:1,newsletters:1,transactions:1,spam:1,needsReview:2,unread:3}]};
    return {rows:[]};
  }),result=await listPersonalMailMessages({pool},{userId:'user-a',accountId:'mail-1',category:'people',query:injection,limit:999});
  assert.equal(result.messages.length,1);assert.equal(result.messages[0].id,result.messages[0].idempotencyKey);assert.equal(result.messages[0].unread,true);assert.deepEqual(result.summary,{total:4,threads:3,people:1,newsletters:1,transactions:1,spam:1,categories:{people:1,newsletters:1,transactions:1,spam:1},needsReview:2,unread:3});assert.equal(result.contentExposed,false);
  assert.equal(pool.calls[0].sql.includes(injection),false);assert.equal(pool.calls[0].params[0],'user-a');assert.equal(pool.calls[0].params.at(-1),200);assert.match(pool.calls[0].sql,/ORDER BY received_at DESC,idempotency_key DESC/);await assert.rejects(()=>listPersonalMailMessages({pool},{userId:'user-a',category:'other'}),/Mail-Filter/);
});

test('single message lookup binds user, account, UID and UIDVALIDITY exactly',async()=>{
  const pool=new FakeClient(()=>({rows:[{accountId:'mail-1',idempotencyKey:hash('a'),providerId:'imap-42',uid:'42',uidValidity:'9001',threadKey:hash('b'),sender:'person@example.test',subject:'Treffen morgen',receivedAt:'2026-11-07T09:00:00.000Z',labels:[],category:'people',confidence:.86,classificationSignals:['person-authenticated'],needsReview:false}]})),result=await getPersonalMailMessage({pool},{userId:'user-a',accountId:'mail-1',uid:42,uidValidity:'9001'});
  assert.equal(result.userId,'user-a');assert.equal(result.accountId,'mail-1');assert.equal(result.uid,42);assert.equal(result.uidValidity,'9001');assert.equal(pool.calls.length,1);assert.deepEqual(pool.calls[0].params,['user-a','mail-1',42,'9001']);assert.match(pool.calls[0].sql,/user_id=\$1 AND account_id=\$2 AND uid=\$3 AND uid_validity=\$4/);assert.equal(pool.calls[0].sql.includes('user-a'),false);
  await assert.rejects(()=>getPersonalMailMessage({pool},{userId:'user-a',accountId:'mail-1',uid:0,uidValidity:'9001'}),error=>error.code==='MAIL_INSIGHT_IDENTITY_INVALID');
});

test('failure state uses bounded backoff and due/delete operations remain user bound',async()=>{
  const client=new FakeClient(sql=>{
    if(sql.startsWith('SELECT failure_count'))return {rows:[{failureCount:2}]};
    if(sql.includes('RETURNING account_id AS "accountId"'))return {rows:[{accountId:'mail-1',status:'DEGRADED',failureCount:3,lastErrorCode:'NETWORK_ERROR',lastAttemptAt:'2026-11-07T10:00:00.000Z',nextSyncAt:'2026-11-07T11:00:00.000Z'}]};
    if(sql.startsWith('DELETE FROM personal_mail_messages'))return {rows:[],rowCount:4};
    if(sql.startsWith('DELETE FROM personal_mail_sync_state'))return {rows:[],rowCount:1};
    return {rows:[],rowCount:0};
  }),runtime={pool:{connect:async()=>client}},failure=await recordPersonalMailSyncFailure(runtime,{userId:'user-a',accountId:'mail-1',code:'network error',failedAt:'2026-11-07T10:00:00.000Z'});
  assert.equal(failure.failureCount,3);assert.equal(failure.backoffMinutes,60);assert.equal(failure.lastErrorCode,'NETWORK_ERROR');
  const deleted=await deletePersonalMailAccountData(runtime,{userId:'user-a',accountId:'mail-1'});assert.deepEqual(deleted,{accountId:'mail-1',messages:4,stateRemoved:true,deleted:true});assert.equal(client.calls.filter(call=>call.sql.startsWith('DELETE')).every(call=>call.params[0]==='user-a'&&call.params[1]==='mail-1'),true);
  const duePool=new FakeClient(()=>({rows:[{userId:'user-a',accountId:'mail-1'}]})),due=await listDuePersonalMailSyncs({pool:duePool},{asOf:'2026-11-07T12:00:00.000Z',limit:500});assert.deepEqual(due,[{userId:'user-a',accountId:'mail-1'}]);assert.equal(duePool.calls[0].params[1],100);
});
