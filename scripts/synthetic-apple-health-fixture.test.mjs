import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyntheticAppleHealthFixture } from './fixtures/synthetic-apple-health.mjs';

test('synthetic Apple Health browser fixture is deterministic, small and contains no personal data',()=>{
  const fixture=buildSyntheticAppleHealthFixture({now:new Date('2026-11-07T12:00:00.000Z'),daysAgo:2});
  assert.equal(fixture.name,'agentone-synthetic-health.xml');assert.equal(fixture.mimeType,'application/xml');assert.equal(fixture.day,'2026-11-05');assert.equal(fixture.previousDay,'2026-11-04');assert.ok(fixture.buffer.length<4_096);assert.equal(fixture.buffer.toString('utf8'),fixture.xml);
  assert.match(fixture.xml,/AgentOne Synthetic Smoke/);assert.match(fixture.xml,/HKQuantityTypeIdentifierStepCount/);assert.match(fixture.xml,/HKCategoryTypeIdentifierSleepAnalysis/);assert.match(fixture.xml,/value="1234"/);assert.doesNotMatch(fixture.xml,/email|@|password|secret|token|consent|recordId|sourceRecordId/i);
  assert.equal(fixture.synthetic,true);assert.equal(Object.isFrozen(fixture),true);
});

test('synthetic Apple Health fixture rejects unstable date inputs',()=>{
  assert.throws(()=>buildSyntheticAppleHealthFixture({now:'not-a-date'}),/valid timestamp/);
  assert.throws(()=>buildSyntheticAppleHealthFixture({daysAgo:0}),/between 1 and 30/);
  assert.throws(()=>buildSyntheticAppleHealthFixture({daysAgo:31}),/between 1 and 30/);
});
