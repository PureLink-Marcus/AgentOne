function minutesBetween(start,end){const value=(new Date(end)-new Date(start))/60_000;return Number.isFinite(value)?Math.max(0,Math.round(value)):0;}
function clean(value,max=300){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}

export function icsSnapshotLedgerEvents(userId,snapshot,{sourceAccount='ics-upload',connectorId='ics-upload'}={}){
  const endpointHash=clean(snapshot?.source?.endpointHash,128)||null;
  return (Array.isArray(snapshot?.events)?snapshot.events:[]).map(event=>({userId,source:'calendar.ics',sourceAccount,sourceEventId:event.idempotencyKey,occurredAt:event.start,type:'calendar.event',summary:event.title,structuredPayload:{endAt:event.end,durationMinutes:event.end?minutesBetween(event.start,event.end):0,timeZone:event.timeZone,allDay:Boolean(event.allDay),status:event.status,recurrence:event.recurrence,sequence:event.sequence},provenance:{connectorId,revisionKey:event.revisionKey,endpointHash},sensitivity:'personal',confidence:1}));
}

export function googleSnapshotLedgerEvents(userId,snapshot){
  return (Array.isArray(snapshot?.calendar?.events)?snapshot.calendar.events:[]).filter(event=>event?.start).map(event=>({userId,source:'calendar.google',sourceAccount:'google',sourceEventId:event.idempotencyKey,occurredAt:event.start,type:'calendar.event',summary:event.title,structuredPayload:{endAt:event.end,durationMinutes:event.end?minutesBetween(event.start,event.end):0,timeZone:event.timeZone,allDay:Boolean(event.allDay),status:event.status,calendarId:event.calendarId,recurringEventId:event.recurringEventId||null},provenance:{connectorId:'google',revisionKey:event.revisionKey,calendarId:event.calendarId},sensitivity:'personal',confidence:1}));
}
