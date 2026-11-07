import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  buildPersonalBrief,
  deduplicatePersonalEvents,
  normalizePersonalEvent,
  shouldNotify,
} from './personal-intelligence.mjs';

const now = new Date('2026-11-07T10:00:00.000Z');

function event(overrides = {}) {
  return {
    userId: 'guenni',
    source: 'test',
    kind: 'health.metric',
    externalId: randomUUID(),
    occurredAt: now.toISOString(),
    metrics: {},
    provenance: { connectorId: 'test', importedAt: now.toISOString() },
    ...overrides,
  };
}

test('normalizes and deduplicates connector events without mixing users', () => {
  const item = normalizePersonalEvent(event({ externalId: 'same' }));
  assert.equal(deduplicatePersonalEvents([item, item]).length, 1);
  const brief = buildPersonalBrief({ userId: 'someone-else', events: [item], now });
  assert.equal(brief.eventCount, 0);
});

test('creates mail and calendar feedback with traceable evidence', () => {
  const brief = buildPersonalBrief({
    userId: 'guenni',
    now,
    events: [
      event({ source: 'gmail', kind: 'mail.message', externalId: 'mail-1', tags: ['person', 'needs-reply', 'urgent'] }),
      event({ source: 'google-calendar', kind: 'calendar.event', externalId: 'cal-1', occurredAt: '2026-11-07T12:00:00.000Z', metrics: { durationMinutes: 60, endAt: '2026-11-07T13:00:00.000Z' } }),
    ],
  });
  assert.deepEqual(brief.signals.map((signal) => signal.id), ['mail.daily-triage', 'calendar.next-24h']);
  assert.equal(brief.signals[0].severity, 'attention');
  assert.equal(brief.signals[0].evidence[0].externalId, 'mail-1');
  assert.match(brief.signals[0].summary, /1 sollten geprüft werden/);
  assert.doesNotMatch(brief.signals[0].summary, /Antwort/);
  assert.deepEqual(brief.signals[0].actions, [{ type: 'open-filter', target: 'mail:person-review', label: 'Personennachrichten prüfen' }]);
  assert.match(brief.signals[0].notificationKey, /^[a-f0-9]{64}$/);
});

test('compares recent health data only with the personal historic baseline', () => {
  const events = [];
  for (let days = 34; days >= 8; days -= 4) {
    events.push(event({
      source: 'health.apple',
      externalId: `baseline-${days}`,
      occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
      metrics: { name: 'sleep_duration_hours', value: 8, unit: 'h' },
    }));
  }
  for (let days = 6; days >= 1; days -= 2) {
    events.push(event({
      source: 'health.apple',
      externalId: `recent-${days}`,
      occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
      metrics: { name: 'sleep_duration_hours', value: 6, unit: 'h' },
    }));
  }
  const brief = buildPersonalBrief({ userId: 'guenni', events, now });
  const health = brief.signals.find((signal) => signal.id === 'health.weekly-pattern');
  assert.equal(health.severity, 'attention');
  assert.match(health.summary, /-25 %/);
  assert.match(health.disclaimer, /keine medizinische Diagnose/);
});

test('cross-domain feedback never changes a calendar without approval', () => {
  const events = [];
  for (let days = 34; days >= 8; days -= 4) {
    events.push(event({ source: 'health.apple', externalId: `b-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'recovery_score', value: 85 } }));
  }
  for (let days = 6; days >= 1; days -= 2) {
    events.push(event({ source: 'health.apple', externalId: `r-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'recovery_score', value: 55 } }));
  }
  events.push(event({ source: 'google-calendar', kind: 'calendar.event', externalId: 'packed', occurredAt: '2026-11-07T11:00:00.000Z', metrics: { durationMinutes: 300, endAt: '2026-11-07T16:00:00.000Z' } }));
  const brief = buildPersonalBrief({ userId: 'guenni', events, now });
  const signal = brief.signals.find((entry) => entry.id === 'cross.recovery-schedule');
  assert.equal(signal.actions[0].type, 'draft-plan');
  assert.match(signal.summary, /ohne deine Freigabe/);
});

test('notification policy deduplicates and respects quiet hours', () => {
  const signal = { severity: 'attention', notificationKey: 'key' };
  assert.equal(shouldNotify(signal, { now: new Date('2026-11-07T10:00:00') }), true);
  assert.equal(shouldNotify(signal, { deliveredKeys: new Set(['key']), now }), false);
  assert.equal(shouldNotify(signal, { now: new Date('2026-11-07T23:00:00Z') }), false);
});

test('does not merge Apple and WHOOP into one health baseline', () => {
  const events = [];
  for (let days = 34; days >= 8; days -= 4) {
    events.push(event({ source: 'apple_health', externalId: `apple-b-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'sleep_minutes', value: 480 } }));
    events.push(event({ source: 'whoop', externalId: `whoop-b-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'sleep_duration_hours', value: 6 } }));
  }
  for (let days = 6; days >= 1; days -= 2) {
    events.push(event({ source: 'apple_health', externalId: `apple-r-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'sleep_minutes', value: 360 } }));
    events.push(event({ source: 'whoop', externalId: `whoop-r-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'sleep_duration_hours', value: 6 } }));
  }
  const health = buildPersonalBrief({ userId: 'guenni', events, now }).signals.find((signal) => signal.id === 'health.weekly-pattern');
  assert.match(health.summary, /Schlafdauer \(apple_health\): -25 %/);
  assert.match(health.summary, /Schlafdauer \(whoop\): \+0 %/);
});

test('never mixes HRV measurement methods within the same source', () => {
  const events = [];
  for (let days = 34; days >= 8; days -= 4) {
    events.push(event({ source: 'whoop', externalId: `sdnn-b-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_sdnn_ms', value: 80 } }));
    events.push(event({ source: 'whoop', externalId: `rmssd-b-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_rmssd_ms', value: 60 } }));
  }
  for (let days = 6; days >= 1; days -= 2) {
    events.push(event({ source: 'whoop', externalId: `sdnn-r-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_sdnn_ms', value: 80 } }));
    events.push(event({ source: 'whoop', externalId: `rmssd-r-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_rmssd_ms', value: 30 } }));
  }
  const health = buildPersonalBrief({ userId: 'guenni', events, now }).signals.find((signal) => signal.id === 'health.weekly-pattern');
  assert.match(health.summary, /HRV · SDNN \(whoop\): \+0 %/);
  assert.match(health.summary, /HRV · RMSSD \(whoop\): -50 %/);
  assert.equal((health.summary.match(/HRV ·/g) || []).length, 2);
});

test('fallback dedupe preserves distinct metrics at the same timestamp', () => {
  const common = { externalId: null, source: 'health.apple', occurredAt: now.toISOString() };
  const first = normalizePersonalEvent(event({ ...common, metrics: { name: 'steps', value: 100 } }));
  const second = normalizePersonalEvent(event({ ...common, metrics: { name: 'heart_rate_bpm', value: 60 } }));
  assert.equal(deduplicatePersonalEvents([first, second]).length, 2);
});

test('detects nested calendar overlaps and uses the requested timezone for quiet hours', () => {
  const brief = buildPersonalBrief({
    userId: 'guenni', now, events: [
      event({ kind: 'calendar.event', source: 'calendar', externalId: 'long', occurredAt: '2026-11-07T11:00:00Z', metrics: { durationMinutes: 180, endAt: '2026-11-07T14:00:00Z' } }),
      event({ kind: 'calendar.event', source: 'calendar', externalId: 'short', occurredAt: '2026-11-07T11:30:00Z', metrics: { durationMinutes: 15, endAt: '2026-11-07T11:45:00Z' } }),
      event({ kind: 'calendar.event', source: 'calendar', externalId: 'nested', occurredAt: '2026-11-07T12:00:00Z', metrics: { durationMinutes: 30, endAt: '2026-11-07T12:30:00Z' } }),
    ],
  });
  assert.match(brief.signals[0].summary, /2 Überschneidungen/);
  const signal = { severity: 'attention', notificationKey: 'tz' };
  assert.equal(shouldNotify(signal, { now: new Date('2026-11-07T21:30:00Z'), timeZone: 'Europe/Berlin' }), false);
});

test('accepts normalized health records from the health connector module', () => {
  const normalized = normalizePersonalEvent({
    userId: 'guenni', source: 'apple_health', kind: 'health.metric', metric: 'steps', value: 1234,
    unit: 'count', startAt: '2026-11-07T08:00:00Z', provenance: { connectorId: 'apple-import' },
  });
  assert.deepEqual(normalized.metrics, { name: 'steps', value: 1234, unit: 'count' });
  assert.equal(normalized.sensitivity, 'health');
});

test('recognizes WHOOP recovery and HRV names emitted by personal-health', () => {
  const events = [];
  for (let days = 34; days >= 8; days -= 4) {
    events.push(event({ source: 'whoop', externalId: `wr-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'recovery_score_percent', value: 80 } }));
    events.push(event({ source: 'whoop', externalId: `wh-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_rmssd_ms', value: 60 } }));
  }
  for (let days = 6; days >= 1; days -= 2) {
    events.push(event({ source: 'whoop', externalId: `wrn-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'recovery_score_percent', value: 50 } }));
    events.push(event({ source: 'whoop', externalId: `whn-${days}`, occurredAt: new Date(now.getTime() - days * 86_400_000).toISOString(), metrics: { name: 'hrv_rmssd_ms', value: 40 } }));
  }
  const health = buildPersonalBrief({ userId: 'guenni', events, now }).signals.find((signal) => signal.id === 'health.weekly-pattern');
  assert.match(health.summary, /HRV · RMSSD \(whoop\): -33 %/);
  assert.match(health.summary, /Erholung \(whoop\): -37 %/);
});
