import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { EngineError, createPlatformEngine, payloadHash } from './platform-engine.mjs';

function fixture({ budget = 10 } = {}) {
  const db = new DatabaseSync(':memory:');
  let sequence = 0;
  const engine = createPlatformEngine(db, {
    now: () => `2026-10-30T10:00:${String(sequence).padStart(2, '0')}.000Z`,
    idFactory: (prefix) => `${prefix}-${++sequence}`,
  });
  engine.defineWorkflow({
    id: 'publish-flow',
    version: 1,
    name: 'Sicher publizieren',
    steps: [
      { id: 'research', risk: 'READ' },
      { id: 'snapshot', risk: 'READ' },
      { id: 'push', risk: 'WRITE' },
    ],
  });
  const run = engine.createRun({ id: 'RUN-1', workflowId: 'publish-flow', worldId: 'WORLD-1', budgetLimit: budget, input: { products: [42] } });
  return { db, engine, run };
}

function reachPush(engine) {
  engine.start('RUN-1');
  engine.executeCurrentStep('RUN-1', { payload: { query: 42 }, output: { sources: 4 }, cost: 1 });
  engine.executeCurrentStep('RUN-1', { payload: { products: [42] }, output: { snapshot: 'sha256:abc' }, cost: 1 });
}

test('kein Push ohne hashgebundene menschliche Freigabe', () => {
  const { engine } = fixture();
  reachPush(engine);
  assert.throws(
    () => engine.executeCurrentStep('RUN-1', { payload: { snapshot: 'sha256:abc' }, output: { published: true }, cost: 1 }),
    (error) => error instanceof EngineError && error.code === 'GATE_REQUIRED' && error.status === 403,
  );
  assert.equal(engine.getRun('RUN-1').steps[2].status, 'PENDING');
});

test('Freigabe gilt nur für den unveränderten Payload', () => {
  const { engine } = fixture();
  reachPush(engine);
  const approvedPayload = { snapshot: 'sha256:abc', target: 'staging' };
  const gate = engine.requestGate('RUN-1', approvedPayload, 'marcus@purelink.de');
  assert.equal(gate.payloadHash, payloadHash(approvedPayload));
  engine.decideGate(gate.id, { decision: 'APPROVED', actor: 'lea@purelink.com' });
  engine.start('RUN-1');
  assert.throws(
    () => engine.executeCurrentStep('RUN-1', { payload: { snapshot: 'sha256:changed', target: 'staging' }, cost: 1 }),
    (error) => error.code === 'GATE_REQUIRED',
  );
  const completed = engine.executeCurrentStep('RUN-1', { payload: approvedPayload, output: { published: 42 }, cost: 1 });
  assert.equal(completed.status, 'COMPLETED');
});

test('Pause und Resume setzen nach dem letzten sicheren Checkpoint fort', () => {
  const { db, engine } = fixture();
  engine.start('RUN-1');
  engine.executeCurrentStep('RUN-1', { payload: { query: 42 }, output: { sources: 4 }, cost: 1 });
  engine.pause('RUN-1', 'operator');
  const restored = createPlatformEngine(db, { now: () => '2026-10-30T10:10:00.000Z' });
  const beforeResume = restored.getRun('RUN-1');
  assert.equal(beforeResume.currentStep, 1);
  assert.equal(beforeResume.checkpoint.stepId, 'research');
  restored.start('RUN-1');
  const afterResume = restored.executeCurrentStep('RUN-1', { payload: { products: [42] }, output: { snapshot: 'sha256:abc' }, cost: 1 });
  assert.equal(afterResume.currentStep, 2);
  assert.equal(afterResume.steps[0].status, 'COMPLETED');
  assert.equal(afterResume.steps[1].status, 'COMPLETED');
});

test('Budgetüberschreitung stoppt deterministisch und benötigt eine Erhöhung', () => {
  const { engine } = fixture({ budget: 2 });
  engine.start('RUN-1');
  const stopped = engine.executeCurrentStep('RUN-1', { payload: { query: 42 }, cost: 3 });
  assert.equal(stopped.status, 'PAUSED_BUDGET');
  assert.equal(stopped.currentStep, 0);
  assert.equal(stopped.budgetUsed, 0);
  assert.throws(() => engine.start('RUN-1'), (error) => error.code === 'BUDGET_REQUIRED');
  engine.increaseBudget('RUN-1', 5, 'marcus@purelink.de');
  engine.start('RUN-1');
  const continued = engine.executeCurrentStep('RUN-1', { payload: { query: 42 }, cost: 3 });
  assert.equal(continued.currentStep, 1);
  assert.equal(continued.budgetUsed, 3);
});

test('veröffentlichte Workflow-Versionen sind unveränderlich', () => {
  const { engine } = fixture();
  assert.throws(() => engine.defineWorkflow({ id: 'publish-flow', version: 1, steps: [{ id: 'changed' }] }), (error) => error.code === 'IMMUTABLE_TEMPLATE');
});

test('Control-Plane-Snapshot listet Workflows, Runs und Gates gefiltert', () => {
  const { engine } = fixture();
  reachPush(engine);
  const gate = engine.requestGate('RUN-1', { snapshot: 'sha256:abc' }, 'worker');
  assert.equal(engine.listWorkflows()[0].id, 'publish-flow');
  assert.equal(engine.listRuns({ worldId: 'WORLD-1' })[0].id, 'RUN-1');
  assert.equal(engine.listRuns({ worldId: 'other' }).length, 0);
  assert.equal(engine.listGates({ runId: 'RUN-1', status: 'PENDING' })[0].id, gate.id);
});
