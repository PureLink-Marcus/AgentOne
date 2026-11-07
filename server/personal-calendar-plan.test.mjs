import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalCalendarPlan,calendarPlanWindow } from './personal-calendar-plan.mjs';

function event({id,start,end,title='Termin',source='calendar.ics',allDay=false,status='confirmed',payload={},provenance={}}){return {eventId:id,type:'calendar.event',source,sourceAccount:source==='calendar.google'?'google':'ics-upload',occurredAt:start,ingestedAt:'2026-11-07T12:00:00.000Z',summary:title,structuredPayload:{endAt:end,allDay,status,timeZone:'Europe/Berlin',...payload},provenance:{connectorId:source==='calendar.google'?'google':'ics-upload',revisionKey:`revision-${id}`,...provenance}};}

test('daily calendar plan normalizes events, conflicts and free work windows',()=>{
  const plan=buildPersonalCalendarPlan({date:'2026-11-08',timeZone:'Europe/Berlin',workdayStart:'08:00',workdayEnd:'18:00',minFreeMinutes:30,now:'2026-11-08T08:00:00.000Z',events:[
    event({id:'one',start:'2026-11-08T08:30:00.000Z',end:'2026-11-08T09:30:00.000Z',title:'Planung'}),
    event({id:'two',source:'calendar.google',start:'2026-11-08T09:00:00.000Z',end:'2026-11-08T10:00:00.000Z',title:'Review'}),
    event({id:'all-day',start:'2026-11-07T23:00:00.000Z',end:'2026-11-08T23:00:00.000Z',title:'Geburtstag',allDay:true}),
    event({id:'cancelled',start:'2026-11-08T11:00:00.000Z',end:'2026-11-08T12:00:00.000Z',status:'cancelled'}),
    event({id:'outside',start:'2026-11-09T08:00:00.000Z',end:'2026-11-09T09:00:00.000Z'}),
  ]});
  assert.equal(plan.schema,'agentone.calendar.daily-plan/v1');
  assert.equal(plan.events.length,4);
  assert.equal(plan.upcomingEvents.length,3);
  assert.deepEqual(plan.conflicts,[{eventIds:['one','two'],overlapStart:'2026-11-08T09:00:00.000Z',overlapEnd:'2026-11-08T09:30:00.000Z',minutes:30}]);
  assert.deepEqual(plan.freeWindows,[{startAt:'2026-11-08T07:00:00.000Z',endAt:'2026-11-08T08:30:00.000Z',minutes:90},{startAt:'2026-11-08T10:00:00.000Z',endAt:'2026-11-08T17:00:00.000Z',minutes:420}]);
  assert.equal(plan.summary.busyMinutes,90);
  assert.equal(plan.policy.readOnly,true);
  assert.equal(plan.policy.allDayBlocksFreeTime,false);
});

test('daily plan uses DST-aware IANA day boundaries',()=>{
  const spring=calendarPlanWindow({date:'2026-03-29',timeZone:'Europe/Berlin',now:'2026-03-29T12:00:00Z'});
  assert.equal(spring.startAt,'2026-03-28T23:00:00.000Z');
  assert.equal(spring.endAt,'2026-03-29T22:00:00.000Z');
  assert.equal((new Date(spring.endAt)-new Date(spring.startAt))/3_600_000,23);
});

test('public plan projection excludes raw details, PII fields and secrets',()=>{
  const plan=buildPersonalCalendarPlan({date:'2026-11-08',timeZone:'Europe/Berlin',now:'2026-11-08T00:00:00Z',events:[event({id:'safe',start:'2026-11-08T08:00:00Z',end:'2026-11-08T09:00:00Z',payload:{description:'private body',location:'home address',attendees:['secret@example.test'],accessToken:'provider-secret'},provenance:{endpoint:'https://user:password@example.test/feed?token=secret',rawPayload:'never'}})]});
  const serialized=JSON.stringify(plan);
  assert.equal(serialized.includes('private body'),false);
  assert.equal(serialized.includes('home address'),false);
  assert.equal(serialized.includes('secret@example.test'),false);
  assert.equal(serialized.includes('provider-secret'),false);
  assert.equal(serialized.includes('password'),false);
  assert.equal(serialized.includes('rawPayload'),false);
  assert.deepEqual(Object.keys(plan.events[0].provenance),['source','sourceAccount','connectorId','ingestedAt','revisionKey']);
});

test('calendar plan validates dates, time zones and work windows',()=>{
  assert.throws(()=>calendarPlanWindow({date:'2026-02-30'}),error=>error.code==='CALENDAR_DATE_INVALID');
  assert.throws(()=>calendarPlanWindow({date:'2026-11-08',timeZone:'Not/AZone'}),error=>error.code==='CALENDAR_TIME_ZONE_INVALID');
  assert.throws(()=>buildPersonalCalendarPlan({events:[],date:'2026-11-08',workdayStart:'18:00',workdayEnd:'08:00'}),error=>error.code==='CALENDAR_WORKDAY_INVALID');
});
