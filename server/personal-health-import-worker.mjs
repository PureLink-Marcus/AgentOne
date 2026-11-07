import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { importAppleHealth } from './personal-health.mjs';
import { initPersonalHealthStore, storeHealthImport } from './personal-health-store.mjs';
import { encryptDemoSecret } from './secrets.mjs';
import {
  HEALTH_IMPORT_JOB_MAX_BYTES,
  decryptHealthImportArchive,
  safeHealthImportFailure,
} from './personal-health-import-jobs.mjs';

async function readManifest(maxBytes = 64 * 1024) {
  const chunks = []; let total = 0;
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > maxBytes) throw Object.assign(new Error('Manifest zu groß'), { code: 'HEALTH_IMPORT_WORKER_FAILED' });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

function validatePaths(manifest) {
  const input = path.resolve(String(manifest.inputPath || '')), database = path.resolve(String(manifest.databasePath || ''));
  if (path.basename(input) !== `${manifest.jobId}.a1h` || path.extname(database).toLowerCase() !== '.sqlite' || !fs.statSync(database).isFile()) {
    throw Object.assign(new Error('Worker-Pfad ungültig'), { code: 'HEALTH_IMPORT_SOURCE_CORRUPT' });
  }
  return { input, database };
}

function matchingHash(buffer, expected) {
  if (!/^[a-f0-9]{64}$/i.test(String(expected || ''))) return false;
  const actual = Buffer.from(crypto.createHash('sha256').update(buffer).digest('hex'));
  const wanted = Buffer.from(String(expected).toLowerCase());
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

async function main() {
  const manifest = await readManifest(), { input, database } = validatePaths(manifest);
  const masterSecret = String(process.env.AGENTONE_HEALTH_MASTER_KEY || '');
  let plaintext;
  try {
    plaintext = await decryptHealthImportArchive({
      inputPath: input,
      masterSecret,
      userId: manifest.userId,
      jobId: manifest.jobId,
      iv: manifest.iv,
      tag: manifest.tag,
      maxBytes: Math.min(HEALTH_IMPORT_JOB_MAX_BYTES, Number(manifest.maxBytes) || HEALTH_IMPORT_JOB_MAX_BYTES),
    });
    if (!matchingHash(plaintext, manifest.sourceHash)) throw Object.assign(new Error('Hash stimmt nicht'), { code: 'HEALTH_IMPORT_SOURCE_CORRUPT' });
    const parsed = importAppleHealth(plaintext, {
      consent: manifest.consent,
      receivedAt: manifest.receivedAt,
      maxBytes: Math.min(HEALTH_IMPORT_JOB_MAX_BYTES, Number(manifest.maxBytes) || HEALTH_IMPORT_JOB_MAX_BYTES),
      maxRecords: Math.max(1, Math.min(300_000, Number(manifest.maxRecords) || 300_000)),
    });
    plaintext.fill(0); plaintext = null;
    const db = new DatabaseSync(database);
    let stored, result;
    try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;');
      initPersonalHealthStore(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        const active = db.prepare("SELECT 1 AS active FROM personal_health_import_jobs WHERE id=? AND user_id=? AND state='RUNNING'").get(manifest.jobId, manifest.userId);
        if (!active) throw Object.assign(new Error('Import wurde abgebrochen'), { code: 'HEALTH_IMPORT_CANCELLED' });
        stored = storeHealthImport(db, {
          userId: manifest.userId,
          importId: manifest.jobId,
          provider: 'apple_health',
          consentId: manifest.consentId,
          sourceHash: manifest.sourceHash,
          metrics: parsed.metrics,
          duplicateCount: parsed.duplicatesRemoved,
          metadata: { schema: 'agentone.apple-health-import/v1', recordsSeen: parsed.recordsSeen, ignoredRecords: parsed.ignoredRecords, excludedByConsent: parsed.excludedByConsent, importedAt: parsed.importedAt },
          encrypt: (value) => encryptDemoSecret(value, { AGENTONE_DEMO_MASTER_KEY: masterSecret }),
        });
        result = {
          importId: stored.id,
          recordsSeen: parsed.recordsSeen,
          metrics: parsed.metrics.length,
          inserted: stored.inserted,
          updated: stored.updated,
          unchanged: stored.unchanged,
          duplicatesRemoved: parsed.duplicatesRemoved,
          excludedByConsent: Number(parsed.excludedByConsent?.count || 0),
          alreadyImported: Boolean(stored.alreadyImported),
        };
        await fs.promises.unlink(input);
        const at = new Date().toISOString(), completed = db.prepare("UPDATE personal_health_import_jobs SET state='COMPLETED',phase='COMPLETED',percent=100,result_json=?,error_code=NULL,error_message=NULL,updated_at=?,completed_at=? WHERE id=? AND user_id=? AND state='RUNNING'")
          .run(JSON.stringify(result), at, at, manifest.jobId, manifest.userId);
        if (!completed.changes) throw Object.assign(new Error('Import wurde abgebrochen'), { code: 'HEALTH_IMPORT_CANCELLED' });
        db.exec('COMMIT');
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    } finally { db.close(); }
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } finally { plaintext?.fill(0); }
}

main().catch((error) => {
  const failure = safeHealthImportFailure(error);
  process.stdout.write(JSON.stringify({ ok: false, error: { code: failure.code } }));
  process.exitCode = 1;
});
