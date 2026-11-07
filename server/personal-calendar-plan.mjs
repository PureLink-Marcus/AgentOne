const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CALENDAR_SOURCES=new Set(['calendar.ics','calendar.google']);

function calendarPlanError(message,code='CALENDAR_PLAN_INVALID',status=400){return Object.assign(new Error(message),{code,status});}
function iso(value){const date=value instanceof Date?value:new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null;}
function cleanText(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function assertTimeZone(value){const timeZone=cleanText(value||'Europe/Berlin',100);try{new Intl.DateTimeFormat('en-CA',{timeZone}).format(new Date());}catch{throw calendarPlanError('Zeitzone ist ungültig','CALENDAR_TIME_ZONE_INVALID');}return timeZone;}
function zonedParts(value,timeZone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value);return Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));}
function localToUtc(date,time,timeZone){
  const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);let guess=Date.UTC(year,month-1,day,hour,minute,0,0);
  for(let attempt=0;attempt<3;attempt+=1){const parts=zonedParts(new Date(guess),timeZone),represented=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second),next=guess-(represented-Date.UTC(year,month-1,day,hour,minute,0));if(next===guess)break;guess=next;}
  return new Date(guess);
}
function localDate(value,timeZone){const parts=zonedParts(value,timeZone);return `${String(parts.year).padStart(4,'0')}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;}
function nextDate(date){const [year,month,day]=date.split('-').map(Number),next=new Date(Date.UTC(year,month-1,day+1));return next.toISOString().slice(0,10);}
function safeDate(value,timeZone,now){const date=value==null||value===''?localDate(now,timeZone):String(value);if(!DATE_PATTERN.test(date)||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw calendarPlanError('Datum ist ungültig','CALENDAR_DATE_INVALID');return date;}
function safeTime(value,fallback,field){const time=String(value||fallback);if(!TIME_PATTERN.test(time))throw calendarPlanError(`${field} ist ungültig`,'CALENDAR_WORKDAY_INVALID');return time;}
function eventEnd(event,start){const explicit=iso(event?.structuredPayload?.endAt);if(explicit)return new Date(explicit);const minutes=Math.max(0,Math.min(7*24*60,Number(event?.structuredPayload?.durationMinutes)||0));return new Date(start.getTime()+minutes*60_000);}
function publicProvenance(event){return Object.freeze({source:cleanText(event.source,80),sourceAccount:cleanText(event.sourceAccount,192),connectorId:cleanText(event.provenance?.connectorId||event.source,100),ingestedAt:iso(event.ingestedAt),revisionKey:cleanText(event.provenance?.revisionKey||event.provenance?.rawRecordHash,128)||null});}
function normalizeEvent(event,dayStart,dayEnd){
  if(!event||event.type!=='calendar.event'||!CALENDAR_SOURCES.has(String(event.source)))return null;
  const startIso=iso(event.occurredAt);if(!startIso)return null;const start=new Date(startIso),end=eventEnd(event,start),allDay=Boolean(event.structuredPayload?.allDay),status=cleanText(event.structuredPayload?.status||'confirmed',30).toLowerCase()||'confirmed';
  const effectiveEnd=end>start?end:new Date(start.getTime()+1);if(start>=dayEnd||effectiveEnd<=dayStart)return null;
  return {eventId:cleanText(event.eventId,192),title:cleanText(event.summary||'(Ohne Titel)',500)||'(Ohne Titel)',startAt:start.toISOString(),endAt:end.toISOString(),timeZone:cleanText(event.structuredPayload?.timeZone||'UTC',100)||'UTC',allDay,status,source:cleanText(event.source,80),provenance:publicProvenance(event),_start:start,_end:end};
}
function publicEvent(event){const {_start,_end,...result}=event;return result;}
function conflictRows(events){
  const timed=events.filter(event=>!event.allDay&&event.status!=='cancelled'&&event._end>event._start).sort((left,right)=>left._start-right._start||left.eventId.localeCompare(right.eventId)),conflicts=[];
  for(let index=0;index<timed.length;index+=1)for(let other=index+1;other<timed.length&&timed[other]._start<timed[index]._end;other+=1){const overlapStart=new Date(Math.max(timed[index]._start,timed[other]._start)),overlapEnd=new Date(Math.min(timed[index]._end,timed[other]._end));if(overlapEnd>overlapStart)conflicts.push({eventIds:[timed[index].eventId,timed[other].eventId],overlapStart:overlapStart.toISOString(),overlapEnd:overlapEnd.toISOString(),minutes:Math.round((overlapEnd-overlapStart)/60_000)});}
  return conflicts;
}
function freeRows(events,workStart,workEnd,minFreeMinutes){
  const intervals=events.filter(event=>!event.allDay&&event.status!=='cancelled'&&event._end>workStart&&event._start<workEnd).map(event=>({start:new Date(Math.max(event._start,workStart)),end:new Date(Math.min(event._end,workEnd))})).sort((left,right)=>left.start-right.start),merged=[];
  for(const interval of intervals){const current=merged.at(-1);if(!current||interval.start>current.end)merged.push({...interval});else if(interval.end>current.end)current.end=interval.end;}
  const free=[];let cursor=workStart;for(const interval of merged){if(interval.start>cursor&&(interval.start-cursor)/60_000>=minFreeMinutes)free.push({startAt:cursor.toISOString(),endAt:interval.start.toISOString(),minutes:Math.round((interval.start-cursor)/60_000)});if(interval.end>cursor)cursor=interval.end;}if(workEnd>cursor&&(workEnd-cursor)/60_000>=minFreeMinutes)free.push({startAt:cursor.toISOString(),endAt:workEnd.toISOString(),minutes:Math.round((workEnd-cursor)/60_000)});return free;
}

export function calendarPlanWindow({date,timeZone='Europe/Berlin',now=new Date()}={}){
  const safeZone=assertTimeZone(timeZone),safeNow=new Date(now);if(!Number.isFinite(safeNow.getTime()))throw calendarPlanError('now ist ungültig');const safeDateValue=safeDate(date,safeZone,safeNow),start=localToUtc(safeDateValue,'00:00',safeZone),end=localToUtc(nextDate(safeDateValue),'00:00',safeZone);return Object.freeze({date:safeDateValue,timeZone:safeZone,startAt:start.toISOString(),endAt:end.toISOString(),queryFrom:new Date(start.getTime()-400*24*60*60_000).toISOString(),queryTo:end.toISOString()});
}

export function buildPersonalCalendarPlan({events=[],date,timeZone='Europe/Berlin',workdayStart='08:00',workdayEnd='18:00',minFreeMinutes=30,now=new Date()}={}){
  if(!Array.isArray(events)||events.length>10_000)throw calendarPlanError('Kalenderereignisse sind ungültig','CALENDAR_EVENTS_INVALID');
  const window=calendarPlanWindow({date,timeZone,now}),startTime=safeTime(workdayStart,'08:00','Arbeitsbeginn'),endTime=safeTime(workdayEnd,'18:00','Arbeitsende'),workStart=localToUtc(window.date,startTime,window.timeZone),workEnd=localToUtc(window.date,endTime,window.timeZone),minimum=Number(minFreeMinutes);
  if(workEnd<=workStart||!Number.isInteger(minimum)||minimum<5||minimum>480)throw calendarPlanError('Arbeitsfenster ist ungültig','CALENDAR_WORKDAY_INVALID');
  const dayStart=new Date(window.startAt),dayEnd=new Date(window.endAt),safeNow=new Date(now),normalized=events.map(event=>normalizeEvent(event,dayStart,dayEnd)).filter(Boolean).sort((left,right)=>left._start-right._start||left.eventId.localeCompare(right.eventId)),active=normalized.filter(event=>event.status!=='cancelled'),conflicts=conflictRows(active),freeWindows=freeRows(active,workStart,workEnd,minimum),upcoming=active.filter(event=>event._end>safeNow);
  return Object.freeze({schema:'agentone.calendar.daily-plan/v1',date:window.date,timeZone:window.timeZone,generatedAt:safeNow.toISOString(),day:{startAt:window.startAt,endAt:window.endAt},workday:{startAt:workStart.toISOString(),endAt:workEnd.toISOString(),minFreeMinutes:minimum},events:normalized.map(publicEvent),upcomingEvents:upcoming.map(publicEvent),conflicts,freeWindows,summary:{events:normalized.length,upcoming:upcoming.length,conflicts:conflicts.length,freeWindows:freeWindows.length,busyMinutes:Math.max(0,Math.round((workEnd-workStart)/60_000)-freeWindows.reduce((sum,item)=>sum+item.minutes,0))},policy:{readOnly:true,userIsolated:true,provenanceIncluded:true,detailsMinimized:true,allDayBlocksFreeTime:false,secretsExposed:false}});
}
