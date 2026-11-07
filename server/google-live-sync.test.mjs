import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GoogleSyncError,
  refreshGoogleAccessToken,
  syncGmailReadOnly,
  syncGoogleCalendarReadOnly,
  syncGoogleReadOnly,
} from './google-live-sync.mjs';
import { normalizeCalendarEvent } from './mail-calendar-sync.mjs';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function router(routes) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input), route = routes.find((entry) => (typeof entry.match === 'string' ? url.includes(entry.match) : entry.match(url, init)));
    calls.push({ url, init });
    if (!route) throw new Error(`unexpected request ${url}`);
    return typeof route.reply === 'function' ? route.reply(url, init, calls) : route.reply;
  };
  return { fetchImpl, calls };
}

const gmailProfile = { emailAddress: 'user@example.com', messagesTotal: 2, threadsTotal: 2, historyId: '20' };
const gmailMessage = (id, subject = 'Hallo') => ({ id, threadId: `t-${id}`, internalDate: '1794045600000', labelIds: ['INBOX', 'UNREAD'], snippet: 'must not persist', payload: { headers: [
  { name: 'From', value: 'Person <person@example.com>' }, { name: 'To', value: 'user@example.com' },
  { name: 'Subject', value: subject }, { name: 'Message-ID', value: `<${id}@example.com>` },
  { name: 'Authentication-Results', value: 'mx; dkim=pass; spf=pass; dmarc=pass' },
] } });

test('refreshes an OAuth token without returning or exposing credentials', async () => {
  let rotated = null;
  const { fetchImpl, calls } = router([{ match: 'oauth2.googleapis.com/token', reply: json({ access_token: 'access-secret', refresh_token: 'rotated-secret', expires_in: 3600, scope: 'scope-a scope-b' }) }]);
  const result = await refreshGoogleAccessToken({ clientId: 'client', clientSecret: 'client-secret', refreshToken: 'refresh-secret', onRotatedRefreshToken: (value) => { rotated = value; }, fetchImpl });
  assert.equal(result.accessToken, 'access-secret');
  assert.deepEqual(result.scopes, ['scope-a', 'scope-b']);
  assert.match(String(calls[0].init.body), /grant_type=refresh_token/);
  assert.equal(JSON.stringify(result).includes('refresh-secret'), false);
  assert.equal(JSON.stringify(result).includes('rotated-secret'), false);
  assert.equal(rotated, 'rotated-secret');
});

test('performs a full Gmail metadata sync without retaining message bodies', async () => {
  const { fetchImpl } = router([
    { match: '/profile', reply: json(gmailProfile) },
    { match: (url) => url.includes('/messages?'), reply: json({ messages: [{ id: 'm1' }, { id: 'm2' }] }) },
    { match: '/messages/m1?', reply: json(gmailMessage('m1')) },
    { match: '/messages/m2?', reply: json(gmailMessage('m2', 'Rechnung 2026')) },
  ]);
  const result = await syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', fetchImpl });
  assert.equal(result.mode, 'full');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages.some((item) => Object.hasOwn(item, 'snippet')), false);
  assert.equal(JSON.stringify(result).includes('must not persist'), false);
  assert.equal(result.messages.find((item) => item.providerId === 'm2').category, 'transactions');
  assert.equal(result.cursor.historyId, '20');
  assert.equal(result.policy.messageBodiesFetched, false);
});

test('uses Gmail history and falls back to a full sync when the cursor expired', async () => {
  let historyCalls = 0;
  const { fetchImpl } = router([
    { match: '/profile', reply: json(gmailProfile) },
    { match: '/history?', reply: () => { historyCalls += 1; return json({}, 404); } },
    { match: (url) => url.includes('/messages?'), reply: json({ messages: [{ id: 'm3' }] }) },
    { match: '/messages/m3?', reply: json(gmailMessage('m3')) },
  ]);
  const result = await syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', cursor: { historyId: '1' }, fetchImpl });
  assert.equal(historyCalls, 1);
  assert.equal(result.mode, 'full');
  assert.equal(result.messages[0].providerId, 'm3');
});

test('returns redacted retry guidance for provider throttling', async () => {
  const { fetchImpl } = router([{ match: '/profile', reply: json({ error: { message: 'contains-sensitive-provider-detail' } }, 429, { 'retry-after': '17' }) }]);
  await assert.rejects(
    () => syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token-secret', fetchImpl }),
    (error) => error instanceof GoogleSyncError && error.retryable && error.retryAfterSeconds === 17
      && !JSON.stringify(error.toPublicJSON()).includes('contains-sensitive-provider-detail')
      && !JSON.stringify(error.toPublicJSON()).includes('token-secret'),
  );
});

test('syncs only explicitly selected calendars and stores the next sync token', async () => {
  const { fetchImpl, calls } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main', primary: true }, { id: 'other', summary: 'Other' }] }) },
    { match: '/calendars/primary/events?', reply: json({ items: [{ id: 'e1', etag: 'v1', summary: 'Termin', description: 'must-not-persist', location: 'private', attendees: [{ email: 'private@example.com' }], start: { dateTime: '2026-11-08T10:00:00+01:00' }, end: { dateTime: '2026-11-08T11:00:00+01:00' }, updated: '2026-11-07T09:00:00Z' }], nextSyncToken: 'sync-2' }) },
  ]);
  const result = await syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectedIds: ['primary'], fetchImpl, timeMin: '2026-11-01T00:00:00Z', timeMax: '2026-12-01T00:00:00Z' });
  assert.deepEqual(result.selectedCalendarIds, ['primary']);
  assert.equal(result.events.length, 1);
  assert.equal(result.cursorByCalendar.primary.syncToken, 'sync-2');
  assert.match(result.events[0].idempotencyKey, /^[a-f0-9]{64}$/);
  assert.match(result.events[0].revisionKey, /^[a-f0-9]{64}$/);
  assert.equal(result.events[0].description, '');
  assert.equal(result.events[0].location, '');
  assert.deepEqual(result.events[0].attendees, []);
  assert.ok(new URL(calls.find((call) => call.url.includes('/events?')).url).searchParams.get('fields').includes('summary'));
  assert.equal(calls.some((call) => call.url.includes('/calendars/other/events')), false);
});

test('selects only the primary calendar during first-time provisioning', async () => {
  const { fetchImpl, calls } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main', primary: true }, { id: 'other', summary: 'Other' }] }) },
    { match: '/calendars/primary/events?', reply: json({ items: [], nextSyncToken: 'primary-sync' }) },
  ]);
  const result = await syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectPrimaryByDefault: true, fetchImpl });
  assert.deepEqual(result.selectedCalendarIds, ['primary']);
  assert.equal(calls.some((call) => call.url.includes('/calendars/other/events')), false);
});

test('recovers an expired Calendar token and replaces rather than duplicates an event', async () => {
  let eventCalls = 0;
  const { fetchImpl } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main' }] }) },
    { match: '/calendars/primary/events?', reply: (url) => {
      eventCalls += 1;
      if (url.includes('syncToken=old')) return json({}, 410);
      return json({ items: [{ id: 'e1', etag: 'v2', summary: 'Termin neu', start: { dateTime: '2026-11-09T10:00:00Z' }, end: { dateTime: '2026-11-09T11:00:00Z' } }], nextSyncToken: 'new' });
    } },
  ]);
  const previous = [{ accountId: 'google-1', calendarId: 'primary', providerId: 'e1', idempotencyKey: 'old', title: 'Alt', start: '2026-11-08T10:00:00Z' }];
  const result = await syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectedIds: ['primary'], cursorByCalendar: { primary: { syncToken: 'old' } }, previousEvents: previous, fetchImpl });
  assert.equal(eventCalls, 2);
  assert.equal(result.stats.fullFallbacks, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'Termin neu');
});

test('keeps calendar identity stable across revisions and removes deselected calendar data', async () => {
  const firstRevision=normalizeCalendarEvent({ accountId: 'google-1', calendarId: 'primary', input: { id: 'e1', etag: 'v1', updated: '2026-11-07T09:00:00Z', summary: 'Alt', start: { dateTime: '2026-11-08T10:00:00Z' }, end: { dateTime: '2026-11-08T11:00:00Z' } } });
  const secondRevision=normalizeCalendarEvent({ accountId: 'google-1', calendarId: 'primary', input: { id: 'e1', etag: 'v2', updated: '2026-11-08T09:00:00Z', summary: 'Neu', start: { dateTime: '2026-11-08T10:00:00Z' }, end: { dateTime: '2026-11-08T11:00:00Z' } } });
  assert.equal(firstRevision.idempotencyKey, secondRevision.idempotencyKey);
  assert.notEqual(firstRevision.revisionKey, secondRevision.revisionKey);
  const { fetchImpl } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main' }, { id: 'other', summary: 'Other' }] }) },
    { match: '/calendars/primary/events?', reply: json({ items: [{ id: 'e1', etag: 'v2', updated: '2026-11-08T09:00:00Z', summary: 'Neu', start: { dateTime: '2026-11-08T10:00:00Z' }, end: { dateTime: '2026-11-08T11:00:00Z' } }], nextSyncToken: 'new' }) },
  ]);
  const previous = [
    { accountId: 'google-1', calendarId: 'primary', providerId: 'e1', idempotencyKey: 'stable', revisionKey: 'old-revision', title: 'Alt', start: '2026-11-08T10:00:00Z', end: '2026-11-08T11:00:00Z' },
    { accountId: 'google-1', calendarId: 'other', providerId: 'e2', idempotencyKey: 'other', revisionKey: 'other-revision', title: 'Privat', start: '2026-11-08T12:00:00Z', end: '2026-11-08T13:00:00Z' },
  ];
  const result = await syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectedIds: ['primary'], cursorByCalendar: { primary: { syncToken: 'old' }, other: { syncToken: 'other-token' } }, previousEvents: previous, fetchImpl });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].calendarId, 'primary');
  assert.notEqual(result.events[0].revisionKey, 'old-revision');
  assert.equal('other' in result.cursorByCalendar, false);
});

test('full Gmail fallback replaces stale account data and applies retention', async () => {
  const { fetchImpl } = router([
    { match: '/profile', reply: json(gmailProfile) },
    { match: '/history?', reply: json({}, 404) },
    { match: (url) => url.includes('/messages?'), reply: json({ messages: [{ id: 'fresh' }] }) },
    { match: '/messages/fresh?', reply: json(gmailMessage('fresh')) },
  ]);
  const previousMessages = [{ accountId: 'google-1', providerId: 'stale', idempotencyKey: 'stale', receivedAt: '2020-01-01T00:00:00Z' }];
  const result = await syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', cursor: { historyId: 'old' }, previousMessages, fetchImpl, now: new Date('2026-11-07T00:00:00Z') });
  assert.deepEqual(result.messages.map((item) => item.providerId), ['fresh']);
});

test('incremental Gmail sync enforces age retention on the persisted snapshot', async () => {
  const { fetchImpl } = router([
    { match: '/profile', reply: json(gmailProfile) },
    { match: '/history?', reply: json({ history: [], historyId: '21' }) },
  ]);
  const previousMessages = [
    { accountId: 'google-1', providerId: 'old', idempotencyKey: 'old', receivedAt: '2026-01-01T00:00:00Z' },
    { accountId: 'google-1', providerId: 'recent', idempotencyKey: 'recent', receivedAt: '2026-11-01T00:00:00Z' },
  ];
  const result = await syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', cursor: { historyId: '20' }, previousMessages, fetchImpl, retentionDays: 90, now: new Date('2026-11-07T00:00:00Z') });
  assert.deepEqual(result.messages.map((item) => item.providerId), ['recent']);
});

test('paginates the complete Gmail history before advancing its cursor', async () => {
  let historyCalls = 0;
  const { fetchImpl } = router([
    { match: '/profile', reply: json({ ...gmailProfile, historyId: '22' }) },
    { match: '/history?', reply: (url) => {
      historyCalls += 1;
      return url.includes('pageToken=next-history')
        ? json({ history: [{ id: '22', messagesAdded: [{ message: { id: 'm2' } }] }], historyId: '22' })
        : json({ history: [{ id: '21', messagesAdded: [{ message: { id: 'm1' } }] }], historyId: '22', nextPageToken: 'next-history' });
    } },
    { match: '/messages/m1?', reply: json(gmailMessage('m1')) },
    { match: '/messages/m2?', reply: json(gmailMessage('m2')) },
  ]);
  const result = await syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', cursor: { historyId: '20' }, maxMessages: 1, fetchImpl });
  assert.equal(historyCalls, 2);
  assert.deepEqual(result.messages.map((item) => item.providerId).sort(), ['m1', 'm2']);
  assert.equal(result.cursor.historyId, '22');
});

test('does not advance Gmail history when the safe backlog limit is exceeded', async () => {
  const { fetchImpl } = router([
    { match: '/profile', reply: json({ ...gmailProfile, historyId: '22' }) },
    { match: '/history?', reply: json({ history: [{ id: '22', messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] }], historyId: '22' }) },
  ]);
  await assert.rejects(
    () => syncGmailReadOnly({ accountId: 'google-1', accessToken: 'token', cursor: { historyId: '20' }, maxIncrementalChanges: 1, fetchImpl }),
    (error) => error instanceof GoogleSyncError && error.code === 'GMAIL_BACKLOG_TOO_LARGE' && error.retryable,
  );
});

test('paginates all selected calendar events before persisting the sync token', async () => {
  let eventCalls = 0;
  const event = (id, hour) => ({ id, etag: `v-${id}`, summary: id, start: { dateTime: `2026-11-08T${hour}:00:00Z` }, end: { dateTime: `2026-11-08T${hour}:30:00Z` } });
  const { fetchImpl } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main', primary: true }] }) },
    { match: '/calendars/primary/events?', reply: (url) => {
      eventCalls += 1;
      return url.includes('pageToken=next-events')
        ? json({ items: [event('e2', '11')], nextSyncToken: 'calendar-final' })
        : json({ items: [event('e1', '10')], nextPageToken: 'next-events' });
    } },
  ]);
  const result = await syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectedIds: ['primary'], maxEventsPerCalendar: 2, fetchImpl });
  assert.equal(eventCalls, 2);
  assert.deepEqual(result.events.map((item) => item.providerId), ['e1', 'e2']);
  assert.equal(result.cursorByCalendar.primary.syncToken, 'calendar-final');
});

test('rejects a truncated calendar backlog without returning a false cursor', async () => {
  const event = (id) => ({ id, summary: id, start: { dateTime: '2026-11-08T10:00:00Z' }, end: { dateTime: '2026-11-08T10:30:00Z' } });
  const { fetchImpl } = router([
    { match: '/users/me/calendarList?', reply: json({ items: [{ id: 'primary', summary: 'Main' }] }) },
    { match: '/calendars/primary/events?', reply: (url) => url.includes('pageToken=overflow')
      ? json({ items: [event('e2')], nextSyncToken: 'must-not-be-used' })
      : json({ items: [event('e1')], nextPageToken: 'overflow' }) },
  ]);
  await assert.rejects(
    () => syncGoogleCalendarReadOnly({ accountId: 'google-1', accessToken: 'token', selectedIds: ['primary'], maxEventsPerCalendar: 1, fetchImpl }),
    (error) => error instanceof GoogleSyncError && error.code === 'CALENDAR_BACKLOG_TOO_LARGE' && error.retryable,
  );
});

test('preserves the successful provider and old cursor on a partial Google sync', async () => {
  const previousEvents = [{ accountId: 'google-1', calendarId: 'primary', providerId: 'old-event', idempotencyKey: 'stable', start: '2026-11-08T10:00:00Z', end: '2026-11-08T11:00:00Z' }];
  const { fetchImpl } = router([
    { match: 'oauth2.googleapis.com/token', reply: json({ access_token: 'access-secret', expires_in: 3600 }) },
    { match: '/profile', reply: json({ ...gmailProfile, messagesTotal: 0 }) },
    { match: (url) => url.includes('/messages?'), reply: json({ messages: [] }) },
    { match: '/users/me/calendarList?', reply: json({ error: { message: 'private-provider-detail' } }, 503) },
  ]);
  const result = await syncGoogleReadOnly({
    accountId: 'google-1', clientId: 'client', clientSecret: 'client-secret', refreshToken: 'refresh-secret', selectedCalendarIds: ['primary'],
    cursors: { calendars: { primary: { syncToken: 'old-calendar-cursor' } } }, previousEvents, fetchImpl,
  });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.mail.status, 'LIVE');
  assert.equal(result.calendar.status, 'DEGRADED');
  assert.deepEqual(result.calendar.events, previousEvents);
  assert.equal(result.cursors.calendars.primary.syncToken, 'old-calendar-cursor');
  assert.equal(result.failures[0].component, 'calendar');
  assert.equal(result.policy.partialSuccess, true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('private-provider-detail'), false);
  assert.equal(serialized.includes('access-secret'), false);
  assert.equal(serialized.includes('refresh-secret'), false);
});

test('redacts invalid_grant refresh failures as a reconnect request', async () => {
  const { fetchImpl } = router([{ match: 'oauth2.googleapis.com/token', reply: json({ error: 'invalid_grant', error_description: 'secret-provider-detail' }, 400) }]);
  await assert.rejects(
    () => refreshGoogleAccessToken({ clientId: 'client', clientSecret: 'client-secret', refreshToken: 'refresh-secret', fetchImpl }),
    (error) => error.code === 'AUTHORIZATION_REQUIRED' && !JSON.stringify(error.toPublicJSON()).includes('secret-provider-detail') && !JSON.stringify(error.toPublicJSON()).includes('refresh-secret'),
  );
});

test('top-level sync never returns access or refresh tokens', async () => {
  const { fetchImpl } = router([
    { match: 'oauth2.googleapis.com/token', reply: json({ access_token: 'access-secret', expires_in: 3600 }) },
    { match: '/profile', reply: json({ ...gmailProfile, messagesTotal: 0 }) },
    { match: (url) => url.includes('/messages?'), reply: json({ messages: [] }) },
    { match: '/users/me/calendarList?', reply: json({ items: [] }) },
  ]);
  const result = await syncGoogleReadOnly({ accountId: 'google-1', clientId: 'client', clientSecret: 'client-secret', refreshToken: 'refresh-secret', fetchImpl });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('access-secret'), false);
  assert.equal(serialized.includes('refresh-secret'), false);
  assert.equal(result.policy.readOnly, true);
});
