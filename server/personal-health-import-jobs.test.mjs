import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { deflateRawSync } from 'node:zlib';

import { createHealthConsent } from './personal-health.mjs';
import { getHealthConsent, initPersonalHealthStore, queryHealthMetrics, saveHealthConsent } from './personal-health-store.mjs';
import { decryptDemoSecret, encryptDemoSecret } from './secrets.mjs';
import {
  attachHealthImportCommand,
  cancelHealthImportJob,
  claimNextHealthImportJob,
  completeHealthImportJob,
  decryptHealthImportArchive,
  failHealthImportJob,
  getHealthImportJob,
  getHealthImportJobInternal,
  initHealthImportJobStore,
  listHealthImportJobs,
  receiveHealthImportJob,
} from './personal-health-import-jobs.mjs';
import { runHealthImportWorker } from './personal-health-import-runner.mjs';

const masterSecret = 'release-102-health-master-key-for-tests-only-0001';
const cryptoEnv = { AGENTONE_DEMO_MASTER_KEY: masterSecret };
const encrypt = (value) => encryptDemoSecret(value, cryptoEnv);
const decrypt = (value) => decryptDemoSecret(value, cryptoEnv);
const xml = Buffer.from('<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-11-07 07:00:00 +0100" endDate="2026-11-07 08:00:00 +0100" value="4200"/></HealthData>');

function zipWithBombMetadata(content) {
  const name = Buffer.from('apple_health_export/export.xml'), raw = Buffer.from(content), compressed = deflateRawSync(raw);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(Math.max(compressed.length * 251, 1_000_000), 24); central.writeUInt16LE(name.length, 28);
  const offset = local.length + name.length + compressed.length, eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, name, compressed, central, name, eocd]);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentone-health-job-'));
  const databasePath = path.join(root, 'agentone-demo.sqlite'), quarantineDir = path.join(root, 'quarantine');
  const db = new DatabaseSync(databasePath); db.exec('PRAGMA journal_mode=WAL;');
  initPersonalHealthStore(db); initHealthImportJobStore(db, { quarantineDir });
  return { root, databasePath, quarantineDir, db, close() { try { this.db.close(); } catch {} fs.rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }); } };
}

async function receive(db, quarantineDir, data = xml, overrides = {}) {
  const stream = Readable.from([data]);
  return receiveHealthImportJob(stream, {
    db, userId: overrides.userId || 'alice', consentId: overrides.consentId || 'consent-alice',
    fileName: overrides.fileName || 'export.xml', contentType: overrides.contentType || 'application/xml',
    contentLength: overrides.contentLength ?? data.length, quarantineDir, masterSecret,
    maxBytes: overrides.maxBytes,
  });
}

test('upload is encrypted at rest, idempotent and strictly user-isolated', async () => {
  const f = fixture();
  try {
    const first = await receive(f.db, f.quarantineDir);
    assert.equal(first.created, true); assert.equal(first.job.state, 'QUEUED');
    const internal = getHealthImportJobInternal(f.db, { jobId: first.job.id });
    const ciphertext = fs.readFileSync(internal.cipherPath);
    assert.equal(ciphertext.includes(Buffer.from('<HealthData>')), false);
    assert.equal(ciphertext.equals(xml), false);
    const plaintext = await decryptHealthImportArchive({ inputPath: internal.cipherPath, masterSecret, userId: 'alice', jobId: internal.id, iv: internal.cipherIv, tag: internal.cipherTag });
    assert.deepEqual(plaintext, xml); plaintext.fill(0);

    const publicPayload = JSON.stringify(first.job);
    for (const privateValue of [internal.sourceHash, internal.cipherPath, internal.cipherIv, internal.cipherTag, internal.consentId]) assert.equal(publicPayload.includes(privateValue), false);
    assert.throws(() => getHealthImportJob(f.db, { userId: 'bob', jobId: first.job.id }), { code: 'HEALTH_IMPORT_JOB_NOT_FOUND' });
    assert.deepEqual(listHealthImportJobs(f.db, { userId: 'bob' }), []);

    const duplicate = await receive(f.db, f.quarantineDir);
    assert.equal(duplicate.created, false); assert.equal(duplicate.job.id, first.job.id);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM personal_health_import_jobs WHERE state='QUEUED'").get().count, 1);
    assert.equal(listHealthImportJobs(f.db, { userId: 'alice' }).length, 1);
    assert.equal(fs.readdirSync(f.quarantineDir).filter((name) => name.endsWith('.a1h')).length, 1);
  } finally { f.close(); }
});

test('RUNNING jobs recover only with structurally intact ciphertext', async () => {
  const f = fixture();
  try {
    const created = await receive(f.db, f.quarantineDir);
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: created.job.id, runId: 'run-1', stepId: 'step-1' });
    const running = claimNextHealthImportJob(f.db); assert.equal(running.state, 'RUNNING');
    f.db.close(); f.db = new DatabaseSync(f.databasePath);
    initHealthImportJobStore(f.db, { quarantineDir: f.quarantineDir });
    assert.equal(getHealthImportJob(f.db, { userId: 'alice', jobId: running.id }).state, 'QUEUED');
    const again = claimNextHealthImportJob(f.db); fs.truncateSync(again.cipherPath, Math.max(1, again.bytesReceived - 1));
    f.db.close(); f.db = new DatabaseSync(f.databasePath);
    initHealthImportJobStore(f.db, { quarantineDir: f.quarantineDir });
    const failed = getHealthImportJob(f.db, { userId: 'alice', jobId: running.id });
    assert.equal(failed.state, 'FAILED'); assert.equal(failed.error.code, 'HEALTH_IMPORT_SOURCE_MISSING');
  } finally { f.close(); }
});

test('failed unlink retains cleanup metadata and restart retries cleanup', async () => {
  const f = fixture();
  try {
    const created = await receive(f.db, f.quarantineDir), before = getHealthImportJobInternal(f.db, { jobId: created.job.id });
    const original = fs.promises.unlink;
    fs.promises.unlink = async () => { throw Object.assign(new Error('simulated lock'), { code: 'EPERM' }); };
    try { assert.equal((await cancelHealthImportJob(f.db, { userId: 'alice', jobId: created.job.id, quarantineDir: f.quarantineDir })).state, 'CANCELLED'); }
    finally { fs.promises.unlink = original; }
    const retained = getHealthImportJobInternal(f.db, { jobId: created.job.id });
    assert.equal(retained.cipherPath, before.cipherPath); assert.equal(fs.existsSync(before.cipherPath), true);
    initHealthImportJobStore(f.db, { quarantineDir: f.quarantineDir });
    const cleaned = getHealthImportJobInternal(f.db, { jobId: created.job.id });
    assert.equal(cleaned.cipherPath, null); assert.equal(fs.existsSync(before.cipherPath), false);
  } finally { f.close(); }
});

test('cancelling an active job terminates its isolated child worker and removes ciphertext', async () => {
  const f = fixture();
  try {
    const created = await receive(f.db, f.quarantineDir);
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: created.job.id, runId: 'run-cancel', stepId: 'step-cancel' });
    const running = claimNextHealthImportJob(f.db), slowWorker = path.join(f.root, 'slow-worker.mjs');
    fs.writeFileSync(slowWorker, "process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>{},60000));", { mode: 0o600 });
    const controller = new AbortController(), work = runHealthImportWorker(running, { consent: {}, masterSecret, databasePath: f.databasePath, workerPath: slowWorker, signal: controller.signal, timeoutMs: 10_000 });
    await new Promise((resolve) => setTimeout(resolve, 40)); controller.abort();
    await assert.rejects(work, { code: 'HEALTH_IMPORT_CANCELLED' });
    const cancelled = await cancelHealthImportJob(f.db, { userId: 'alice', jobId: running.id, quarantineDir: f.quarantineDir });
    assert.equal(cancelled.state, 'CANCELLED'); assert.equal(fs.existsSync(running.cipherPath), false);
  } finally { f.close(); }
});

test('cancel and worker commit use one job-state CAS so persisted data is never reported cancelled', async () => {
  const f = fixture();
  try {
    const consent = createHealthConsent({ id: 'consent-alice', userId: 'alice', providers: ['apple_health'], scopes: ['activity'], purpose: 'Deskriptive Trends' });
    saveHealthConsent(f.db, { userId: 'alice', consent, encrypt });
    const storedConsent = getHealthConsent(f.db, { userId: 'alice', consentId: 'consent-alice', decrypt });

    const cancelWins = await receive(f.db, f.quarantineDir);
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: cancelWins.job.id, runId: 'run-cas-cancel', stepId: 'step-cas-cancel' });
    const cancelledRunning = claimNextHealthImportJob(f.db);
    assert.equal((await cancelHealthImportJob(f.db, { userId: 'alice', jobId: cancelledRunning.id, quarantineDir: f.quarantineDir })).state, 'CANCELLED');
    await assert.rejects(runHealthImportWorker(cancelledRunning, { consent: storedConsent, masterSecret, databasePath: f.databasePath }), /Importquelle|Worker-Verarbeitung/i);
    assert.equal(queryHealthMetrics(f.db, { userId: 'alice', decrypt }).length, 0);

    const secondXml = Buffer.from(xml.toString('utf8').replace('4200', '4300').replaceAll('07:00:00', '09:00:00').replaceAll('08:00:00', '10:00:00'));
    const commitWins = await receive(f.db, f.quarantineDir, secondXml);
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: commitWins.job.id, runId: 'run-cas-commit', stepId: 'step-cas-commit' });
    const committedRunning = claimNextHealthImportJob(f.db);
    const result = await runHealthImportWorker(committedRunning, { consent: storedConsent, masterSecret, databasePath: f.databasePath });
    assert.equal(result.inserted, 1);
    const afterLateCancel = await cancelHealthImportJob(f.db, { userId: 'alice', jobId: committedRunning.id, quarantineDir: f.quarantineDir });
    assert.equal(afterLateCancel.state, 'COMPLETED'); assert.equal(afterLateCancel.error, null);
    assert.equal(queryHealthMetrics(f.db, { userId: 'alice', decrypt }).length, 1);
  } finally { f.close(); }
});

test('isolated worker completes an archive larger than the old 32 MiB limit and persists no diagnosis', { timeout: 120_000 }, async () => {
  const f = fixture();
  try {
    const consent = createHealthConsent({ id: 'consent-alice', userId: 'alice', providers: ['apple_health'], scopes: ['activity'], purpose: 'Deskriptive Trends' });
    saveHealthConsent(f.db, { userId: 'alice', consent, encrypt });
    const comment = Buffer.alloc(33 * 1024 * 1024, 0x78);
    const large = Buffer.concat([Buffer.from('<?xml version="1.0"?><HealthData><!--'), comment, Buffer.from('--><Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-11-07 07:00:00 +0100" endDate="2026-11-07 08:00:00 +0100" value="4200"/></HealthData>')]);
    const created = await receive(f.db, f.quarantineDir, large);
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: created.job.id, runId: 'run-large', stepId: 'step-large' });
    const running = claimNextHealthImportJob(f.db);
    const storedConsent = getHealthConsent(f.db, { userId: 'alice', consentId: 'consent-alice', decrypt });
    const result = await runHealthImportWorker(running, { consent: storedConsent, masterSecret, databasePath: f.databasePath, timeoutMs: 90_000 });
    assert.equal(result.recordsSeen, 1); assert.equal(result.metrics, 1); assert.equal(result.inserted, 1);
    const completed = await completeHealthImportJob(f.db, { jobId: running.id, result, quarantineDir: f.quarantineDir });
    assert.equal(completed.state, 'COMPLETED'); assert.equal(completed.result.metrics, 1);
    assert.equal(fs.existsSync(running.cipherPath), false);
    const metrics = queryHealthMetrics(f.db, { userId: 'alice', decrypt });
    assert.equal(metrics.length, 1); assert.equal(metrics[0].interpretation, 'descriptive_not_medical');
    assert.equal(JSON.stringify(completed).includes('4200'), false);
  } finally { f.close(); }
});

test('worker rejects ZIP-bomb metadata before inflation and stores no health value', async () => {
  const f = fixture();
  try {
    const consent = createHealthConsent({ id: 'consent-alice', userId: 'alice', providers: ['apple_health'], scopes: ['activity'], purpose: 'Deskriptive Trends' });
    saveHealthConsent(f.db, { userId: 'alice', consent, encrypt });
    const bomb = zipWithBombMetadata(xml), created = await receive(f.db, f.quarantineDir, bomb, { fileName: 'export.zip', contentType: 'application/zip' });
    attachHealthImportCommand(f.db, { userId: 'alice', jobId: created.job.id, runId: 'run-bomb', stepId: 'step-bomb' });
    const running = claimNextHealthImportJob(f.db), storedConsent = getHealthConsent(f.db, { userId: 'alice', consentId: 'consent-alice', decrypt });
    await assert.rejects(runHealthImportWorker(running, { consent: storedConsent, masterSecret, databasePath: f.databasePath }), { code: 'HEALTH_INPUT_INVALID' });
    await failHealthImportJob(f.db, { jobId: running.id, error: { code: 'HEALTH_INPUT_INVALID' }, quarantineDir: f.quarantineDir });
    assert.equal(getHealthImportJob(f.db, { userId: 'alice', jobId: running.id }).state, 'FAILED');
    assert.equal(queryHealthMetrics(f.db, { userId: 'alice', decrypt }).length, 0);
  } finally { f.close(); }
});

test('declared size and path limits reject before creating a job', async () => {
  const f = fixture();
  try {
    await assert.rejects(receive(f.db, f.quarantineDir, xml, { contentLength: 1025, maxBytes: 1024 }), { code: 'HEALTH_UPLOAD_TOO_LARGE' });
    await assert.rejects(receive(f.db, f.quarantineDir, xml, { fileName: '../export.xml' }), { code: 'HEALTH_UPLOAD_PATH_INVALID' });
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM personal_health_import_jobs').get().count, 0);
  } finally { f.close(); }
});
