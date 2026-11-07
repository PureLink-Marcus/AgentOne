import {
  mergeMailPage,
  normalizeCalendarEvent,
  normalizeCalendars,
  normalizeMailMessage,
  planMailSync,
  selectCalendars,
  selectedCalendarIds,
} from './mail-calendar-sync.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT_MS = 15_000;
const METADATA_HEADERS = Object.freeze([
  'From', 'To', 'Subject', 'Date', 'Message-ID', 'List-ID', 'List-Unsubscribe',
  'Precedence', 'Auto-Submitted', 'Authentication-Results', 'X-Spam-Flag',
  'X-Spam-Status', 'X-Bogosity',
]);

export const googleReadOnlyScopes = Object.freeze([
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
]);

function safeText(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function required(value, name) {
  const text = safeText(value, 2_000);
  if (!text) throw new GoogleSyncError(`${name} fehlt`, { code: 'GOOGLE_CONFIGURATION_REQUIRED', stage: 'validation' });
  return text;
}

function integer(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
}

function seconds(value) {
  const number = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(number) ? Math.max(0, Math.min(number, 3_600)) : null;
}

function requestSignal(signal) {
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class GoogleSyncError extends Error {
  constructor(message, { code = 'GOOGLE_SYNC_FAILED', provider = 'google', stage = 'sync', status = 0, retryable = false, retryAfterSeconds = null } = {}) {
    super(message);
    this.name = 'GoogleSyncError';
    this.code = code;
    this.provider = provider;
    this.stage = stage;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  toPublicJSON() {
    return {
      provider: this.provider,
      stage: this.stage,
      code: this.code,
      retryable: this.retryable,
      retryAfterSeconds: this.retryAfterSeconds,
      message: this.message,
      secretsExposed: false,
    };
  }
}

function publicFailure(response, { provider, stage }) {
  const status = response.status;
  if (provider === 'google-oauth' && stage === 'refresh' && status === 400) return new GoogleSyncError('Google muss erneut verbunden werden.', { code: 'AUTHORIZATION_REQUIRED', provider, stage, status });
  if (status === 401 || status === 403) return new GoogleSyncError('Google muss erneut verbunden werden.', { code: 'AUTHORIZATION_REQUIRED', provider, stage, status });
  if (status === 404 && provider === 'gmail' && stage === 'history') return new GoogleSyncError('Der Gmail-Synchronisationsstand ist abgelaufen.', { code: 'CURSOR_EXPIRED', provider, stage, status, retryable: true });
  if (status === 410 && provider === 'google-calendar') return new GoogleSyncError('Der Kalender-Synchronisationsstand ist abgelaufen.', { code: 'CURSOR_EXPIRED', provider, stage, status, retryable: true });
  if (status === 429 || status >= 500) return new GoogleSyncError('Google ist vorübergehend nicht erreichbar; der Lauf kann sicher wiederholt werden.', {
    code: 'TEMPORARY_FAILURE', provider, stage, status, retryable: true,
    retryAfterSeconds: seconds(response.headers?.get?.('retry-after')),
  });
  return new GoogleSyncError('Google-Synchronisierung fehlgeschlagen; Providerdetails wurden redigiert.', { provider, stage, status });
}

async function googleJson(url, { accessToken, fetchImpl = fetch, signal, provider, stage, method = 'GET', headers = {}, body } = {}) {
  required(accessToken, 'Google Access-Token');
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', ...headers },
      body,
      signal: requestSignal(signal),
    });
  } catch (error) {
    if (error instanceof GoogleSyncError) throw error;
    throw new GoogleSyncError('Google ist nicht erreichbar; der Lauf kann sicher wiederholt werden.', { code: 'NETWORK_FAILURE', provider, stage, retryable: true });
  }
  if (!response.ok) throw publicFailure(response, { provider, stage });
  try { return await response.json(); }
  catch { throw new GoogleSyncError('Google lieferte keine gültige JSON-Antwort.', { code: 'INVALID_RESPONSE', provider, stage, status: response.status }); }
}

export async function refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, onRotatedRefreshToken, fetchImpl = fetch, signal } = {}) {
  const form = new URLSearchParams({
    client_id: required(clientId, 'Google Client-ID'),
    client_secret: required(clientSecret, 'Google Client-Secret'),
    refresh_token: required(refreshToken, 'Google Refresh-Token'),
    grant_type: 'refresh_token',
  });
  let response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form,
      signal: requestSignal(signal),
    });
  } catch {
    throw new GoogleSyncError('Google-Anmeldung ist vorübergehend nicht erreichbar.', { code: 'NETWORK_FAILURE', provider: 'google-oauth', stage: 'refresh', retryable: true });
  }
  if (!response.ok) throw publicFailure(response, { provider: 'google-oauth', stage: 'refresh' });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!payload.access_token) throw new GoogleSyncError('Google lieferte keinen nutzbaren Zugriffsschlüssel.', { code: 'INVALID_RESPONSE', provider: 'google-oauth', stage: 'refresh' });
  if (payload.refresh_token && typeof onRotatedRefreshToken === 'function') await onRotatedRefreshToken(String(payload.refresh_token));
  return {
    accessToken: String(payload.access_token),
    tokenType: safeText(payload.token_type || 'Bearer', 30),
    expiresInSeconds: integer(payload.expires_in, 3_600, 60, 86_400),
    scopes: safeText(payload.scope, 2_000).split(/\s+/).filter(Boolean),
  };
}

async function gmailProfile(options) {
  return googleJson(`${GMAIL_BASE}/profile`, { ...options, provider: 'gmail', stage: 'profile' });
}

async function gmailInitialIds(options, maxMessages) {
  const ids = [];
  let pageToken = null;
  while (ids.length < maxMessages) {
    const url = new URL(`${GMAIL_BASE}/messages`);
    url.searchParams.set('maxResults', String(Math.min(500, maxMessages - ids.length)));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await googleJson(url, { ...options, provider: 'gmail', stage: 'list' });
    for (const item of page.messages ?? []) if (item?.id && !ids.includes(String(item.id))) ids.push(String(item.id));
    pageToken = page.nextPageToken || null;
    if (!pageToken) break;
  }
  return ids;
}

async function gmailHistory(options, startHistoryId, { maxChanges = 1_000, maxPages = 1_000 } = {}) {
  const added = new Set(), deleted = new Set();
  let pageToken = null, latestHistoryId = String(startHistoryId), pageCount = 0;
  do {
    const url = new URL(`${GMAIL_BASE}/history`);
    url.searchParams.set('startHistoryId', String(startHistoryId));
    url.searchParams.set('maxResults', '500');
    url.searchParams.append('historyTypes', 'messageAdded');
    url.searchParams.append('historyTypes', 'messageDeleted');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await googleJson(url, { ...options, provider: 'gmail', stage: 'history' });
    pageCount += 1;
    latestHistoryId = String(page.historyId || latestHistoryId);
    for (const history of page.history ?? []) {
      for (const entry of history.messagesAdded ?? []) if (entry?.message?.id) added.add(String(entry.message.id));
      for (const entry of history.messagesDeleted ?? []) if (entry?.message?.id) deleted.add(String(entry.message.id));
    }
    pageToken = page.nextPageToken || null;
    if (added.size + deleted.size > maxChanges) throw new GoogleSyncError('Der Gmail-Rückstand ist für einen einzelnen sicheren Lauf zu groß; der Cursor wurde nicht fortgeschrieben.', {
      code: 'GMAIL_BACKLOG_TOO_LARGE', provider: 'gmail', stage: 'history', retryable: true,
    });
    if (pageToken && pageCount >= maxPages) throw new GoogleSyncError('Der Gmail-Verlauf umfasst zu viele Seiten; der Cursor wurde nicht fortgeschrieben.', {
      code: 'GMAIL_HISTORY_PAGE_LIMIT', provider: 'gmail', stage: 'history', retryable: true,
    });
  } while (pageToken);
  return { ids: [...added], deletedProviderIds: [...deleted], historyId: latestHistoryId, pages: pageCount };
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function gmailMetadata(options, id) {
  const url = new URL(`${GMAIL_BASE}/messages/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'metadata');
  for (const name of METADATA_HEADERS) url.searchParams.append('metadataHeaders', name);
  return googleJson(url, { ...options, provider: 'gmail', stage: 'message-metadata' });
}

export async function syncGmailReadOnly({
  accountId, accessToken, cursor = null, previousMessages = [], fetchImpl = fetch,
  signal, maxMessages = 200, metadataConcurrency = 6, retentionDays = 90,
  retentionLimit = 5_000, maxIncrementalChanges = 1_000, maxHistoryPages = 1_000, now = new Date(),
} = {}) {
  const safeAccountId = required(accountId, 'Google Konto-ID');
  const safeMax = integer(maxMessages, 200, 1, 500);
  const options = { accessToken, fetchImpl, signal };
  const profile = await gmailProfile(options);
  let mode = planMailSync({ provider: 'gmail', cursor }).mode;
  let ids = [], deletedProviderIds = [], historyId = String(profile.historyId || cursor?.historyId || '');
  if (mode === 'incremental') {
    try {
      const history = await gmailHistory(options, cursor.historyId, {
        maxChanges: integer(maxIncrementalChanges, 1_000, 1, 20_000),
        maxPages: integer(maxHistoryPages, 1_000, 1, 10_000),
      });
      ids = history.ids; deletedProviderIds = history.deletedProviderIds; historyId = history.historyId || historyId;
    } catch (error) {
      if (!(error instanceof GoogleSyncError) || error.code !== 'CURSOR_EXPIRED') throw error;
      mode = 'full';
      ids = await gmailInitialIds(options, safeMax);
      deletedProviderIds = [];
    }
  } else {
    ids = await gmailInitialIds(options, safeMax);
  }
  const raw = await mapConcurrent(ids, integer(metadataConcurrency, 6, 1, 12), (id) => gmailMetadata(options, id));
  const incoming = raw.map((input) => normalizeMailMessage({ provider: 'gmail', accountId: safeAccountId, input: {
    id: input.id,
    threadId: input.threadId,
    internalDate: input.internalDate,
    headers: input.payload?.headers,
    labels: input.labelIds,
    snippet: '',
  } }));
  const deleted = new Set(deletedProviderIds);
  const retained = mode === 'full'
    ? previousMessages.filter((item) => item.accountId !== safeAccountId)
    : previousMessages.filter((item) => !deleted.has(String(item.providerId)));
  const cutoff = new Date(now).getTime() - integer(retentionDays, 90, 1, 365) * 86_400_000;
  const messages = mergeMailPage(retained, incoming)
    .filter((item) => item.accountId !== safeAccountId || !item.receivedAt || new Date(item.receivedAt).getTime() >= cutoff)
    .slice(0, integer(retentionLimit, 5_000, 100, 20_000));
  return {
    schema: 'agentone.google.gmail-sync/v1', provider: 'gmail', mode,
    accountId: safeAccountId,
    profile: { emailAddress: safeText(profile.emailAddress, 320), messagesTotal: Number(profile.messagesTotal || 0), threadsTotal: Number(profile.threadsTotal || 0) },
    messages,
    cursor: { historyId },
    changes: { fetched: incoming.length, deleted: deleted.size, totalStored: messages.length },
    policy: { readOnly: true, messageBodiesFetched: false, sendsPerformed: false, secretsExposed: false },
  };
}

async function calendarList(options) {
  const items = [];
  let pageToken = null;
  do {
    const url = new URL(`${CALENDAR_BASE}/users/me/calendarList`);
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await googleJson(url, { ...options, provider: 'google-calendar', stage: 'calendar-list' });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken || null;
  } while (pageToken && items.length < 1_000);
  return items.slice(0, 1_000);
}

async function calendarEventPages(options, calendarId, { syncToken, timeMin, timeMax, maxEvents, maxPages = 1_000 }) {
  const items = [];
  let pageToken = null, nextSyncToken = null, pageCount = 0;
  do {
    const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('maxResults', String(Math.min(2_500, Math.max(1, maxEvents))));
    url.searchParams.set('showDeleted', 'true');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('fields', 'nextPageToken,nextSyncToken,items(id,status,etag,updated,summary,start,end,recurringEventId)');
    if (syncToken) url.searchParams.set('syncToken', syncToken);
    else {
      if (timeMin) url.searchParams.set('timeMin', new Date(timeMin).toISOString());
      if (timeMax) url.searchParams.set('timeMax', new Date(timeMax).toISOString());
      url.searchParams.set('orderBy', 'startTime');
    }
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await googleJson(url, { ...options, provider: 'google-calendar', stage: 'events' });
    pageCount += 1;
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken || null;
    nextSyncToken = page.nextSyncToken || nextSyncToken;
    if (items.length > maxEvents) throw new GoogleSyncError('Der Kalender-Rückstand ist für einen einzelnen sicheren Lauf zu groß; der Cursor wurde nicht fortgeschrieben.', {
      code: 'CALENDAR_BACKLOG_TOO_LARGE', provider: 'google-calendar', stage: 'events', retryable: true,
    });
    if (pageToken && pageCount >= maxPages) throw new GoogleSyncError('Der Kalender umfasst zu viele Seiten; der Cursor wurde nicht fortgeschrieben.', {
      code: 'CALENDAR_PAGE_LIMIT', provider: 'google-calendar', stage: 'events', retryable: true,
    });
  } while (pageToken);
  return { items, nextSyncToken, pages: pageCount };
}

function mergeCalendarEvents(previousEvents, incoming, deletedProviderIds, accountId, calendarId) {
  const deleted = new Set(deletedProviderIds);
  const byIdentity = new Map();
  for (const event of previousEvents) {
    if (event.accountId !== accountId || event.calendarId !== calendarId || !deleted.has(String(event.providerId))) {
      byIdentity.set(`${event.accountId}|${event.calendarId}|${event.providerId}`, event);
    }
  }
  for (const event of incoming) byIdentity.set(`${event.accountId}|${event.calendarId}|${event.providerId}`, event);
  return [...byIdentity.values()].sort((left, right) => String(left.start || '').localeCompare(String(right.start || '')));
}

export async function syncGoogleCalendarReadOnly({
  accountId, accessToken, selectedIds = [], cursorByCalendar = {}, previousEvents = [],
  fetchImpl = fetch, signal, maxEventsPerCalendar = 1_000,
  timeMin = new Date(Date.now() - 30 * 86_400_000), timeMax = new Date(Date.now() + 365 * 86_400_000),
  retentionDays = 400, retentionLimit = 10_000, maxPagesPerCalendar = 1_000, now = new Date(), selectPrimaryByDefault = false,
} = {}) {
  const safeAccountId = required(accountId, 'Google Konto-ID');
  if (!Array.isArray(selectedIds)) throw new GoogleSyncError('Kalenderauswahl muss eine Liste sein.', { code: 'GOOGLE_CALENDAR_SELECTION_INVALID', provider: 'google-calendar', stage: 'validation' });
  const options = { accessToken, fetchImpl, signal };
  const discovered = normalizeCalendars(safeAccountId, await calendarList(options));
  const effectiveSelectedIds = selectedIds.length || !selectPrimaryByDefault
    ? selectedIds
    : discovered.filter((calendar) => calendar.primary).map((calendar) => calendar.id).slice(0, 1);
  const calendars = selectCalendars(discovered, effectiveSelectedIds);
  const selected = selectedCalendarIds(calendars), selectedSet = new Set(selected);
  let events = previousEvents.filter((event) => event.accountId !== safeAccountId || selectedSet.has(event.calendarId)), fullFallbacks = 0;
  const nextCursors = Object.fromEntries(Object.entries(cursorByCalendar ?? {}).filter(([calendarId]) => selectedSet.has(calendarId)));
  for (const calendarId of selected) {
    const previousToken = cursorByCalendar?.[calendarId]?.syncToken || null;
    let mode = previousToken ? 'incremental' : 'full', page;
    try {
      page = await calendarEventPages(options, calendarId, { syncToken: previousToken, timeMin, timeMax, maxEvents: integer(maxEventsPerCalendar, 1_000, 1, 5_000), maxPages: integer(maxPagesPerCalendar, 1_000, 1, 10_000) });
    } catch (error) {
      if (!(error instanceof GoogleSyncError) || error.code !== 'CURSOR_EXPIRED') throw error;
      mode = 'full'; fullFallbacks += 1;
      page = await calendarEventPages(options, calendarId, { syncToken: null, timeMin, timeMax, maxEvents: integer(maxEventsPerCalendar, 1_000, 1, 5_000), maxPages: integer(maxPagesPerCalendar, 1_000, 1, 10_000) });
    }
    const deleted = page.items.filter((item) => item.status === 'cancelled').map((item) => String(item.id));
    const normalized = page.items.filter((item) => item.status !== 'cancelled' && item.id && item.start && item.end)
      .map((input) => normalizeCalendarEvent({ accountId: safeAccountId, calendarId, input: {
        id: input.id, status: input.status, etag: input.etag, updated: input.updated,
        summary: input.summary, start: input.start, end: input.end, recurringEventId: input.recurringEventId,
      } }));
    if (mode === 'full') events = events.filter((event) => event.accountId !== safeAccountId || event.calendarId !== calendarId);
    events = mergeCalendarEvents(events, normalized, deleted, safeAccountId, calendarId);
    nextCursors[calendarId] = { syncToken: page.nextSyncToken || previousToken || null, mode };
  }
  const cutoff = new Date(now).getTime() - integer(retentionDays, 400, 1, 730) * 86_400_000;
  events = events.filter((event) => event.accountId !== safeAccountId || !event.end || new Date(event.end).getTime() >= cutoff)
    .sort((left, right) => String(left.start || '').localeCompare(String(right.start || '')))
    .slice(0, integer(retentionLimit, 10_000, 100, 50_000));
  return {
    schema: 'agentone.google.calendar-sync/v1', provider: 'google-calendar', accountId: safeAccountId,
    calendars, selectedCalendarIds: selected, events, cursorByCalendar: nextCursors,
    stats: { calendars: calendars.length, selected: selected.length, events: events.length, fullFallbacks },
    policy: { readOnly: true, explicitSelection: true, writesPerformed: false, secretsExposed: false },
  };
}

export async function syncGoogleReadOnly({
  accountId, clientId, clientSecret, refreshToken, selectedCalendarIds: selectedIds = [],
  cursors = {}, previousMessages = [], previousEvents = [], fetchImpl = fetch, signal,
  gmail = {}, calendar = {}, onRotatedRefreshToken,
} = {}) {
  const token = await refreshGoogleAccessToken({ clientId, clientSecret, refreshToken, onRotatedRefreshToken, fetchImpl, signal });
  const safeSelectedIds = Array.isArray(selectedIds) ? [...new Set(selectedIds.map(String))] : [];
  const [mailSettlement, calendarSettlement] = await Promise.allSettled([
    syncGmailReadOnly({ accountId, accessToken: token.accessToken, cursor: cursors.gmail, previousMessages, fetchImpl, signal, ...gmail }),
    syncGoogleCalendarReadOnly({ accountId, accessToken: token.accessToken, selectedIds: safeSelectedIds, cursorByCalendar: cursors.calendars, previousEvents, fetchImpl, signal, ...calendar }),
  ]);
  if (mailSettlement.status === 'rejected' && calendarSettlement.status === 'rejected') {
    const preferred = mailSettlement.reason instanceof GoogleSyncError ? mailSettlement.reason : calendarSettlement.reason;
    if (preferred instanceof GoogleSyncError) throw preferred;
    throw new GoogleSyncError('Google Mail und Kalender konnten nicht synchronisiert werden.', { retryable: true });
  }
  const publicError = (error, provider) => error instanceof GoogleSyncError
    ? error.toPublicJSON()
    : new GoogleSyncError(`${provider} konnte nicht synchronisiert werden; technische Details wurden redigiert.`, { provider, retryable: true }).toPublicJSON();
  const mailFailure = mailSettlement.status === 'rejected' ? publicError(mailSettlement.reason, 'gmail') : null;
  const calendarFailure = calendarSettlement.status === 'rejected' ? publicError(calendarSettlement.reason, 'google-calendar') : null;
  const mailResult = mailSettlement.status === 'fulfilled' ? { ...mailSettlement.value, status: 'LIVE' } : {
    schema: 'agentone.google.gmail-sync/v1', provider: 'gmail', status: 'DEGRADED', mode: 'preserved', accountId: safeText(accountId, 100),
    profile: { emailAddress: '', messagesTotal: 0, threadsTotal: 0 }, messages: Array.isArray(previousMessages) ? previousMessages : [],
    cursor: cursors.gmail ?? null, changes: { fetched: 0, deleted: 0, totalStored: Array.isArray(previousMessages) ? previousMessages.length : 0 }, error: mailFailure,
    policy: { readOnly: true, messageBodiesFetched: false, sendsPerformed: false, secretsExposed: false },
  };
  const calendarResult = calendarSettlement.status === 'fulfilled' ? { ...calendarSettlement.value, status: 'LIVE' } : {
    schema: 'agentone.google.calendar-sync/v1', provider: 'google-calendar', status: 'DEGRADED', accountId: safeText(accountId, 100),
    calendars: safeSelectedIds.map((id) => ({ schema: 'agentone.calendar/v1', accountId: safeText(accountId, 100), id, name: id, selected: true, hidden: false })), selectedCalendarIds: safeSelectedIds, events: Array.isArray(previousEvents) ? previousEvents : [],
    cursorByCalendar: cursors.calendars ?? {}, stats: { calendars: safeSelectedIds.length, selected: safeSelectedIds.length, events: Array.isArray(previousEvents) ? previousEvents.length : 0, fullFallbacks: 0 }, error: calendarFailure,
    policy: { readOnly: true, explicitSelection: true, writesPerformed: false, secretsExposed: false },
  };
  const failures = [mailFailure && { component: 'mail', ...mailFailure }, calendarFailure && { component: 'calendar', ...calendarFailure }].filter(Boolean);
  return {
    schema: 'agentone.google-sync/v1', status: failures.length ? 'PARTIAL' : 'LIVE', accountId: safeText(accountId, 100),
    mail: mailResult, calendar: calendarResult,
    cursors: { gmail: mailResult.cursor, calendars: calendarResult.cursorByCalendar },
    failures,
    token: { expiresInSeconds: token.expiresInSeconds, scopes: token.scopes, persisted: false },
    policy: { readOnly: true, partialSuccess: failures.length > 0, accessTokenReturned: false, refreshTokenReturned: false, secretsExposed: false },
  };
}

export const googleLiveSyncInternals = Object.freeze({
  calendarEventPages,
  gmailHistory,
  gmailInitialIds,
  mergeCalendarEvents,
  publicFailure,
});
