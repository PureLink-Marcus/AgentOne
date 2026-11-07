import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalHealthComparison, personalHealthComparisonCapabilities } from './personal-health-comparison.mjs';

const definitions={
  steps:['count','sum'],sleep_minutes:['min','sum'],resting_heart_rate_bpm:['bpm','average'],
  hrv_sdnn_ms:['ms','average'],hrv_rmssd_ms:['ms','average'],
};
function normalized({id,source,date,metric='steps',value,receivedAt='2026-11-07T08:00:00.000Z',offset=0,provider=source,sensitivity='health',unit,aggregation}={}){
  const [expectedUnit,expectedAggregation]=definitions[metric]||['count','sum'];
  return {id,source,sourceRecordId:`raw-${id}`,metric,value,unit:unit||expectedUnit,aggregation:aggregation||expectedAggregation,startAt:`${date}T06:00:00.000Z`,endAt:`${date}T07:00:00.000Z`,timezoneOffsetMinutes:offset,dimensions:{privateRaw:'must-not-leak'},sensitivity,interpretation:'descriptive_not_medical',provenance:{provider,originalType:source==='whoop'?'cycle':'HKQuantityTypeIdentifierStepCount',consentId:`consent-${source}-private`,receivedAt}};
}

test('comparison is deterministic, source-separated and contains only minimized provenance',()=>{
  const metrics=[];
  for(let day=1;day<=4;day+=1){const date=`2026-11-0${day}`;metrics.push(normalized({id:`apple-step-${day}`,source:'apple_health',date,value:8000+day*100}),normalized({id:`whoop-step-${day}`,source:'whoop',date,value:7600+day*100}),normalized({id:`apple-sleep-${day}`,source:'apple_health',date,metric:'sleep_minutes',value:420+day}),normalized({id:`whoop-sleep-${day}`,source:'whoop',date,metric:'sleep_minutes',value:400+day}));}
  const options={now:new Date('2026-11-07T12:00:00.000Z'),periodDays:7,minimumCoverageDays:3,timeZone:'UTC'},first=buildPersonalHealthComparison(metrics,options),second=buildPersonalHealthComparison([...metrics].reverse(),options);
  assert.deepEqual(first,second);assert.equal(first.generatedAt,'2026-11-07T12:00:00.000Z');assert.equal(first.sources.apple_health.coverageDays,4);assert.equal(first.sources.whoop.coverageDays,4);assert.equal(first.comparisons.length,8);assert.equal(first.confidence.band,'moderate');
  assert.ok(first.seriesBySource.apple_health.every(item=>item.source==='apple_health'));assert.ok(first.seriesBySource.whoop.every(item=>item.source==='whoop'));assert.equal(first.policy.sourceValuesMerged,false);assert.equal(first.policy.rawRecordsIncluded,false);
  const serialized=JSON.stringify(first);assert.doesNotMatch(serialized,/raw-apple|raw-whoop|sourceRecordId|privateRaw|consent-apple|consent-whoop/);assert.equal(first.comparisons[0].provenance.appleHealth.consentCount,1);assert.equal(first.comparisons[0].interpretation,'descriptive_source_comparison_not_medical');
});

test('coverage and confidence describe data availability rather than health state',()=>{
  const report=buildPersonalHealthComparison([normalized({id:'a1',source:'apple_health',date:'2026-11-07',value:5000})],{now:new Date('2026-11-07T12:00:00Z'),periodDays:14,minimumCoverageDays:3,timeZone:'UTC'});
  assert.equal(report.sources.apple_health.status,'insufficient');assert.equal(report.sources.whoop.status,'missing');assert.equal(report.comparisons.length,0);assert.equal(report.confidence.band,'insufficient');assert.deepEqual(report.notices.filter(item=>item.kind==='coverage').map(item=>item.source),['apple_health','whoop']);assert.ok(report.notices.every(item=>item.medicalAdvice===false));assert.equal(report.policy.medicalDiagnosis,false);assert.equal(report.policy.medicalAdvice,false);assert.match(report.disclaimer,/Keine Diagnose/);
});

test('different HRV methods remain separate and are never merged into a false comparison',()=>{
  const metrics=[];for(let day=1;day<=4;day+=1){const date=`2026-11-0${day}`;metrics.push(normalized({id:`sdnn-${day}`,source:'apple_health',date,metric:'hrv_sdnn_ms',value:55+day}),normalized({id:`rmssd-${day}`,source:'whoop',date,metric:'hrv_rmssd_ms',value:48+day}));}
  const report=buildPersonalHealthComparison(metrics,{now:new Date('2026-11-07T12:00:00Z'),periodDays:7,timeZone:'UTC'});assert.equal(report.comparisons.length,0);assert.equal(report.incompatibilities.length,1);assert.equal(report.incompatibilities[0].topic,'hrv');assert.equal(report.incompatibilities[0].reason,'different_measurement_methods_not_compared');assert.ok(report.seriesBySource.apple_health.every(item=>item.comparability==='source_only'));assert.ok(report.seriesBySource.whoop.every(item=>item.comparability==='source_only'));assert.equal(report.notices.some(item=>item.kind==='method_difference'),true);
});

test('duplicates, conflicts and invalid provenance are counted without echoing rejected records',()=>{
  const original=normalized({id:'same-id',source:'apple_health',date:'2026-11-05',value:1000}),reimport={...original,provenance:{...original.provenance,receivedAt:'2026-11-07T09:00:00.000Z'}},conflict={...original,value:9999},wrongProvider=normalized({id:'wrong-provider',source:'whoop',date:'2026-11-05',value:1000,provider:'apple_health'}),wrongSensitivity=normalized({id:'wrong-sensitivity',source:'apple_health',date:'2026-11-05',value:1000,sensitivity:'public'}),wrongUnit=normalized({id:'wrong-unit',source:'apple_health',date:'2026-11-05',value:1000,unit:'m'}),outside=normalized({id:'outside',source:'apple_health',date:'2026-09-01',value:1000});
  const report=buildPersonalHealthComparison([original,reimport,wrongProvider,wrongSensitivity,wrongUnit,outside],{now:new Date('2026-11-07T12:00:00Z'),periodDays:7,timeZone:'UTC'});assert.equal(report.dataQuality.duplicatesRemoved,1);assert.equal(report.dataQuality.acceptedRecordsInWindow,1);assert.equal(report.dataQuality.outsideWindow,1);assert.deepEqual(report.dataQuality.rejectedByReason,{provenance_invalid:1,sensitivity_invalid:1,unit_mismatch:1});
  const conflicted=buildPersonalHealthComparison([original,conflict],{now:new Date('2026-11-07T12:00:00Z'),periodDays:7,timeZone:'UTC'});assert.equal(conflicted.dataQuality.acceptedRecordsInWindow,0);assert.equal(conflicted.dataQuality.rejectedByReason.duplicate_conflict,2);assert.doesNotMatch(JSON.stringify(conflicted),/9999|same-id/);
});

test('local-day offsets are respected and computation needs no provider credentials',()=>{
  const apple=normalized({id:'offset-apple',source:'apple_health',date:'2026-10-31',value:7000,offset:60}),whoop=normalized({id:'offset-whoop',source:'whoop',date:'2026-10-31',value:6800,offset:60});apple.startAt='2026-10-31T23:30:00.000Z';apple.endAt='2026-10-31T23:45:00.000Z';whoop.startAt=apple.startAt;whoop.endAt=apple.endAt;
  const report=buildPersonalHealthComparison([apple,whoop],{now:new Date('2026-11-01T12:00:00Z'),periodDays:1,minimumCoverageDays:1,timeZone:'UTC'});assert.equal(report.comparisons[0].date,'2026-11-01');assert.equal(report.comparisons[0].confidence.band,'high');assert.equal(personalHealthComparisonCapabilities.credentialsRequiredForComputation,false);assert.equal(personalHealthComparisonCapabilities.medicalDiagnosis,false);assert.equal(Object.hasOwn(personalHealthComparisonCapabilities,'clientSecret'),false);
});

test('resource and normalized-schema boundaries fail closed',()=>{
  assert.throws(()=>buildPersonalHealthComparison(new Array(50_001)),/at most 50000 records/);
  const overlongId=normalized({id:`a${'x'.repeat(192)}`,source:'apple_health',date:'2026-11-07',value:1});
  const numericString=normalized({id:'numeric-string',source:'apple_health',date:'2026-11-07',value:'123'});
  const report=buildPersonalHealthComparison([overlongId,numericString],{now:new Date('2026-11-07T12:00:00Z'),periodDays:1,minimumCoverageDays:1,timeZone:'UTC'});
  assert.equal(report.dataQuality.acceptedRecordsInWindow,0);
  assert.deepEqual(report.dataQuality.rejectedByReason,{id_invalid:1,value_invalid:1});
  assert.equal(personalHealthComparisonCapabilities.maxInputMetrics,50_000);
});
