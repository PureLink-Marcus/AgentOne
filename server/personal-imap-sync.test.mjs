import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAP_CLASSIFICATION_HEADERS, buildImapFetchPlan, fetchSingleImapInsightContent, normalizeImapFetchMessage, syncImapMailbox } from './personal-imap-sync.mjs';

function rawMessage(uid,overrides={}){
  return {
    uid,
    envelope:{from:[{address:`person${uid}@example.test`}],to:[{address:'me@example.test'}],subject:`Nachricht ${uid}`},
    internalDate:new Date(Date.UTC(2026,10,1,10,uid%60)),
    flags:new Set(uid%2?[]:['\\Seen']),
    labels:new Set(),
    size:1_000+uid,
    headers:Buffer.from('Authentication-Results: mx.example; dmarc=pass; dkim=pass\r\nMessage-ID: <m'+uid+'@example.test>\r\nTo: me@example.test\r\n\r\n'),
    ...overrides,
  };
}

class FakeClient{
  constructor({exists=0,uidValidity='100',messages=[]}={}){this.mailbox={exists,uidValidity:BigInt(uidValidity),uidNext:messages.length?Math.max(...messages.map(item=>item.uid))+1:1};this.messages=messages;this.calls=[];this.released=0;}
  async getMailboxLock(path){assert.equal(path,'INBOX');return {release:()=>{this.released+=1;}};}
  fetch(range,query,options){this.calls.push({range,query,options});const messages=this.messages;return (async function*(){for(const message of messages)yield message;})();}
}

test('initial sync fetches only a bounded newest sequence window and no content',async()=>{
  const client=new FakeClient({exists:800,uidValidity:'9001',messages:[rawMessage(799),rawMessage(800)]});
  const result=await syncImapMailbox({client,account:{id:'mail-a'},maxInitial:2});
  assert.equal(result.mode,'full');assert.equal(result.replace,true);assert.equal(result.fetched,2);assert.deepEqual(result.cursor,{uidValidity:'9001',lastUid:800});assert.equal(result.readOnly,true);assert.equal(result.mutationsApplied,false);assert.equal(result.policy.bodyFetched,false);
  assert.equal(client.calls.length,1);assert.equal(client.calls[0].range,'799:*');assert.deepEqual(client.calls[0].options,{uid:false});assert.deepEqual(client.calls[0].query.headers,IMAP_CLASSIFICATION_HEADERS);assert.equal('source' in client.calls[0].query,false);assert.equal('bodyParts' in client.calls[0].query,false);assert.equal('snippet' in result.messages[0],false);assert.equal('headers' in result.messages[0],false);assert.equal(client.released,1);
});

test('incremental sync resumes strictly after the durable UID cursor',async()=>{
  const client=new FakeClient({exists:50,uidValidity:'77',messages:[rawMessage(42),rawMessage(43)]}),result=await syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'77',lastUid:41}});
  assert.equal(result.mode,'incremental');assert.equal(result.replace,false);assert.equal(client.calls[0].range,'42:*');assert.deepEqual(client.calls[0].options,{uid:true});assert.equal(result.cursor.lastUid,43);
});

test('incremental sync with no newer UID performs no fetch and preserves the cursor',async()=>{
  const client=new FakeClient({exists:50,uidValidity:'77',messages:[]});client.mailbox.uidNext=42;
  const result=await syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'77',lastUid:41}});
  assert.equal(result.mode,'incremental');assert.equal(result.fetched,0);assert.equal(result.cursor.lastUid,41);assert.equal(client.calls.length,0);
});

test('incremental sync advances across safely observed expunged UID gaps',async()=>{
  const client=new FakeClient({exists:50,uidValidity:'77',messages:[]});client.mailbox.uidNext=45;
  const result=await syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'77',lastUid:41}});
  assert.equal(client.calls[0].range,'42:*');assert.equal(result.fetched,0);assert.equal(result.cursor.lastUid,44);
});

test('UIDVALIDITY change forces a bounded full replacement',async()=>{
  const plan=buildImapFetchPlan({mailbox:{exists:12,uidValidity:222n},cursor:{uidValidity:'111',lastUid:900},maxInitial:5});
  assert.equal(plan.plan.mode,'full');assert.equal(plan.plan.reason,'uid_validity_changed');assert.equal(plan.range,'8:*');assert.equal(plan.replace,true);
  const client=new FakeClient({exists:1,uidValidity:'222',messages:[rawMessage(1)]}),result=await syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'111',lastUid:900}});assert.equal(result.mode,'full');assert.equal(result.cursor.lastUid,1);
});

test('empty mailbox advances only UIDVALIDITY and never fetches',async()=>{
  const client=new FakeClient({exists:0,uidValidity:'10'}),result=await syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'9',lastUid:88}});
  assert.equal(result.fetched,0);assert.equal(result.replace,true);assert.deepEqual(result.cursor,{uidValidity:'10',lastUid:null});assert.equal(client.calls.length,0);assert.equal(client.released,1);
});

test('missing UIDVALIDITY fails closed instead of reusing an unsafe cursor',()=>{
  assert.throws(()=>buildImapFetchPlan({mailbox:{exists:2},cursor:{uidValidity:'9',lastUid:8}}),error=>error.code==='IMAP_UIDVALIDITY_REQUIRED');
});

test('duplicate results are collapsed and classification metadata is preserved',async()=>{
  const duplicate=rawMessage(5),client=new FakeClient({exists:2,uidValidity:'3',messages:[duplicate,duplicate]}),result=await syncImapMailbox({client,account:{id:'mail-a'}});
  assert.equal(result.messages.length,1);assert.equal(result.messages[0].category,'people');assert.equal(result.messages[0].confidence,.86);assert.equal(result.messages[0].unread,true);assert.equal(result.groups.people.length,1);
});

test('incremental backlog is rejected without returning an advanced cursor',async()=>{
  const client=new FakeClient({exists:10,uidValidity:'3',messages:[rawMessage(6),rawMessage(7)]});
  await assert.rejects(()=>syncImapMailbox({client,account:{id:'mail-a'},cursor:{uidValidity:'3',lastUid:5},maxIncremental:1}),error=>error.code==='IMAP_INCREMENTAL_BACKLOG_LIMIT');assert.equal(client.released,1);
});

test('normalizer never serializes raw headers, body or source',()=>{
  const value=normalizeImapFetchMessage({account:{id:'mail-a'},message:rawMessage(1,{source:Buffer.from('private body'),bodyParts:new Map([['text',Buffer.from('private body')]])}),uidValidity:'9'}),serialized=JSON.stringify(value);
  assert.doesNotMatch(serialized,/private body/i);assert.equal('source' in value,false);assert.equal('bodyParts' in value,false);assert.equal(value.uidValidity,'9');
});

test('single insight fetch is UIDVALIDITY-bound, partial, read-only and excludes attachments',async()=>{
  const calls=[],client={mailbox:{uidValidity:9001n},getMailboxLock:async()=>({release:()=>calls.push({release:true})}),fetchOne:async(uid,query,options)=>{calls.push({uid,query,options});if(query.bodyStructure)return {uid,bodyStructure:{type:'multipart/mixed',childNodes:[{part:'1',type:'text/plain',encoding:'quoted-printable',parameters:{charset:'utf-8'},size:80},{part:'2',type:'application/pdf',disposition:'attachment',dispositionParameters:{filename:'secret.pdf'},size:9000}]}};return {uid,bodyParts:new Map([['1',Buffer.from('Bitte=20Termin=202026-11-10=20pr=C3=BCfen.')]])};}};
  const result=await fetchSingleImapInsightContent({client,uid:42,uidValidity:'9001',maxBytes:4096});assert.match(result.text,/Bitte Termin 2026-11-10 prüfen/);assert.equal(result.attachmentCount,1);assert.equal(result.remoteContentFetched,false);assert.deepEqual(calls[1],{uid:42,query:{uid:true,bodyParts:[{key:'1',start:0,maxLength:4097}]},options:{uid:true}});assert.deepEqual(calls.at(-1),{release:true});assert.equal(calls.some(call=>call.query?.source),false);
});

test('single insight fetch rejects stale UIDVALIDITY before reading content',async()=>{
  let fetched=false,released=false,client={mailbox:{uidValidity:9002n},getMailboxLock:async()=>({release:()=>{released=true;}}),fetchOne:async()=>{fetched=true;return false;}};await assert.rejects(()=>fetchSingleImapInsightContent({client,uid:42,uidValidity:'9001'}),error=>error.code==='MAIL_INSIGHT_NOT_FOUND'&&error.status===404);assert.equal(fetched,false);assert.equal(released,true);
});
