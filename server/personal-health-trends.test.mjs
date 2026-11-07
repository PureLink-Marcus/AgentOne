import assert from 'node:assert/strict';
import test from 'node:test';
import {buildPersonalHealthTrends,personalHealthTrendCapabilities} from './personal-health-trends.mjs';

const NOW=new Date('2026-11-07T12:00:00.000Z');
function row({id,source='apple_health',metric='sleep_minutes',value=60,date='2026-11-01',unit='min',aggregation='sum',userId='alice',originalType='sleep'}={}){return {id:id||`${source}-${metric}-${date}-${value}`.replace(/[^A-Za-z0-9._:-]/g,'-'),userId,source,metric,value,unit,aggregation,startAt:`${date}T08:00:00.000Z`,endAt:`${date}T09:00:00.000Z`,timezoneOffsetMinutes:0,sensitivity:'health',provenance:{provider:source,consentId:`consent-${source}`,receivedAt:`${date}T10:00:00.000Z`,originalType}};}
function loaderFor(rows,calls=[]){return options=>{calls.push(options);return rows.filter(item=>item.userId===options.userId&&item.source===options.source&&options.metricNames.includes(item.metric)&&item.startAt>=options.from&&item.startAt<=options.to).sort((a,b)=>b.startAt.localeCompare(a.startAt)).slice(0,options.limit);};}

test('builds deterministic source-and-metric-stratified 7d versus prior 28d trends',()=>{
  const rows=[
    row({date:'2026-10-10',value:60}),row({date:'2026-10-15',value:60}),row({date:'2026-10-20',value:60}),row({date:'2026-10-25',value:60}),
    row({date:'2026-11-02',value:48}),row({date:'2026-11-05',value:52}),
  ],calls=[],first=buildPersonalHealthTrends({userId:'alice',loadMetrics:loaderFor(rows,calls),now:NOW,timeZone:'UTC'}),second=buildPersonalHealthTrends({userId:'alice',loadMetrics:loaderFor([...rows].reverse()),now:NOW,timeZone:'UTC'}),trend=first.trends.find(item=>item.source==='apple_health'&&item.metric==='sleep_minutes');
  assert.equal(trend.status,'available');assert.equal(trend.recent.median,50);assert.equal(trend.baseline.median,60);assert.equal(trend.change.absolute,-10);assert.equal(trend.change.percent,16.67);assert.equal(trend.change.direction,'down');assert.equal(trend.confidence.basis.recentCoverageDays,2);assert.equal(trend.confidence.basis.baselineCoverageDays,4);assert.deepEqual(first,second);
  assert.ok(calls.length>2);assert.ok(calls.every(call=>call.userId==='alice'&&call.metricNames.length===1&&call.limit===5000));assert.equal(first.window.recentDays,7);assert.equal(first.window.baselineDays,28);
});

test('keeps Apple SDNN and WHOOP RMSSD as separate non-comparable trends',()=>{
  const dates=['2026-10-10','2026-10-15','2026-10-20','2026-10-25','2026-11-02','2026-11-05'],rows=[];
  for(const [index,date] of dates.entries()){rows.push(row({id:`a-${index}`,source:'apple_health',metric:'hrv_sdnn_ms',value:index<4?45:40,date,unit:'ms',aggregation:'average',originalType:'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'}));rows.push(row({id:`w-${index}`,source:'whoop',metric:'hrv_rmssd_ms',value:index<4?60:55,date,unit:'ms',aggregation:'average',originalType:'recovery'}));}
  const report=buildPersonalHealthTrends({userId:'alice',loadMetrics:loaderFor(rows),now:NOW,timeZone:'UTC'}),hrv=report.trends.filter(item=>item.methodFamily==='hrv');
  assert.deepEqual(hrv.map(item=>[item.source,item.metric,item.method,item.crossSourceComparable]),[['apple_health','hrv_sdnn_ms','SDNN',false],['whoop','hrv_rmssd_ms','RMSSD',false]]);assert.deepEqual(report.methodSeparation.hrv,{appleHealth:'hrv_sdnn_ms',whoop:'hrv_rmssd_ms',merged:false,reason:'different_measurement_methods'});assert.equal(report.policy.sourceValuesMerged,false);
});

test('more than five thousand dense records cannot crowd a sparse metric out of its baseline',()=>{
  const rows=[];for(let index=0;index<6_001;index++){const day=String(4+(index%35)).padStart(2,'0'),month=Number(day)>30?'11':'10',normalizedDay=month==='11'?String(Number(day)-30).padStart(2,'0'):day;rows.push(row({id:`dense-${index}`,source:'apple_health',metric:'heart_rate_bpm',value:60+(index%20),date:`2026-${month}-${normalizedDay}`,unit:'bpm',aggregation:'average',originalType:'heart-rate'}));}
  for(const [index,date] of ['2026-10-10','2026-10-15','2026-10-20','2026-10-25','2026-11-02','2026-11-05'].entries())rows.push(row({id:`sleep-${index}`,date,value:index<4?420:390}));
  const calls=[],report=buildPersonalHealthTrends({userId:'alice',loadMetrics:loaderFor(rows,calls),now:NOW,timeZone:'UTC'}),sleep=report.trends.find(item=>item.source==='apple_health'&&item.metric==='sleep_minutes'),heartCall=calls.find(call=>call.source==='apple_health'&&call.metricNames[0]==='heart_rate_bpm'),sleepCall=calls.find(call=>call.source==='apple_health'&&call.metricNames[0]==='sleep_minutes');
  assert.equal(sleep.status,'available');assert.equal(sleep.baseline.median,420);assert.equal(sleep.recent.median,390);assert.ok(heartCall);assert.ok(sleepCall);assert.notEqual(heartCall.metricNames[0],sleepCall.metricNames[0]);assert.equal(report.dataQuality.loadedRecords>=5_006,true);
});

test('rejects cross-user and cross-source rows and exposes no raw ids, consent ids or secrets',()=>{
  const rows=[];for(const [index,date] of ['2026-10-10','2026-10-15','2026-10-20','2026-10-25','2026-11-02','2026-11-05'].entries())rows.push(row({id:`alice-raw-${index}`,date,value:index<4?400:380}));rows.push({...row({id:'bob-raw-secret',date:'2026-11-05',value:999,userId:'bob'}),apiKey:'sk-super-secret'});rows.push({...row({id:'wrong-source-secret',date:'2026-11-05',value:999}),source:'whoop',provenance:{provider:'whoop',consentId:'secret-consent',receivedAt:'2026-11-05T10:00:00.000Z',originalType:'secret-type'}});
  const report=buildPersonalHealthTrends({userId:'alice',loadMetrics:options=>rows.filter(item=>item.metric===options.metricNames[0]),now:NOW,timeZone:'UTC'}),sleep=report.trends.find(item=>item.source==='apple_health'&&item.metric==='sleep_minutes'),serialized=JSON.stringify(report);
  assert.equal(sleep.baseline.median,400);assert.equal(sleep.recent.median,380);assert.ok(report.dataQuality.rejectedByReason.user_mismatch>=1);assert.ok(report.dataQuality.rejectedByReason.source_mismatch>=1);assert.doesNotMatch(serialized,/alice-raw|bob-raw|wrong-source|secret-consent|sk-super-secret|apiKey|metricIds|"consentId"\s*:/);assert.equal(report.policy.rawRecordIdsIncluded,false);assert.equal(report.policy.consentIdsIncluded,false);assert.equal(report.policy.secretsExposed,false);
});

test('persists only adequate trends through a dependency-injected encrypted-store boundary',()=>{
  const rows=[];for(const [index,date] of ['2026-10-10','2026-10-15','2026-10-20','2026-10-25','2026-11-02','2026-11-05'].entries())rows.push(row({id:`dependency-${index}`,date,value:index<4?420:390}));const saved=[];
  const report=buildPersonalHealthTrends({userId:'alice',loadMetrics:loaderFor(rows),saveDerivedSignal:input=>{saved.push(input);return {id:input.signal.id};},now:NOW,timeZone:'UTC'}),sleep=saved.find(item=>item.signal.metric==='sleep_minutes');
  assert.ok(sleep);assert.equal(sleep.userId,'alice');assert.equal(sleep.signal.sensitivity,'health');assert.deepEqual(sleep.metricIds.sort(),rows.map(item=>item.id).sort());assert.equal(report.persistence.saved,1);assert.ok(report.persistence.skippedInsufficient>0);assert.doesNotMatch(JSON.stringify(report),/dependency-|metricIds/);assert.equal(Object.isFrozen(report),true);assert.equal(personalHealthTrendCapabilities.credentialsRequiredForComputation,false);
});

test('validates the user, loader and time-zone boundary',()=>{
  assert.throws(()=>buildPersonalHealthTrends({userId:'bad user',loadMetrics:()=>[]}),/userId/);
  assert.throws(()=>buildPersonalHealthTrends({userId:'alice'}),/loadMetrics/);
  assert.throws(()=>buildPersonalHealthTrends({userId:'alice',loadMetrics:()=>[],timeZone:'Mars\/Olympus'}),/timeZone/);
  assert.throws(()=>buildPersonalHealthTrends({userId:'alice',loadMetrics:()=>({})}),/Liste/);
});
