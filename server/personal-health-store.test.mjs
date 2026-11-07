import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import {
  deleteHealthData,
  exportHealthData,
  getHealthConsent,
  healthStoreAuditSummary,
  initPersonalHealthStore,
  listHealthConsents,
  queryHealthMetrics,
  revokeHealthConsent,
  saveDerivedHealthSignal,
  saveHealthConsent,
  storeHealthImport,
} from './personal-health-store.mjs';

const key = randomBytes(32);
const encrypt = (plaintext) => {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { algorithm: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};
const decrypt = (record) => {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

function database() { const db = new DatabaseSync(':memory:'); initPersonalHealthStore(db); return db; }
function consent(userId = 'guenni') { return { id: `consent-${userId}`, userId, providers: ['apple_health'], scopes: ['sleep'], grantedAt: '2026-11-01T00:00:00.000Z', purpose: 'Persönlicher Verlauf' }; }
function metric(userId = 'guenni', overrides = {}) {
  return {
    id: overrides.id ?? 'a'.repeat(64), source: 'apple_health', sourceRecordId: 'record-1', metric: 'sleep_minutes',
    value: 420, unit: 'min', aggregation: 'sum', startAt: '2026-11-05T22:00:00.000Z', endAt: '2026-11-06T05:00:00.000Z',
    sensitivity: 'health', interpretation: 'descriptive_not_medical', dimensions: {},
    provenance: { provider: 'apple_health', originalType: 'Sleep', consentId: `consent-${userId}`, receivedAt: '2026-11-07T10:00:00.000Z' },
    ...overrides,
  };
}

test('consent and metric payloads are encrypted and strictly user-bound', () => {
  const db = database();
  saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt });
  assert.equal(getHealthConsent(db, { userId: 'guenni', consentId: 'consent-guenni', decrypt }).purpose, 'Persönlicher Verlauf');
  assert.deepEqual(listHealthConsents(db, { userId: 'guenni', decrypt }).map((item) => item.id), ['consent-guenni']);
  assert.equal(listHealthConsents(db, { userId: 'fressi', decrypt }).length, 0);
  assert.throws(() => getHealthConsent(db, { userId: 'fressi', consentId: 'consent-guenni', decrypt }), /nicht gefunden/i);
  storeHealthImport(db, { userId: 'guenni', importId: 'import-1', provider: 'apple_health', consentId: 'consent-guenni', sourceHash: 'b'.repeat(64), metrics: [metric()], metadata: { fileName: 'export.zip' }, encrypt });
  const raw = db.prepare('SELECT payload_encrypted AS payload FROM personal_health_metrics').get().payload;
  assert.doesNotMatch(raw, /420|sleep_minutes|record-1/);
  assert.equal(queryHealthMetrics(db, { userId: 'fressi', decrypt }).length, 0);
  assert.equal(queryHealthMetrics(db, { userId: 'guenni', metricNames: ['sleep_minutes'], decrypt })[0].value, 420);
});

test('repeated source import is idempotent', () => {
  const db = database(); saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt });
  const input = { userId: 'guenni', provider: 'apple_health', consentId: 'consent-guenni', sourceHash: 'c'.repeat(64), metrics: [metric()], encrypt };
  const first = storeHealthImport(db, { ...input, importId: 'import-1' });
  const second = storeHealthImport(db, { ...input, importId: 'import-2' });
  assert.deepEqual([first.inserted, first.unchanged, second.alreadyImported], [1, 0, true]);
  assert.equal(healthStoreAuditSummary(db, 'guenni').metrics, 1);
  assert.equal(healthStoreAuditSummary(db, 'guenni').imports, 1);
});

test('a consent cannot be reused for a provider outside its grant', () => {
  const db = database(); saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt });
  assert.throws(() => storeHealthImport(db, {
    userId: 'guenni', importId: 'whoop-import', provider: 'whoop', consentId: 'consent-guenni',
    sourceHash: '7'.repeat(64), metrics: [metric('guenni', { id: '7'.repeat(64), source: 'whoop', provenance: { provider: 'whoop', consentId: 'consent-guenni', receivedAt: '2026-11-07T10:00:00Z' } })], encrypt,
  }), /umfasst diese Gesundheitsquelle nicht/i);
});

test('query filters source, period and opaque metric hash', () => {
  const db = database(); saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt });
  storeHealthImport(db, { userId: 'guenni', importId: 'import-1', provider: 'apple_health', consentId: 'consent-guenni', sourceHash: 'd'.repeat(64), metrics: [metric(), metric('guenni', { id: 'e'.repeat(64), metric: 'steps', value: 9000, unit: 'count', startAt: '2026-11-07T08:00:00Z', endAt: '2026-11-07T09:00:00Z' })], encrypt });
  assert.equal(queryHealthMetrics(db, { userId: 'guenni', metricNames: ['steps'], from: '2026-11-07T00:00:00Z', decrypt }).length, 1);
  assert.equal(queryHealthMetrics(db, { userId: 'guenni', metricNames: ['sleep_minutes'], from: '2026-11-07T00:00:00Z', decrypt }).length, 0);
});

test('deleting source data also removes dependent signals but not another user', () => {
  const db = database();
  for (const userId of ['guenni', 'fressi']) {
    saveHealthConsent(db, { userId, consent: consent(userId), encrypt });
    storeHealthImport(db, { userId, importId: `import-${userId}`, provider: 'apple_health', consentId: `consent-${userId}`, sourceHash: hashFor(userId), metrics: [metric(userId, { id: userId === 'guenni' ? 'a'.repeat(64) : 'f'.repeat(64) })], encrypt });
  }
  saveDerivedHealthSignal(db, { userId: 'guenni', signal: { id: 'signal-1', kind: 'coverage', summary: 'Datenabdeckung prüfen' }, metricIds: ['a'.repeat(64)], encrypt });
  const deleted = deleteHealthData(db, { userId: 'guenni', source: 'apple_health' });
  assert.deepEqual([deleted.metricsDeleted, deleted.derivedSignalsDeleted], [1, 1]);
  assert.equal(exportHealthData(db, { userId: 'guenni', decrypt }).signals.length, 0);
  assert.equal(queryHealthMetrics(db, { userId: 'fressi', decrypt }).length, 1);
});

test('export is explicit, audit is value-free, and consent can be revoked', () => {
  const db = database(); saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt });
  storeHealthImport(db, { userId: 'guenni', importId: 'import-1', provider: 'apple_health', consentId: 'consent-guenni', sourceHash: '9'.repeat(64), metrics: [metric()], encrypt });
  const exported = exportHealthData(db, { userId: 'guenni', decrypt });
  assert.equal(exported.metrics[0].value, 420);
  assert.equal(exported.warning, 'SENSITIVE_PLAINTEXT_EXPORT');
  assert.equal(exported.limits.maxRecords, 10_000);
  assert.equal(exported.limits.maxBytes, 16 * 1024 * 1024);
  assert.deepEqual(healthStoreAuditSummary(db, 'guenni'), { schema: 'agentone.health-store-audit/v1', userId: 'guenni', consents: 1, imports: 1, metrics: 1, derivedSignals: 0, containsHealthValues: false, containsSecrets: false });
  assert.equal(revokeHealthConsent(db, { userId: 'guenni', consentId: 'consent-guenni', revokedAt: '2026-11-07T11:00:00Z' }).status, 'REVOKED');
  assert.throws(() => saveHealthConsent(db, { userId: 'guenni', consent: consent(), encrypt }), { code: 'HEALTH_CONSENT_REVOKED' });
  assert.throws(() => storeHealthImport(db, { userId: 'guenni', importId: 'import-2', provider: 'apple_health', consentId: 'consent-guenni', sourceHash: '8'.repeat(64), metrics: [metric('guenni', { id: '8'.repeat(64) })], encrypt }), /Freigabe/i);
});

function hashFor(value) { return Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64); }
