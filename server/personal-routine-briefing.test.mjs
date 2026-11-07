import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutineBriefingResult } from './personal-routine-briefing.mjs';

const routine={id:'routine-1',action:'morning-briefing'};
const intelligence={
  generatedAt:'2026-11-08T07:30:00.000Z',
  eventCount:503,
  summary:{attention:2,informational:1},
  ledger:{total:503},
  sources:[
    {id:'mail',status:'LIVE',records:500,accounts:1},
    {id:'calendar',status:'NOT_CONNECTED',records:0,calendars:0},
    {id:'health',status:'READY',records:3,rawValue:9876},
  ],
  signals:[
    {id:'mail.daily-triage',domain:'mail',severity:'attention',title:'Private Mail Subject',summary:'secret@example.test sk-not-a-real-key-1234567890',confidence:.81234,evidence:[{source:'mail.imap',externalId:'private-id',subject:'never'}]},
    {id:'health.weekly-pattern',domain:'health',severity:'info',title:'HRV 12ms',summary:'raw health 12',confidence:.7,evidence:[{source:'whoop',externalId:'health-private'}]},
  ],
  secret:'should-never-serialize',
};

test('scheduled briefing projection is useful, bounded and contains no source payloads',()=>{
  const result=buildRoutineBriefingResult({routine,intelligence,commandRunId:'command-1',sourceFreshness:[
    {source:'mail',status:'LIVE',freshness:'FRESH',lastSuccessAt:'2026-11-08T07:29:00.000Z',attemptedAt:'2026-11-08T07:29:00.000Z',outcome:'SYNCED',accounts:1,password:'never'},
    {source:'google',status:'DEGRADED',freshness:'STALE_FALLBACK',lastSuccessAt:'2026-11-08T06:00:00.000Z',attemptedAt:'2026-11-08T07:29:30.000Z',outcome:'FAILED',errorCode:'GOOGLE_TIMEOUT',refreshToken:'secret'},
    {source:'ics',status:'DEGRADED',freshness:'DEGRADED',outcome:'FAILED',errorCode:'ACCESS_TOKEN_SUPERSECRET'},
  ]});
  assert.equal(result.schema,'agentone.personal-routine-result/v2');
  assert.equal(result.summary.events,503);
  assert.equal(result.insights.length,2);
  assert.equal(result.sources[0].records,500);
  assert.equal(result.sourceFreshness[0].freshness,'FRESH');
  assert.equal(result.sourceFreshness[1].errorCode,'GOOGLE_TIMEOUT');
  assert.equal(result.sourceFreshness[2].errorCode,null);
  assert.match(result.contentHash,/^[a-f0-9]{64}$/);
  const serialized=JSON.stringify(result);
  for(const forbidden of ['Private Mail Subject','secret@example.test','sk-not-a-real-key','private-id','health-private','raw health 12','9876','should-never-serialize','password','refreshToken'])assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.equal(result.policy.bodyStored,false);
  assert.equal(result.policy.rawHealthValuesStored,false);
  assert.equal(result.policy.secretsExposed,false);
});

test('mail summary retains only mail source and mail insight',()=>{
  const result=buildRoutineBriefingResult({routine:{id:'mail-routine',action:'mail-summary'},intelligence,sourceFreshness:[{source:'mail',status:'LIVE',freshness:'FRESH'},{source:'google',status:'LIVE',freshness:'FRESH'},{source:'ics',status:'LIVE',freshness:'FRESH'}]});
  assert.deepEqual(result.sources.map(item=>item.id),['mail']);
  assert.deepEqual(result.sourceFreshness.map(item=>item.source),['mail','google']);
  assert.deepEqual(result.insights.map(item=>item.id),['mail.daily-triage']);
});

test('unsupported placeholder actions fail honestly',()=>{
  assert.throws(()=>buildRoutineBriefingResult({routine:{id:'home',action:'home-summary'},intelligence}),error=>error.code==='ROUTINE_ACTION_NOT_EXECUTABLE'&&error.status===409);
});
