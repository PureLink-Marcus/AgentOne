import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  appendPersonalEvents,
  applyPersonalEventRetention,
  deletePersonalEvents,
  exportPersonalEvents,
  initPersonalEventLedger,
  personalEventLedgerAuditSummary,
  queryPersonalEvents,
} from './personal-event-ledger.mjs';

function database() { const db = new DatabaseSync(':memory:'); initPersonalEventLedger(db); return db; }
function mail(overrides = {}) {
  return {
    source: 'gmail', sourceAccount: 'primary', sourceEventId: 'msg-1', occurredAt: '2026-11-07T08:00:00Z',
    type: 'mail.message', summary: 'Antwort von einer Person', structuredPayload: { category: 'person', needsReply: true, threadId: 'thread-1' },
    provenance: { connectorId: 'google-primary', syncCursor: 'history-42' }, sensitivity: 'personal', confidence: 0.91,
    ...overrides,
  };
}

test('ledger is idempotent, immutable and strictly user-isolated', () => {
  const db = database();
  const first = appendPersonalEvents(db, { userId: 'guenni', events: [mail()], ingestedAt: '2026-11-07T09:00:00Z' });
  const repeated = appendPersonalEvents(db, { userId: 'guenni', events: [mail()], ingestedAt: '2026-11-07T09:00:00Z' });
  const changed = appendPersonalEvents(db, { userId: 'guenni', events: [mail({ summary: 'Nachträglich verändert' })], ingestedAt: '2026-11-07T09:00:00Z' });
  assert.deepEqual([first.inserted, repeated.unchanged, changed.conflicts], [1, 1, 1]);
  assert.equal(queryPersonalEvents(db, { userId: 'guenni' })[0].summary, 'Antwort von einer Person');
  assert.equal(queryPersonalEvents(db, { userId: 'fressi' }).length, 0);
  assert.throws(() => appendPersonalEvents(db, { userId: 'fressi', events: [mail({ userId: 'guenni' })] }), { code: 'EVENT_LEDGER_USER_MISMATCH' });
});

test('ledger rejects mail bodies, secrets and oversized summaries', () => {
  const db = database();
  for (const structuredPayload of [{ body: 'kompletter Mailtext' }, { accessToken: 'top-secret' }, { nested: { htmlBody: '<p>secret</p>' } }]) {
    assert.throws(() => appendPersonalEvents(db, { userId: 'guenni', events: [mail({ sourceEventId: Math.random().toString(), structuredPayload })] }), { code: 'EVENT_LEDGER_SENSITIVE_FIELD' });
  }
  assert.throws(() => appendPersonalEvents(db, { userId: 'guenni', events: [mail({ summary: 'x'.repeat(2_049) })] }), /zu groß/);
  assert.equal(personalEventLedgerAuditSummary(db, 'guenni').total, 0);
});

test('query filters source, type and time without crossing users', () => {
  const db = database();
  appendPersonalEvents(db, { userId: 'guenni', events: [
    mail(),
    mail({ source: 'google_calendar', sourceEventId: 'event-1', type: 'calendar.event', summary: 'Termin', occurredAt: '2026-11-08T10:00:00Z', structuredPayload: { durationMinutes: 60 } }),
    mail({ sourceEventId: 'msg-2', occurredAt: '2026-11-09T08:00:00Z' }),
  ] });
  appendPersonalEvents(db, { userId: 'fressi', events: [mail()] });
  assert.deepEqual(queryPersonalEvents(db, { userId: 'guenni', source: 'gmail', from: '2026-11-08T00:00:00Z' }).map((event) => event.sourceEventId), ['msg-2']);
  assert.deepEqual(queryPersonalEvents(db, { userId: 'guenni', type: 'calendar.event' }).map((event) => event.sourceEventId), ['event-1']);
  assert.equal(queryPersonalEvents(db, { userId: 'guenni', limit: 99 }).length, 3);
});

test('source export and deletion stay scoped to one user', () => {
  const db = database();
  appendPersonalEvents(db, { userId: 'guenni', events: [mail(), mail({ source: 'whoop', sourceEventId: 'cycle-1', type: 'health.metric', summary: 'Recovery normalisiert', structuredPayload: { metric: 'recovery_score', value: 72 }, sensitivity: 'health', consentId: 'consent-whoop' })] });
  appendPersonalEvents(db, { userId: 'fressi', events: [mail()] });
  const exported = exportPersonalEvents(db, { userId: 'guenni', source: 'gmail' });
  assert.equal(exported.warning, 'PERSONAL_PLAINTEXT_EXPORT');
  assert.deepEqual(exported.events.map((event) => event.source), ['gmail']);
  assert.throws(() => deletePersonalEvents(db, { userId: 'guenni' }), { code: 'EVENT_LEDGER_CONFIRM_REQUIRED' });
  assert.equal(deletePersonalEvents(db, { userId: 'guenni', source: 'gmail' }).deleted, 1);
  assert.equal(queryPersonalEvents(db, { userId: 'guenni' }).length, 1);
  assert.equal(queryPersonalEvents(db, { userId: 'fressi' }).length, 1);
});

test('retention removes only the selected user and audit exposes no payload', () => {
  const db = database();
  appendPersonalEvents(db, { userId: 'guenni', events: [mail(), mail({ sourceEventId: 'msg-2', occurredAt: '2026-11-09T08:00:00Z' })] });
  appendPersonalEvents(db, { userId: 'fressi', events: [mail()] });
  const retained = applyPersonalEventRetention(db, { userId: 'guenni', before: '2026-11-08T00:00:00Z' });
  assert.equal(retained.deleted, 1);
  assert.equal(queryPersonalEvents(db, { userId: 'guenni' }).length, 1);
  assert.equal(queryPersonalEvents(db, { userId: 'fressi' }).length, 1);
  assert.deepEqual(personalEventLedgerAuditSummary(db, 'guenni'), {
    schema: 'agentone.personal-event-ledger-audit/v1', userId: 'guenni', total: 1, sources: 1,
    oldest: '2026-11-09T08:00:00.000Z', newest: '2026-11-09T08:00:00.000Z', containsPayloads: false, containsSecrets: false,
  });
});
