const DAY_MS=86_400_000;
const MAX_RECORDS_PER_STRATUM=5_000;
const RECENT_DAYS=7;
const BASELINE_DAYS=28;
const USER_ID=/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/;

const SOURCE_LABELS=Object.freeze({apple_health:'Apple Health',whoop:'WHOOP'});
const TREND_SPECS=Object.freeze([
  {source:'apple_health',metric:'steps',label:'Schritte',unit:'count',aggregation:'sum'},
  {source:'apple_health',metric:'active_energy_kcal',label:'Aktive Energie',unit:'kcal',aggregation:'sum'},
  {source:'apple_health',metric:'sleep_minutes',label:'Schlafdauer',unit:'min',aggregation:'sum'},
  {source:'apple_health',metric:'workout_minutes',label:'Trainingsdauer',unit:'min',aggregation:'sum'},
  {source:'apple_health',metric:'resting_heart_rate_bpm',label:'Ruhepuls',unit:'bpm',aggregation:'average'},
  {source:'apple_health',metric:'heart_rate_bpm',label:'Herzfrequenz',unit:'bpm',aggregation:'average'},
  {source:'apple_health',metric:'hrv_sdnn_ms',label:'HRV · SDNN',unit:'ms',aggregation:'average',methodFamily:'hrv',method:'SDNN'},
  {source:'whoop',metric:'sleep_minutes',label:'Schlafdauer',unit:'min',aggregation:'sum'},
  {source:'whoop',metric:'workout_minutes',label:'Trainingsdauer',unit:'min',aggregation:'sum'},
  {source:'whoop',metric:'resting_heart_rate_bpm',label:'Ruhepuls',unit:'bpm',aggregation:'average'},
  {source:'whoop',metric:'heart_rate_bpm',label:'Herzfrequenz',unit:'bpm',aggregation:'average'},
  {source:'whoop',metric:'hrv_rmssd_ms',label:'HRV · RMSSD',unit:'ms',aggregation:'average',methodFamily:'hrv',method:'RMSSD'},
  {source:'whoop',metric:'recovery_score_percent',label:'Recovery',unit:'%',aggregation:'average'},
  {source:'whoop',metric:'strain_score',label:'Belastung',unit:'score',aggregation:'average'},
]);

function trendError(message,code='HEALTH_TRENDS_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function round(value,digits=3){const scale=10**digits;return Math.round(value*scale)/scale;}
function median(values){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
function validDate(value){const date=value instanceof Date?new Date(value):new Date(String(value??''));return Number.isFinite(date.getTime())?date:null;}
function localDateKey(value,timeZone){const date=validDate(value);if(!date)throw trendError('Zeitstempel ist ungültig');try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;}catch{throw trendError('timeZone ist ungültig');}}
function metricDateKey(startAt,offsetMinutes){const date=validDate(startAt),offset=Number(offsetMinutes??0);if(!date||!Number.isFinite(offset)||offset<-840||offset>840)return null;return new Date(date.getTime()+offset*60_000).toISOString().slice(0,10);}
function ordinal(dateKey){return Date.parse(`${dateKey}T00:00:00.000Z`);}
function dateFromOrdinal(value){return new Date(value).toISOString().slice(0,10);}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;}
function safeOriginalType(value){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);}

function confidence(recentDays,baselineDays){
  if(recentDays<2||baselineDays<4)return {band:'insufficient',score:round(Math.min(recentDays/RECENT_DAYS,baselineDays/BASELINE_DAYS),3)};
  const score=round((recentDays/RECENT_DAYS)*0.45+(baselineDays/BASELINE_DAYS)*0.55,3);
  return {band:score>=0.75?'high':score>=0.4?'moderate':'low',score};
}

function normalizeRow(row,{userId,spec,nowMs,windowStart,windowEnd}){
  if(!row||typeof row!=='object'||Array.isArray(row))return {error:'record_invalid'};
  if(Object.hasOwn(row,'userId')&&String(row.userId)!==userId)return {error:'user_mismatch'};
  if(row.source!==spec.source)return {error:'source_mismatch'};
  if(row.metric!==spec.metric)return {error:'metric_mismatch'};
  if(row.unit!==spec.unit||row.aggregation!==spec.aggregation)return {error:'schema_mismatch'};
  if(row.sensitivity!=='health')return {error:'sensitivity_invalid'};
  if(typeof row.value!=='number'||!Number.isFinite(row.value)||Math.abs(row.value)>1_000_000_000)return {error:'value_invalid'};
  const start=validDate(row.startAt),date=metricDateKey(row.startAt,row.timezoneOffsetMinutes);
  if(!start||start.getTime()>nowMs||!date)return {error:'time_invalid'};
  const day=ordinal(date);if(day<windowStart||day>windowEnd)return {error:'outside_window'};
  const provenance=row.provenance;
  if(!provenance||provenance.provider!==spec.source||!String(provenance.consentId??'').trim()||!validDate(provenance.receivedAt)||!safeOriginalType(provenance.originalType))return {error:'provenance_invalid'};
  const id=String(row.id??'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(id))return {error:'id_invalid'};
  return {value:{id,date,day,value:row.value,consentId:String(provenance.consentId),receivedAt:new Date(provenance.receivedAt).toISOString(),originalType:safeOriginalType(provenance.originalType)}};
}

function dailyValues(rows,spec){
  const buckets=new Map();
  for(const row of rows){const bucket=buckets.get(row.date)||{date:row.date,values:[],ids:[],consents:new Set(),types:new Set(),received:[]};bucket.values.push(row.value);bucket.ids.push(row.id);bucket.consents.add(row.consentId);bucket.types.add(row.originalType);bucket.received.push(row.receivedAt);buckets.set(row.date,bucket);}
  return [...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(bucket=>{bucket.received.sort();return {date:bucket.date,value:round(spec.aggregation==='sum'?bucket.values.reduce((sum,value)=>sum+value,0):bucket.values.reduce((sum,value)=>sum+value,0)/bucket.values.length,4),recordCount:bucket.values.length,ids:bucket.ids,consents:bucket.consents,types:bucket.types,firstReceivedAt:bucket.received[0],lastReceivedAt:bucket.received.at(-1)};});
}

function trendFromRows(rows,spec,{recentStart,baselineStart,baselineEnd}){
  const daily=dailyValues(rows,spec),recent=daily.filter(item=>ordinal(item.date)>=recentStart),baseline=daily.filter(item=>{const day=ordinal(item.date);return day>=baselineStart&&day<=baselineEnd;}),recentMedian=median(recent.map(item=>item.value)),baselineMedian=median(baseline.map(item=>item.value)),coverage=confidence(recent.length,baseline.length),available=coverage.band!=='insufficient',difference=available?round(recentMedian-baselineMedian,4):null,changePercent=available&&baselineMedian!==0?round(Math.abs(difference)/Math.max(Math.abs(baselineMedian),1)*100,2):null,direction=!available?'insufficient':changePercent==null?'not_computable':changePercent<5?'stable':difference>0?'up':'down',all=[...baseline,...recent],dependencies=[...new Set(all.flatMap(item=>item.ids))],consents=new Set(),types=new Set();for(const item of all){for(const consent of item.consents)consents.add(consent);for(const type of item.types)types.add(type);}
  return {public:{id:`health-trend:${spec.source}:${spec.metric}`,source:spec.source,sourceLabel:SOURCE_LABELS[spec.source],metric:spec.metric,label:spec.label,unit:spec.unit,aggregation:spec.aggregation,method:spec.method||null,methodFamily:spec.methodFamily||null,crossSourceComparable:spec.methodFamily==='hrv'?false:null,status:available?'available':'insufficient',recent:{median:available?round(recentMedian,4):null,days:recent.length,records:recent.reduce((sum,item)=>sum+item.recordCount,0),firstDate:recent[0]?.date||null,lastDate:recent.at(-1)?.date||null},baseline:{median:available?round(baselineMedian,4):null,days:baseline.length,records:baseline.reduce((sum,item)=>sum+item.recordCount,0),firstDate:baseline[0]?.date||null,lastDate:baseline.at(-1)?.date||null},change:{absolute:difference,percent:changePercent,direction},confidence:{...coverage,basis:{recentWindowDays:RECENT_DAYS,baselineWindowDays:BASELINE_DAYS,recentCoverageDays:recent.length,baselineCoverageDays:baseline.length}},provenance:{source:spec.source,recordCount:all.reduce((sum,item)=>sum+item.recordCount,0),consentCount:consents.size,originalTypeCount:types.size,firstReceivedAt:all.map(item=>item.firstReceivedAt).sort()[0]||null,lastReceivedAt:all.map(item=>item.lastReceivedAt).sort().at(-1)||null},interpretation:'descriptive_personal_baseline_not_medical'},dependencies};
}

export function buildPersonalHealthTrends({userId,loadMetrics,saveDerivedSignal,now=new Date(),timeZone='Europe/Berlin'}={}){
  const owner=String(userId??'').trim();if(!USER_ID.test(owner))throw trendError('userId ist ungültig');
  if(typeof loadMetrics!=='function')throw trendError('loadMetrics fehlt');
  if(saveDerivedSignal!=null&&typeof saveDerivedSignal!=='function')throw trendError('saveDerivedSignal ist ungültig');
  const current=validDate(now);if(!current)throw trendError('now ist ungültig');
  const endDate=localDateKey(current,timeZone),windowEnd=ordinal(endDate),recentStart=windowEnd-(RECENT_DAYS-1)*DAY_MS,baselineEnd=recentStart-DAY_MS,baselineStart=baselineEnd-(BASELINE_DAYS-1)*DAY_MS,queryFrom=new Date(baselineStart-14*3_600_000).toISOString(),queryTo=current.toISOString(),trends=[],quality={loadedRecords:0,acceptedRecords:0,rejectedRecords:0,truncatedStrata:0,rejectedByReason:{}},persistence={saved:0,skippedInsufficient:0,skippedDependencyLimit:0};
  const reject=(reason,count=1)=>{quality.rejectedRecords+=count;quality.rejectedByReason[reason]=(quality.rejectedByReason[reason]||0)+count;};
  for(const spec of TREND_SPECS){
    const loaded=loadMetrics({userId:owner,source:spec.source,metricNames:[spec.metric],from:queryFrom,to:queryTo,limit:MAX_RECORDS_PER_STRATUM});
    if(!Array.isArray(loaded))throw trendError('loadMetrics muss eine Liste liefern','HEALTH_TRENDS_LOADER_INVALID',500);
    quality.loadedRecords+=loaded.length;if(loaded.length>MAX_RECORDS_PER_STRATUM)quality.truncatedStrata+=1;
    const normalized=[];
    for(const row of [...loaded].sort((left,right)=>String(right?.startAt||'').localeCompare(String(left?.startAt||''))).slice(0,MAX_RECORDS_PER_STRATUM)){const result=normalizeRow(row,{userId:owner,spec,nowMs:current.getTime(),windowStart:baselineStart,windowEnd});if(result.error){reject(result.error);continue;}normalized.push(result.value);quality.acceptedRecords+=1;}
    const trend=trendFromRows(normalized,spec,{recentStart,baselineStart,baselineEnd});trends.push(trend.public);
    if(!saveDerivedSignal)continue;
    if(trend.public.status!=='available'){persistence.skippedInsufficient+=1;continue;}
    if(!trend.dependencies.length||trend.dependencies.length>500){persistence.skippedDependencyLimit+=1;continue;}
    saveDerivedSignal({userId:owner,signal:{id:trend.public.id,kind:'personal-health-trend',source:spec.source,metric:spec.metric,recent:trend.public.recent,baseline:trend.public.baseline,change:trend.public.change,confidence:trend.public.confidence,provenance:trend.public.provenance,sensitivity:'health',interpretation:trend.public.interpretation},metricIds:trend.dependencies});persistence.saved+=1;
  }
  const sourceSummary=Object.entries(SOURCE_LABELS).map(([id,label])=>{const rows=trends.filter(item=>item.source===id),available=rows.filter(item=>item.status==='available').length;return {id,label,status:available?'available':rows.some(item=>item.recent.days||item.baseline.days)?'insufficient':'missing',trendCount:rows.length,availableTrendCount:available};});
  return deepFreeze({schema:'agentone.personal-health-trends/v1',generatedAt:current.toISOString(),window:{startDate:dateFromOrdinal(baselineStart),baselineEndDate:dateFromOrdinal(baselineEnd),recentStartDate:dateFromOrdinal(recentStart),endDate,baselineDays:BASELINE_DAYS,recentDays:RECENT_DAYS,timeZone},sources:sourceSummary,trends,dataQuality:{...quality,rejectedByReason:Object.fromEntries(Object.entries(quality.rejectedByReason).sort(([a],[b])=>a.localeCompare(b)))},persistence,methodSeparation:{hrv:{appleHealth:'hrv_sdnn_ms',whoop:'hrv_rmssd_ms',merged:false,reason:'different_measurement_methods'}},policy:{medicalDiagnosis:false,medicalAdvice:false,sourceValuesMerged:false,rawRecordsIncluded:false,rawRecordIdsIncluded:false,consentIdsIncluded:false,secretsExposed:false},disclaimer:'Persönliche Basiswerte und Trends sind ausschließlich deskriptiv. Keine Diagnose, Therapie- oder Behandlungsempfehlung.'});
}

export const personalHealthTrendCapabilities=deepFreeze({schema:'agentone.personal-health-trends/v1',sources:Object.keys(SOURCE_LABELS),recentDays:RECENT_DAYS,baselineDays:BASELINE_DAYS,maxRecordsPerStratum:MAX_RECORDS_PER_STRATUM,stratification:['user','source','metric'],metrics:TREND_SPECS.map(({source,metric,label,unit,aggregation,methodFamily=null,method=null})=>({source,metric,label,unit,aggregation,methodFamily,method})),credentialsRequiredForComputation:false,medicalDiagnosis:false,sourceValuesMerged:false,rawRecordIdsIncluded:false});
