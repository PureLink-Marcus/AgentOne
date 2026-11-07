const DAY_MS=86_400_000;

function dateKey(value){return value.toISOString().slice(0,10);}

export function buildSyntheticAppleHealthFixture({now=new Date(),daysAgo=2}={}){
  const reference=now instanceof Date?new Date(now):new Date(now);
  if(!Number.isFinite(reference.getTime()))throw new TypeError('now must be a valid timestamp');
  if(!Number.isInteger(daysAgo)||daysAgo<1||daysAgo>30)throw new RangeError('daysAgo must be between 1 and 30');
  const day=dateKey(new Date(reference.getTime()-daysAgo*DAY_MS)),previousDay=dateKey(new Date(reference.getTime()-(daysAgo+1)*DAY_MS));
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="de_DE">
  <Record type="HKQuantityTypeIdentifierStepCount" sourceName="AgentOne Synthetic Smoke" unit="count" creationDate="${day} 08:05:00 +0100" startDate="${day} 07:00:00 +0100" endDate="${day} 08:00:00 +0100" value="1234"/>
  <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="AgentOne Synthetic Smoke" value="HKCategoryValueSleepAnalysisAsleepDeep" creationDate="${day} 08:05:00 +0100" startDate="${previousDay} 23:30:00 +0100" endDate="${day} 00:30:00 +0100"/>
</HealthData>`;
  return Object.freeze({name:'agentone-synthetic-health.xml',mimeType:'application/xml',xml,buffer:Buffer.from(xml,'utf8'),day,previousDay,synthetic:true});
}
