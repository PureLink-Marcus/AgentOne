import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { initPersonalPulseStore, listPersonalPulseDeliveries, planPersonalPulse, recordPersonalPulseDelivery, resetPersonalPulseDeliveries } from './personal-pulse.mjs';

const signals = [
  { id: 'mail.daily-triage', notificationKey: 'aaaaaaaaaaaaaaaa', severity: 'info' },
  { id: 'health.weekly-pattern', notificationKey: 'bbbbbbbbbbbbbbbb', severity: 'attention' },
  { id: 'calendar.next-24h', notificationKey: 'cccccccccccccccc', severity: 'attention' },
  { id: 'cross.recovery-schedule', notificationKey: 'dddddddddddddddd', severity: 'info' },
];

function database() { const db = new DatabaseSync(':memory:'); initPersonalPulseStore(db); return db; }

test('plans attention before info and enforces a local daily budget', () => {
  const db = database();
  const plan = planPersonalPulse(db, { userId: 'u1', signals, now: '2026-11-07T12:00:00Z', timeZone: 'Europe/Berlin', dailyLimit: 3 });
  assert.deepEqual(plan.items.map((item) => item.id), ['health.weekly-pattern', 'calendar.next-24h', 'mail.daily-triage']);
  assert.deepEqual(plan.channels, ['in-app']);
  for (const item of plan.items) recordPersonalPulseDelivery(db, { id: `delivery-${item.id}`, userId: 'u1', signalId: item.id, notificationKey: item.notificationKey, now: plan.generatedAt });
  assert.equal(planPersonalPulse(db, { userId: 'u1', signals: [signals[3]], now: '2026-11-07T18:00:00Z' }).items.length, 0);
  assert.equal(planPersonalPulse(db, { userId: 'u1', signals: [signals[3]], now: '2026-11-08T12:00:00Z' }).items.length, 1);
  db.close();
});

test('delivery is idempotent for user, notification key and channel', () => {
  const db = database(), input = { id: 'd1', userId: 'u1', signalId: signals[0].id, notificationKey: signals[0].notificationKey, now: '2026-11-07T12:00:00Z' };
  assert.equal(recordPersonalPulseDelivery(db, input).delivered, true);
  assert.equal(recordPersonalPulseDelivery(db, { ...input, id: 'd2' }).delivered, false);
  assert.equal(recordPersonalPulseDelivery(db, { ...input, id: 'd3', userId: 'u2' }).delivered, true);
  assert.equal(listPersonalPulseDeliveries(db, 'u1').length, 1);
  assert.equal(listPersonalPulseDeliveries(db, 'u2').length, 1);
  db.close();
});

test('quiet hours keep in-app visible but suppress external delivery', () => {
  const db = database();
  const quiet = planPersonalPulse(db, { userId: 'u1', signals: [signals[1]], channels: ['pwa', 'telegram'], externalOptIn: ['pwa', 'telegram'], now: '2026-11-07T22:30:00Z', timeZone: 'Europe/Berlin' });
  assert.equal(quiet.quietNow, true);
  assert.deepEqual(quiet.items[0].channels, ['in-app']);
  const daytime = planPersonalPulse(db, { userId: 'u1', signals: [signals[1]], channels: ['pwa', 'telegram'], externalOptIn: ['pwa'], now: '2026-11-07T12:00:00Z', timeZone: 'Europe/Berlin' });
  assert.deepEqual(daytime.items[0].channels, ['in-app', 'pwa']);
  db.close();
});

test('external channels require explicit opt-in at planning and recording boundaries', () => {
  const db = database();
  const plan = planPersonalPulse(db, { userId: 'u1', signals: [signals[0]], channels: ['pwa'], externalOptIn: [] });
  assert.deepEqual(plan.channels, ['in-app']);
  assert.throws(() => recordPersonalPulseDelivery(db, { id: 'd1', userId: 'u1', signalId: signals[0].id, notificationKey: signals[0].notificationKey, channel: 'pwa' }), (error) => error.code === 'PERSONAL_PULSE_CHANNEL_NOT_OPTED_IN');
  assert.equal(recordPersonalPulseDelivery(db, { id: 'd2', userId: 'u1', signalId: signals[0].id, notificationKey: signals[0].notificationKey, channel: 'pwa', externalOptIn: ['pwa'] }).delivered, true);
  db.close();
});

test('reset is explicit and isolated to the current user', () => {
  const db = database();
  for (const userId of ['u1', 'u2']) recordPersonalPulseDelivery(db, { id: `d-${userId}`, userId, signalId: signals[0].id, notificationKey: signals[0].notificationKey });
  assert.throws(() => resetPersonalPulseDeliveries(db, { userId: 'u1' }), (error) => error.code === 'PERSONAL_PULSE_CONFIRMATION_REQUIRED');
  assert.equal(resetPersonalPulseDeliveries(db, { userId: 'u1', confirmation: 'RESET_MY_PULSE' }).deleted, 1);
  assert.equal(listPersonalPulseDeliveries(db, 'u1').length, 0);
  assert.equal(listPersonalPulseDeliveries(db, 'u2').length, 1);
  db.close();
});
