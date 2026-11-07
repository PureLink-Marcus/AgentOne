import test from 'node:test';
import assert from 'node:assert/strict';
import { googleSnapshotLedgerEvents,icsSnapshotLedgerEvents } from './personal-calendar-sources.mjs';

test('ICS snapshot mapper persists only minimized calendar fields and hashed feed provenance',()=>{
  const [event]=icsSnapshotLedgerEvents('alice',{source:{endpointHash:'abcdef'},events:[{idempotencyKey:'ics-key',revisionKey:'revision',title:'Termin',start:'2026-11-08T08:00:00Z',end:'2026-11-08T09:00:00Z',timeZone:'Europe/Berlin',allDay:false,status:'confirmed',description:'private',location:'secret address',attendees:['secret@example.test']}]},{sourceAccount:'ics-feed',connectorId:'ics-feed'});
  assert.equal(event.source,'calendar.ics');assert.equal(event.sourceAccount,'ics-feed');assert.equal(event.provenance.endpointHash,'abcdef');
  const serialized=JSON.stringify(event);assert.equal(serialized.includes('private'),false);assert.equal(serialized.includes('secret address'),false);assert.equal(serialized.includes('secret@example.test'),false);
});

test('Google snapshot mapper excludes descriptions, locations, attendees and provider secrets',()=>{
  const [event]=googleSnapshotLedgerEvents('alice',{calendar:{events:[{accountId:'google',calendarId:'primary',idempotencyKey:'google-key',revisionKey:'revision',title:'Review',start:'2026-11-08T10:00:00Z',end:'2026-11-08T11:00:00Z',timeZone:'Europe/Berlin',allDay:false,status:'confirmed',recurringEventId:null,description:'private body',location:'home',attendees:[{email:'secret@example.test'}],accessToken:'provider-secret'}]}});
  assert.equal(event.source,'calendar.google');assert.equal(event.structuredPayload.calendarId,'primary');
  const serialized=JSON.stringify(event);assert.equal(serialized.includes('private body'),false);assert.equal(serialized.includes('secret@example.test'),false);assert.equal(serialized.includes('provider-secret'),false);
});
