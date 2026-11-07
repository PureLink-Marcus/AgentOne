import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { buildHealthDigest, compareHealthSources, createHealthConsent, createWhoopAuthorizationUrl, extractAppleHealthXml, importAppleHealth, normalizeWhoopBundle, verifyWhoopWebhook } from './personal-health.mjs';

const consent = createHealthConsent({ id: 'consent-1', userId: 'guenni', providers: ['apple_health', 'whoop'], scopes: ['activity', 'sleep', 'vitals', 'body', 'workouts'], grantedAt: '2026-11-01T00:00:00Z' });
const appleXml = `<?xml version="1.0"?><HealthData>
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" creationDate="2026-11-06 08:00:00 +0100" startDate="2026-11-06 07:00:00 +0100" endDate="2026-11-06 08:00:00 +0100" value="4200"/>
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" creationDate="2026-11-06 08:00:00 +0100" startDate="2026-11-06 07:00:00 +0100" endDate="2026-11-06 08:00:00 +0100" value="4200"/>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-11-05 23:00:00 +0100" endDate="2026-11-06 00:30:00 +0100"/>
<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="45" durationUnit="min" startDate="2026-11-06 18:00:00 +0100" endDate="2026-11-06 18:45:00 +0100"/>
</HealthData>`;

function zipExportXml(content) {
  const name = Buffer.from('apple_health_export/export.xml'), raw = Buffer.from(content), compressed = deflateRawSync(raw);
  let crc = 0xffffffff; for (const byte of raw) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
  const offset = local.length + name.length + compressed.length, eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, name, compressed, central, name, eocd]);
}

test('Apple Health XML and ZIP imports normalize and deduplicate records', () => {
  assert.equal(extractAppleHealthXml(zipExportXml(appleXml)), appleXml);
  const result = importAppleHealth(zipExportXml(appleXml), { consent, receivedAt: '2026-11-07T10:00:00Z' });
  assert.equal(result.metrics.filter((item) => item.metric === 'steps').length, 1);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.metrics.find((item) => item.metric === 'sleep_minutes').value, 90);
  assert.equal(result.metrics.find((item) => item.metric === 'workout_minutes').dimensions.sport, 'walking');
  assert.ok(result.metrics.every((item) => item.sensitivity === 'health' && item.provenance.consentId === 'consent-1'));
});

test('Apple Health parser rejects missing consent and XML entities', () => {
  assert.throws(() => importAppleHealth(appleXml, {}), /freigabe/i);
  assert.throws(() => importAppleHealth('<!DOCTYPE x [<!ENTITY a "secret">]><HealthData/>', { consent }), /Entitäten/);
});

test('health consent scopes strictly filter Apple and WHOOP metric classes', () => {
  const activityOnly = createHealthConsent({ id: 'activity-only', userId: 'guenni', providers: ['apple_health'], scopes: ['activity'], grantedAt: '2026-11-01T00:00:00Z' });
  const apple = importAppleHealth(appleXml, { consent: activityOnly, receivedAt: '2026-11-07T10:00:00Z' });
  assert.deepEqual([...new Set(apple.metrics.map((item) => item.metric))], ['steps']);
  assert.equal(apple.metrics.some((item) => item.metric === 'sleep_minutes' || item.metric === 'workout_minutes'), false);

  const sleepOnly = createHealthConsent({ id: 'sleep-only', userId: 'guenni', providers: ['whoop'], scopes: ['sleep'], grantedAt: '2026-11-01T00:00:00Z' });
  const whoop = normalizeWhoopBundle({
    recoveries: [{ cycle_id: 12, sleep_id: 'sleep-12', created_at: '2026-11-07T06:00:00Z', score_state: 'SCORED', score: { recovery_score: 71, resting_heart_rate: 55 } }],
    sleeps: [{ id: 'sleep-12', start: '2026-11-06T22:00:00Z', end: '2026-11-07T06:00:00Z', score_state: 'SCORED', score: { stage_summary: { total_light_sleep_time_milli: 14_400_000 }, sleep_performance_percentage: 91, respiratory_rate: 15.2 } }],
  }, { consent: sleepOnly, receivedAt: '2026-11-07T10:00:00Z' });
  assert.deepEqual(new Set(whoop.metrics.map((item) => item.metric)), new Set(['sleep_minutes', 'sleep_performance_percent']));
  const strainBundle = {
    cycles: [{ id: 'cycle-1', start: '2026-11-06T06:00:00Z', end: '2026-11-07T06:00:00Z', score_state: 'SCORED', score: { strain: 8.2 } }],
    workouts: [{ id: 'workout-1', start: '2026-11-06T18:00:00Z', end: '2026-11-06T18:45:00Z', score_state: 'SCORED', sport_name: 'Walking', score: { strain: 12.1 } }],
  };
  const activityWhoop = createHealthConsent({ id: 'activity-whoop', userId: 'guenni', providers: ['whoop'], scopes: ['activity'], grantedAt: '2026-11-01T00:00:00Z' });
  const activityStrain = normalizeWhoopBundle(strainBundle, { consent: activityWhoop, receivedAt: '2026-11-07T10:00:00Z' }).metrics;
  assert.deepEqual(activityStrain.map((item) => [item.metric, item.provenance.originalType]), [['strain_score', 'cycle']]);
  const workoutsWhoop = createHealthConsent({ id: 'workouts-whoop', userId: 'guenni', providers: ['whoop'], scopes: ['workouts'], grantedAt: '2026-11-01T00:00:00Z' });
  const workoutStrain = normalizeWhoopBundle(strainBundle, { consent: workoutsWhoop, receivedAt: '2026-11-07T10:00:00Z' }).metrics;
  assert.deepEqual(new Set(workoutStrain.map((item) => `${item.metric}:${item.provenance.originalType}`)), new Set(['workout_minutes:workout', 'strain_score:workout']));
  assert.throws(() => createHealthConsent({ userId: 'guenni', providers: ['apple_health'], scopes: ['recovery'] }), /Datenbereiche/);
});

test('WHOOP V2 bundle is normalized without inventing medical advice', () => {
  const result = normalizeWhoopBundle({
    cycles: [{ id: 12, start: '2026-11-06T06:00:00Z', end: '2026-11-07T06:00:00Z', timezone_offset: '+01:00', score_state: 'SCORED', step_count: 4000, score: { strain: 8.2, kilojoule: 1000, average_heart_rate: 70 } }],
    recoveries: [{ cycle_id: 12, sleep_id: 'sleep-12', created_at: '2026-11-07T06:00:00Z', score_state: 'SCORED', score: { recovery_score: 71, resting_heart_rate: 55, hrv_rmssd_milli: 48, spo2_percentage: 97 } }],
    sleeps: [{ id: 'sleep-12', start: '2026-11-06T22:00:00Z', end: '2026-11-07T06:00:00Z', score_state: 'SCORED', nap: false, score: { stage_summary: { total_light_sleep_time_milli: 14_400_000, total_slow_wave_sleep_time_milli: 7_200_000, total_rem_sleep_time_milli: 5_400_000 }, sleep_performance_percentage: 91, sleep_consistency_percentage: 83, sleep_efficiency_percentage: 89, respiratory_rate: 15.2 } }],
  }, { consent, receivedAt: '2026-11-07T10:00:00Z' });
  assert.equal(result.metrics.find((item) => item.metric === 'sleep_minutes').value, 450);
  assert.equal(result.metrics.find((item) => item.metric === 'recovery_score_percent').value, 71);
  assert.ok(result.metrics.every((item) => item.interpretation === 'descriptive_not_medical'));
});

test('Apple and WHOOP daily values can be compared with a non-medical digest', () => {
  const apple = importAppleHealth(appleXml, { consent, receivedAt: '2026-11-07T10:00:00Z' }).metrics;
  const whoop = normalizeWhoopBundle({ cycles: [{ id: 12, start: '2026-11-06T06:00:00Z', end: '2026-11-07T06:00:00Z', score_state: 'SCORED', step_count: 4000, score: {} }] }, { consent, receivedAt: '2026-11-07T10:00:00Z' }).metrics;
  const comparison = compareHealthSources([...apple, ...whoop]);
  assert.equal(comparison.comparisons.find((item) => item.metric === 'steps').absoluteDifference, 200);
  const digest = buildHealthDigest([...apple, ...whoop], { now: new Date('2026-11-07T12:00:00Z') });
  assert.match(digest.disclaimer, /Keine Diagnose/);
});

test('WHOOP OAuth allowlists scopes and webhook signatures reject stale requests', () => {
  const url = new URL(createWhoopAuthorizationUrl({ clientId: 'client-1', redirectUri: 'https://agentone.example/health/whoop/callback', state: 'state_123456', scopes: ['offline', 'read:sleep', 'admin'] }));
  assert.equal(url.searchParams.get('scope'), 'offline read:sleep');
  const timestamp = '1794045600000', rawBody = '{"type":"sleep.updated","id":"abc"}', secret = 'webhook-secret';
  const signature = createHmac('sha256', secret).update(timestamp + rawBody).digest('base64');
  assert.equal(verifyWhoopWebhook({ rawBody, signature, timestamp, secret, now: Number(timestamp) + 1000 }), true);
  assert.equal(verifyWhoopWebhook({ rawBody, signature, timestamp, secret, now: Number(timestamp) + 600_000 }), false);
});
