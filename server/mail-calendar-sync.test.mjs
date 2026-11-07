import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMailMessages,mergeMailPage,normalizeCalendarEvent,normalizeCalendars,normalizeMailMessage,planCalendarSync,planMailSync,publicSyncError,selectCalendars,selectedCalendarIds } from './mail-calendar-sync.mjs';

test('normalizes Gmail messages, preserves provider threads and deduplicates pages',()=>{
  const message=normalizeMailMessage({provider:'gmail',accountId:'acc-1',input:{id:'m1',threadId:'t1',internalDate:'1793980800000',snippet:'Hallo',payload:{headers:[{name:'From',value:'Max <max@example.org>'},{name:'To',value:'me@example.org'},{name:'Subject',value:'Treffen'},{name:'Message-ID',value:'<m1@example.org>'},{name:'Authentication-Results',value:'mx; dkim=pass; dmarc=pass'}]}}});
  assert.equal('snippet' in message,false);
  assert.equal(message.threadKey,'gmail:acc-1:t1');assert.equal(message.category,'people');assert.equal(message.needsReview,false);
  assert.equal(mergeMailPage([message],[message]).length,1);assert.equal(groupMailMessages([message,message]).people.length,1);
});

test('mail sync recovers expired Gmail history and changed IMAP UIDVALIDITY',()=>{
  assert.deepEqual(planMailSync({provider:'gmail',cursor:{historyId:'22'}}),{provider:'gmail',mode:'incremental',startHistoryId:'22'});
  assert.equal(planMailSync({provider:'gmail',cursor:{historyId:'22'},remote:{status:404}}).reason,'history_expired');
  assert.equal(planMailSync({provider:'imap',cursor:{uidValidity:'1',lastUid:9},remote:{uidValidity:'2'}}).reason,'uid_validity_changed');
});

test('calendar selection is explicit per account and syncs only selected calendars',()=>{
  const calendars=selectCalendars(normalizeCalendars('acc-1',[{id:'primary',summary:'Privat',primary:true,selected:true},{id:'birthdays',summary:'Geburtstage',hidden:true}]),['primary','birthdays']);
  assert.deepEqual(selectedCalendarIds(calendars),['primary']);
  assert.deepEqual(planCalendarSync(calendars,{primary:{syncToken:'sync-1'}}),[{calendarId:'primary',mode:'incremental',syncToken:'sync-1',showDeleted:true,singleEvents:true}]);
});

test('calendar events and provider failures are normalized without leaking internals',()=>{
  const event=normalizeCalendarEvent({accountId:'acc-1',calendarId:'primary',input:{id:'e1',summary:'Training',start:{dateTime:'2026-11-07T18:00:00+01:00'},end:{dateTime:'2026-11-07T19:00:00+01:00'},attendees:[{email:'max@example.org',responseStatus:'accepted'}]}});
  assert.equal(event.start,'2026-11-07T17:00:00.000Z');assert.equal(event.attendees.length,1);
  const updated=normalizeCalendarEvent({accountId:'acc-1',calendarId:'primary',input:{id:'e1',summary:'Training verschoben',etag:'revision-2',updated:'2026-11-07T18:05:00Z'}});
  assert.equal(updated.idempotencyKey,event.idempotencyKey);assert.notEqual(updated.revisionKey,event.revisionKey);
  const failure=publicSyncError(new Error('401 invalid_grant secret=do-not-leak'),{provider:'google-calendar'});assert.equal(failure.code,'AUTHORIZATION_REQUIRED');assert.doesNotMatch(JSON.stringify(failure),/do-not-leak/);
});
