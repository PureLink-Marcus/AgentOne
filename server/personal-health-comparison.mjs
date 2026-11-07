const DAY_MS=86_400_000;
const MAX_METRICS=50_000;
const SOURCES=Object.freeze(['apple_health','whoop']);
const SOURCE_LABELS=Object.freeze({apple_health:'Apple Health',whoop:'WHOOP'});
const METRICS=Object.freeze({
  steps:{unit:'count',aggregation:'sum',comparable:true},
  active_energy_kcal:{unit:'kcal',aggregation:'sum',comparable:true},
  sleep_minutes:{unit:'min',aggregation:'sum',comparable:true},
  workout_minutes:{unit:'min',aggregation:'sum',comparable:true},
  resting_heart_rate_bpm:{unit:'bpm',aggregation:'average',comparable:true},
  heart_rate_bpm:{unit:'bpm',aggregation:'average',comparable:true},
  oxygen_saturation_percent:{unit:'%',aggregation:'average',comparable:true},
  respiratory_rate_per_minute:{unit:'count/min',aggregation:'average',comparable:true},
  body_mass_kg:{unit:'kg',aggregation:'average',comparable:true},
  walking_running_distance_m:{unit:'m',aggregation:'sum',comparable:false},
  exercise_minutes:{unit:'min',aggregation:'sum',comparable:false},
  strain_score:{unit:'score',aggregation:'average',comparable:false},
  recovery_score_percent:{unit:'%',aggregation:'average',comparable:false},
  sleep_performance_percent:{unit:'%',aggregation:'average',comparable:false},
  sleep_consistency_percent:{unit:'%',aggregation:'average',comparable:false},
  sleep_efficiency_percent:{unit:'%',aggregation:'average',comparable:false},
  hrv_sdnn_ms:{unit:'ms',aggregation:'average',comparable:false},
  hrv_rmssd_ms:{unit:'ms',aggregation:'average',comparable:false},
  body_temperature_celsius:{unit:'degC',aggregation:'average',comparable:false},
  skin_temperature_celsius:{unit:'degC',aggregation:'average',comparable:false},
});
const METHOD_DIFFERENCES=Object.freeze([
  {topic:'hrv',appleMetric:'hrv_sdnn_ms',whoopMetric:'hrv_rmssd_ms',reason:'different_measurement_methods_not_compared'},
  {topic:'temperature',appleMetric:'body_temperature_celsius',whoopMetric:'skin_temperature_celsius',reason:'different_measurement_locations_not_compared'},
]);
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

function round(value,digits=3){const scale=10**digits;return Math.round(value*scale)/scale;}
function validDate(value){const date=value instanceof Date?new Date(value):new Date(value);return Number.isFinite(date.getTime())?date:null;}
function safeText(value,max=120){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function localDateKey(value,timeZone){const date=validDate(value);if(!date)throw new TypeError('now must be a valid timestamp');try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;}catch{throw new TypeError('timeZone must be a valid IANA timezone');}}
function metricDateKey(startAt,offsetMinutes){const date=validDate(startAt);if(!date)return null;const offset=Number(offsetMinutes);return new Date(date.getTime()+(Number.isFinite(offset)?offset:0)*60_000).toISOString().slice(0,10);}
function ordinal(dateKey){return Date.parse(`${dateKey}T00:00:00.000Z`);}
function confidenceBand(score,overlapDays,minimumCoverageDays){if(overlapDays<minimumCoverageDays)return 'insufficient';if(score>=0.75)return 'high';if(score>=0.4)return 'moderate';return 'low';}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;}

function normalizeMetric(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return {error:'record_invalid'};
  const rawId=String(input.id??'').trim(),source=safeText(input.source,40),metric=safeText(input.metric,100),definition=METRICS[metric];
  if(rawId.length>192||/[\u0000-\u001f\u007f]/.test(rawId)||!ID.test(rawId))return {error:'id_invalid'};
  const id=rawId;
  if(!SOURCES.includes(source))return {error:'source_unsupported'};
  if(!definition)return {error:'metric_unsupported'};
  const value=input.value;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1_000_000_000)return {error:'value_invalid'};
  if(input.unit!==definition.unit)return {error:'unit_mismatch'};
  if(input.aggregation!==definition.aggregation)return {error:'aggregation_mismatch'};
  if(input.sensitivity!=='health')return {error:'sensitivity_invalid'};
  const startAt=validDate(input.startAt),endAt=validDate(input.endAt??input.startAt);if(!startAt||!endAt||endAt<startAt)return {error:'time_invalid'};
  const provenance=input.provenance;if(!provenance||typeof provenance!=='object'||provenance.provider!==source||!safeText(provenance.consentId,128))return {error:'provenance_invalid'};
  const receivedAt=validDate(provenance.receivedAt);if(!receivedAt)return {error:'provenance_invalid'};
  const timezoneOffsetMinutes=input.timezoneOffsetMinutes==null?0:Number(input.timezoneOffsetMinutes);if(!Number.isFinite(timezoneOffsetMinutes)||timezoneOffsetMinutes<-840||timezoneOffsetMinutes>840)return {error:'timezone_invalid'};
  const originalType=safeText(provenance.originalType,120);if(!originalType)return {error:'provenance_invalid'};
  const normalized={id,source,metric,value,unit:definition.unit,aggregation:definition.aggregation,startAt:startAt.toISOString(),endAt:endAt.toISOString(),timezoneOffsetMinutes,originalType,consentId:safeText(provenance.consentId,128),receivedAt:receivedAt.toISOString()};
  normalized.date=metricDateKey(normalized.startAt,timezoneOffsetMinutes);
  normalized.signature=JSON.stringify([source,metric,value,normalized.unit,normalized.aggregation,normalized.startAt,normalized.endAt,timezoneOffsetMinutes,originalType]);
  return {value:normalized};
}

function prepareMetrics(metrics,windowStart,windowEnd){
  const rejectedByReason={},groups=new Map();let rejectedRecords=0,duplicatesRemoved=0,outsideWindow=0;
  const reject=(reason,count=1)=>{rejectedRecords+=count;rejectedByReason[reason]=(rejectedByReason[reason]||0)+count;};
  for(const input of metrics){const normalized=normalizeMetric(input);if(normalized.error){reject(normalized.error);continue;}const rows=groups.get(normalized.value.id)||[];rows.push(normalized.value);groups.set(normalized.value.id,rows);}
  const unique=[];
  for(const rows of groups.values()){
    const signatures=new Set(rows.map(row=>row.signature));
    if(signatures.size>1){reject('duplicate_conflict',rows.length);continue;}
    rows.sort((left,right)=>left.receivedAt.localeCompare(right.receivedAt)||left.consentId.localeCompare(right.consentId));unique.push(rows[0]);duplicatesRemoved+=rows.length-1;
  }
  const inWindow=[];for(const row of unique){const time=ordinal(row.date);if(time<windowStart||time>windowEnd){outsideWindow+=1;continue;}inWindow.push(row);}
  inWindow.sort((left,right)=>left.source.localeCompare(right.source)||left.date.localeCompare(right.date)||left.metric.localeCompare(right.metric)||left.id.localeCompare(right.id));
  return {metrics:inWindow,quality:{inputRecords:metrics.length,acceptedRecordsInWindow:inWindow.length,rejectedRecords,duplicatesRemoved,outsideWindow,rejectedByReason:Object.fromEntries(Object.entries(rejectedByReason).sort(([left],[right])=>left.localeCompare(right)))}};
}

function aggregateDaily(metrics){
  const buckets=new Map();
  for(const metric of metrics){const key=`${metric.source}|${metric.date}|${metric.metric}`,bucket=buckets.get(key)||{source:metric.source,date:metric.date,metric:metric.metric,unit:metric.unit,aggregation:metric.aggregation,values:[],originalTypes:new Set(),consentIds:new Set(),receivedAt:[]};bucket.values.push(metric.value);bucket.originalTypes.add(metric.originalType);bucket.consentIds.add(metric.consentId);bucket.receivedAt.push(metric.receivedAt);buckets.set(key,bucket);}
  return [...buckets.values()].map(bucket=>{const value=bucket.aggregation==='sum'?bucket.values.reduce((sum,item)=>sum+item,0):bucket.values.reduce((sum,item)=>sum+item,0)/bucket.values.length;bucket.receivedAt.sort();return {source:bucket.source,date:bucket.date,metric:bucket.metric,value:round(value,4),unit:bucket.unit,aggregation:bucket.aggregation,sampleCount:bucket.values.length,comparability:METRICS[bucket.metric].comparable?'cross_source':'source_only',provenance:{provider:bucket.source,originalTypes:[...bucket.originalTypes].sort(),recordCount:bucket.values.length,consentCount:bucket.consentIds.size,firstReceivedAt:bucket.receivedAt[0],lastReceivedAt:bucket.receivedAt.at(-1)}};}).sort((left,right)=>left.date.localeCompare(right.date)||left.metric.localeCompare(right.metric)||left.source.localeCompare(right.source));
}

function coverageFor(source,daily,periodDays,minimumCoverageDays){
  const rows=daily.filter(item=>item.source===source),dates=new Set(rows.map(item=>item.date)),metrics={};
  for(const item of rows){const entry=metrics[item.metric]||{days:new Set(),records:0};entry.days.add(item.date);entry.records+=item.sampleCount;metrics[item.metric]=entry;}
  const coverageRatio=round(dates.size/periodDays,3);
  return {source,label:SOURCE_LABELS[source],status:dates.size===0?'missing':dates.size<minimumCoverageDays?'insufficient':'available',coverageDays:dates.size,periodDays,coverageRatio,metricCoverage:Object.fromEntries(Object.entries(metrics).sort(([left],[right])=>left.localeCompare(right)).map(([metric,item])=>[metric,{days:item.days.size,records:item.records,coverageRatio:round(item.days.size/periodDays,3)}]))};
}

function compareDaily(daily,coverages,periodDays,minimumCoverageDays){
  const keyed=new Map(),overlapByMetric=new Map();
  for(const item of daily){if(!METRICS[item.metric].comparable)continue;const key=`${item.date}|${item.metric}`,entry=keyed.get(key)||{};entry[item.source]=item;keyed.set(key,entry);}
  for(const entry of keyed.values())if(entry.apple_health&&entry.whoop)overlapByMetric.set(entry.apple_health.metric,(overlapByMetric.get(entry.apple_health.metric)||0)+1);
  const comparisons=[];
  for(const [key,entry] of [...keyed.entries()].sort(([left],[right])=>left.localeCompare(right))){
    if(!entry.apple_health||!entry.whoop)continue;
    const [date,metric]=key.split('|'),apple=entry.apple_health,whoop=entry.whoop,absoluteDifference=round(apple.value-whoop.value,4),baseline=Math.max(Math.abs(apple.value),Math.abs(whoop.value),1),relativeDifferencePercent=round(Math.abs(absoluteDifference)/baseline*100,2),appleDays=coverages.apple_health.metricCoverage[metric]?.days||0,whoopDays=coverages.whoop.metricCoverage[metric]?.days||0,overlapDays=overlapByMetric.get(metric)||0,score=round((Math.min(appleDays,whoopDays)/periodDays)*0.4+(overlapDays/periodDays)*0.6,3);
    comparisons.push({date,metric,unit:apple.unit,values:{appleHealth:apple.value,whoop:whoop.value},difference:{absolute: absoluteDifference,relativePercent:relativeDifferencePercent,band:relativeDifferencePercent>=20?'large_source_difference':relativeDifferencePercent>=10?'moderate_source_difference':'small_source_difference'},confidence:{score,band:confidenceBand(score,overlapDays,minimumCoverageDays),basis:{periodDays,appleHealthDays:appleDays,whoopDays,overlapDays}},provenance:{appleHealth:apple.provenance,whoop:whoop.provenance},interpretation:'descriptive_source_comparison_not_medical'});
  }
  return comparisons;
}

export function buildPersonalHealthComparison(metrics=[],{now=new Date(),periodDays=14,minimumCoverageDays=3,timeZone='Europe/Berlin'}={}){
  if(!Array.isArray(metrics))throw new TypeError('metrics must be an array');
  if(metrics.length>MAX_METRICS)throw new RangeError(`metrics must contain at most ${MAX_METRICS} records`);
  const current=validDate(now);if(!current)throw new TypeError('now must be a valid timestamp');
  if(!Number.isInteger(periodDays)||periodDays<1||periodDays>90)throw new RangeError('periodDays must be between 1 and 90');
  if(!Number.isInteger(minimumCoverageDays)||minimumCoverageDays<1||minimumCoverageDays>periodDays)throw new RangeError('minimumCoverageDays must be within the comparison period');
  const endDate=localDateKey(current,timeZone),windowEnd=ordinal(endDate),windowStart=windowEnd-(periodDays-1)*DAY_MS,startDate=new Date(windowStart).toISOString().slice(0,10),prepared=prepareMetrics(metrics,windowStart,windowEnd),daily=aggregateDaily(prepared.metrics),coverages=Object.fromEntries(SOURCES.map(source=>[source,coverageFor(source,daily,periodDays,minimumCoverageDays)])),comparisons=compareDaily(daily,coverages,periodDays,minimumCoverageDays);
  const presentMetrics=new Set(daily.map(item=>`${item.source}:${item.metric}`)),incompatibilities=METHOD_DIFFERENCES.filter(item=>presentMetrics.has(`apple_health:${item.appleMetric}`)&&presentMetrics.has(`whoop:${item.whoopMetric}`)).map(item=>({...item,interpretation:'descriptive_only'}));
  const metricConfidence=new Map();for(const item of comparisons){const currentScore=metricConfidence.get(item.metric);if(currentScore==null||item.confidence.score>currentScore)metricConfidence.set(item.metric,item.confidence.score);}const confidenceScore=metricConfidence.size?round([...metricConfidence.values()].reduce((sum,value)=>sum+value,0)/metricConfidence.size,3):0,confidenceOverlap=comparisons.length?Math.max(...comparisons.map(item=>item.confidence.basis.overlapDays)):0;
  const notices=[];for(const source of SOURCES)if(coverages[source].coverageDays<minimumCoverageDays)notices.push({kind:'coverage',source,title:`${SOURCE_LABELS[source]}: noch zu wenig Tage`,action:'Weitere Daten synchronisieren oder importieren',medicalAdvice:false});const reliableDifferences=comparisons.filter(item=>item.difference.relativePercent>=20&&item.confidence.band!=='insufficient');if(reliableDifferences.length)notices.push({kind:'source_difference',title:'Messquellen weichen voneinander ab',count:reliableDifferences.length,action:'Tragezeiten, Zeitzonen und Quellenabdeckung prüfen',medicalAdvice:false});for(const item of incompatibilities)notices.push({kind:'method_difference',topic:item.topic,title:'Unterschiedliche Messmethoden werden nicht zusammengeführt',action:'Quellen getrennt betrachten',medicalAdvice:false});
  const result={schema:'agentone.personal-health-comparison/v1',generatedAt:current.toISOString(),window:{startDate,endDate,periodDays,timeZone},sources:coverages,seriesBySource:Object.fromEntries(SOURCES.map(source=>[source,daily.filter(item=>item.source===source)])),comparisons,incompatibilities,confidence:{score:confidenceScore,band:confidenceBand(confidenceScore,confidenceOverlap,minimumCoverageDays),basis:{comparableMetrics:metricConfidence.size,comparisonDays:new Set(comparisons.map(item=>item.date)).size,periodDays}},dataQuality:prepared.quality,notices,policy:{medicalDiagnosis:false,medicalAdvice:false,rawRecordsIncluded:false,rawRecordIdsIncluded:false,sourceValuesMerged:false,secretsExposed:false},disclaimer:'Nur deskriptiver Vergleich persönlicher Messreihen. Keine Diagnose, Therapie- oder Behandlungsempfehlung.'};
  return deepFreeze(result);
}

export const personalHealthComparisonCapabilities=deepFreeze({schema:'agentone.personal-health-comparison/v1',sources:[...SOURCES],maxInputMetrics:MAX_METRICS,supportedMetrics:Object.entries(METRICS).map(([id,value])=>({id,unit:value.unit,aggregation:value.aggregation,comparability:value.comparable?'cross_source':'source_only'})),methodDifferences:METHOD_DIFFERENCES,credentialsRequiredForComputation:false,medicalDiagnosis:false,sourceValuesMerged:false});
