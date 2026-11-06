import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveEventBus, formatSseMessage, redactLiveEvent } from './live-events.mjs';

function fakeTimers() {
  const timers = new Map();
  let id = 0;
  return {
    setIntervalFn(callback, delay) { const next = ++id; timers.set(next, { callback, delay }); return next; },
    clearIntervalFn(timerId) { timers.delete(timerId); },
    tick() { for (const timer of [...timers.values()]) timer.callback(); },
    count() { return timers.size; },
  };
}

test('isoliert Events strikt nach Benutzer und optional nach Welt', () => {
  const bus = createLiveEventBus();
  const marcus = [];
  const lea = [];
  bus.subscribe({ userId: 'marcus', worldIds: ['product'], onEvent: (event) => marcus.push(event) });
  bus.subscribe({ userId: 'lea', onEvent: (event) => lea.push(event) });
  bus.publish({ userId: 'marcus', worldId: 'product', type: 'STEP_STARTED' });
  bus.publish({ userId: 'marcus', worldId: 'images', type: 'STEP_STARTED' });
  bus.publish({ userId: 'lea', worldId: 'product', type: 'STEP_STARTED' });
  assert.deepEqual(marcus.map((event) => event.worldId), ['product']);
  assert.deepEqual(lea.map((event) => event.userId), ['lea']);
  bus.close();
});

test('Sequenzen sind monoton und begrenzter Replay respektiert Cursor und Filter', () => {
  const bus = createLiveEventBus({ capacity: 3, clock: () => Date.UTC(2026, 9, 30) });
  for (let index = 0; index < 5; index += 1) {
    bus.publish({ userId: 'marcus', worldId: index % 2 ? 'images' : 'product', type: 'PROGRESS', index });
  }
  assert.deepEqual(bus.replay({ userId: 'marcus', since: 0 }).map((event) => event.sequence), [3, 4, 5]);
  assert.deepEqual(bus.replay({ userId: 'marcus', worldIds: ['product'], since: 3 }).map((event) => event.sequence), [5]);
  const delivered = [];
  bus.subscribe({ userId: 'marcus', since: 3, onEvent: (event) => delivered.push(event.sequence) });
  assert.deepEqual(delivered, [4, 5]);
  assert.equal(bus.stats().sequence, 5);
  bus.close();
});

test('redigiert geheime Schlüssel und typische Secret-Werte vor Pufferung und Versand', () => {
  const bus = createLiveEventBus();
  const delivered = [];
  bus.subscribe({ userId: 'marcus', onEvent: (event) => delivered.push(event) });
  const event = bus.publish({
    userId: 'marcus',
    worldId: 'product',
    type: 'TOOL_RESULT',
    apiKey: 'should-never-appear',
    nested: { password: 'also-secret', note: 'Bearer abcdefghijklmnopqrstuvwxyz' },
    array: ['sk-abcdefghijklmnopqrstuvwxyz'],
  });
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('should-never-appear'), false);
  assert.equal(serialized.includes('also-secret'), false);
  assert.equal(serialized.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(event.apiKey, '[REDACTED]');
  assert.equal(event.nested.password, '[REDACTED]');
  assert.deepEqual(delivered, [event]);
  bus.close();
});

test('Heartbeat startet einmal, trägt den aktuellen Cursor und stoppt nach letztem Unsubscribe', () => {
  const timers = fakeTimers();
  let now = Date.UTC(2026, 9, 30, 9, 0, 0);
  const bus = createLiveEventBus({ ...timers, clock: () => now, heartbeatMs: 1000 });
  const beats = [];
  const first = bus.subscribe({ userId: 'marcus', onEvent() {}, onHeartbeat: (beat) => beats.push(beat) });
  const second = bus.subscribe({ userId: 'marcus', worldIds: ['product'], onEvent() {} });
  assert.equal(timers.count(), 1);
  bus.publish({ userId: 'marcus', worldId: 'product', type: 'RUNNING' });
  now += 1000;
  timers.tick();
  assert.equal(beats[0].sequence, 1);
  assert.match(formatSseMessage(beats[0]), /^: heartbeat 1 /);
  assert.equal(first.unsubscribe(), true);
  assert.equal(first.unsubscribe(), false);
  assert.equal(timers.count(), 1);
  second.unsubscribe();
  assert.equal(timers.count(), 0);
  assert.equal(bus.stats().subscribers, 0);
});

test('fehlerhafte Empfänger werden entfernt und blockieren andere nicht', () => {
  const timers = fakeTimers();
  const bus = createLiveEventBus(timers);
  const received = [];
  let reported;
  bus.subscribe({ userId: 'marcus', onEvent() { throw new Error('closed stream'); }, onError: (error) => { reported = error.message; } });
  bus.subscribe({ userId: 'marcus', onEvent: (event) => received.push(event.sequence) });
  bus.publish({ userId: 'marcus', worldId: 'product', type: 'RUNNING' });
  assert.equal(reported, 'closed stream');
  assert.deepEqual(received, [1]);
  assert.equal(bus.stats().subscribers, 1);
  bus.close();
  assert.equal(timers.count(), 0);
});

test('weist ungültige und zu große Events ab', () => {
  const bus = createLiveEventBus();
  assert.throws(() => bus.publish({ userId: '../marcus', worldId: 'product', type: 'RUNNING' }), /userId/);
  assert.throws(() => bus.publish({ userId: 'marcus', worldId: 'product', type: 'RUNNING', data: 'x'.repeat(70_000) }), /64 KiB/);
  assert.throws(() => redactLiveEvent({ get loop() { return this; } }), /Zyklische/);
  bus.close();
});

test('formatiert Datenereignisse als standardkonformes SSE', () => {
  const bus = createLiveEventBus({ clock: () => Date.UTC(2026, 9, 30) });
  const event = bus.publish({ userId: 'marcus', worldId: 'product', type: 'STEP_STARTED', title: 'Research' });
  const formatted = formatSseMessage(event);
  assert.match(formatted, /^id: 1\nevent: step_started\ndata: /);
  assert.ok(formatted.endsWith('\n\n'));
  bus.close();
});
