import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const HEALTH_IMPORT_JOB_MAX_BYTES = 512 * 1024 * 1024;
export const HEALTH_IMPORT_JOB_STATES = Object.freeze(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);

const ACTIVE_STATES = new Set(['UPLOADING', 'QUEUED', 'RUNNING']);
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTENT_TYPES = new Set(['application/xml', 'text/xml', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
const ERROR_MESSAGES = Object.freeze({
  HEALTH_UPLOAD_EMPTY: 'Apple-Health-Datei fehlt.',
  HEALTH_UPLOAD_TOO_LARGE: 'Apple-Health-Datei überschreitet die zulässige Größe.',
  HEALTH_UPLOAD_SIZE_INVALID: 'Die angegebene Upload-Größe ist ungültig.',
  HEALTH_UPLOAD_TIMEOUT: 'Der Upload hat das Zeitlimit überschritten.',
  HEALTH_UPLOAD_CONTENT_TYPE: 'Nur Apple-Health XML- oder ZIP-Dateien sind zulässig.',
  HEALTH_UPLOAD_PATH_INVALID: 'Der Dateiname ist nicht zulässig.',
  HEALTH_UPLOAD_INTERRUPTED: 'Der Upload wurde unterbrochen und sicher verworfen.',
  HEALTH_IMPORT_SOURCE_MISSING: 'Die verschlüsselte Importquelle ist nicht mehr verfügbar.',
  HEALTH_IMPORT_SOURCE_CORRUPT: 'Die verschlüsselte Importquelle ist beschädigt.',
  HEALTH_IMPORT_WORKER_TIMEOUT: 'Die Verarbeitung hat das Zeitlimit überschritten.',
  HEALTH_IMPORT_WORKER_FAILED: 'Die Apple-Health-Datei konnte nicht verarbeitet werden.',
  HEALTH_IMPORT_CANCELLED: 'Der Import wurde abgebrochen.',
  HEALTH_CONSENT_REQUIRED: 'Eine aktive Gesundheitsfreigabe ist erforderlich.',
  HEALTH_CONSENT_REVOKED: 'Die Gesundheitsfreigabe wurde widerrufen.',
  HEALTH_CONSENT_EXPIRED: 'Die Gesundheitsfreigabe ist abgelaufen.',
  HEALTH_CONSENT_SCOPE: 'Die Gesundheitsfreigabe umfasst diesen Import nicht.',
  HEALTH_INPUT_INVALID: 'Die Apple-Health-Datei enthält keine zulässigen Daten.',
});

function jobError(message, code = 'HEALTH_IMPORT_JOB_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function requiredId(value, field) {
  const normalized = String(value ?? '').trim();
  if (!ID_PATTERN.test(normalized)) throw jobError(`${field} ist ungültig`, 'HEALTH_IMPORT_JOB_INVALID', 400);
  return normalized;
}

function requireMasterSecret(value) {
  const secret = String(value ?? '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw jobError('Health-Import-Verschlüsselung ist nicht konfiguriert', 'HEALTH_IMPORT_ENCRYPTION_NOT_CONFIGURED', 503);
  }
  return secret;
}

function nowIso() { return new Date().toISOString(); }

function normalizeContentType(value, fileName = '') {
  const candidate = String(value ?? '').split(';', 1)[0].trim().toLowerCase() || 'application/octet-stream';
  if (!CONTENT_TYPES.has(candidate)) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_CONTENT_TYPE, 'HEALTH_UPLOAD_CONTENT_TYPE', 415);
  if (candidate === 'application/octet-stream') return /\.zip$/i.test(fileName) ? 'application/zip' : 'application/xml';
  return candidate;
}

export function sanitizeHealthImportFileName(value) {
  const source = String(value ?? '').trim() || 'export.xml';
  if (source.length > 128 || source.includes('\0') || /[\\/]/.test(source) || source === '.' || source === '..' || source.includes('..')) {
    throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_PATH_INVALID, 'HEALTH_UPLOAD_PATH_INVALID', 400);
  }
  const normalized = source.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
  if (!normalized || !/\.(xml|zip)$/i.test(normalized)) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_PATH_INVALID, 'HEALTH_UPLOAD_PATH_INVALID', 400);
  return normalized;
}

function deriveKey(masterSecret, purpose, userId, jobId) {
  return crypto.createHmac('sha256', Buffer.from(requireMasterSecret(masterSecret), 'utf8'))
    .update(`agentone:health-import-job:v1:key:${purpose}:${userId}:${jobId}`, 'utf8').digest();
}

function aadFor(purpose, userId, jobId) {
  return Buffer.from(`agentone:health-import-job:v1:${purpose}:${userId}:${jobId}`, 'utf8');
}

function decodeEnvelopePart(value, expectedLength, code = 'HEALTH_IMPORT_SOURCE_CORRUPT') {
  let output;
  try { output = Buffer.from(String(value ?? ''), 'base64'); } catch { output = Buffer.alloc(0); }
  if (output.length !== expectedLength) throw jobError(ERROR_MESSAGES.HEALTH_IMPORT_SOURCE_CORRUPT, code, 422);
  return output;
}

function validEnvelopePart(value, expectedLength) {
  try { return Buffer.from(String(value ?? ''), 'base64').length === expectedLength; } catch { return false; }
}

function normalizeQuarantineDir(value) {
  if (!value) throw jobError('Quarantäneverzeichnis fehlt', 'HEALTH_IMPORT_QUARANTINE_REQUIRED', 500);
  return path.resolve(String(value));
}

function archivePath(quarantineDir, jobId) {
  const root = normalizeQuarantineDir(quarantineDir), target = path.resolve(root, `${requiredId(jobId, 'jobId')}.a1h`);
  if (path.dirname(target) !== root) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_PATH_INVALID, 'HEALTH_UPLOAD_PATH_INVALID', 400);
  return target;
}

export function healthImportResultPath(quarantineDir, jobId) {
  const root = normalizeQuarantineDir(quarantineDir), target = path.resolve(root, `${requiredId(jobId, 'jobId')}.result.a1h`);
  if (path.dirname(target) !== root) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_PATH_INVALID, 'HEALTH_UPLOAD_PATH_INVALID', 400);
  return target;
}

function storedPathIsExpected(quarantineDir, jobId, storedPath) {
  try { return path.resolve(String(storedPath ?? '')) === archivePath(quarantineDir, jobId); } catch { return false; }
}

function unlinkExpectedSync(quarantineDir, jobId, storedPath) {
  if (!storedPathIsExpected(quarantineDir, jobId, storedPath)) return false;
  try { fs.unlinkSync(storedPath); return true; } catch (error) { if (error?.code !== 'ENOENT') return false; }
  return true;
}

async function unlinkExpected(quarantineDir, jobId, storedPath) {
  if (!storedPathIsExpected(quarantineDir, jobId, storedPath)) return false;
  try { await fs.promises.unlink(storedPath); return true; } catch (error) { return error?.code === 'ENOENT'; }
}

async function writeAll(handle, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, null);
    if (!bytesWritten) throw jobError('Verschlüsselter Upload konnte nicht geschrieben werden', 'HEALTH_IMPORT_WORKER_FAILED', 500);
    offset += bytesWritten;
  }
}

function rowSelect() {
  return `id,user_id AS userId,consent_id AS consentId,media_type AS mediaType,file_name AS fileName,
    state,phase,percent,bytes_received AS bytesReceived,bytes_total AS bytesTotal,source_hash AS sourceHash,
    cipher_path AS cipherPath,cipher_iv AS cipherIv,cipher_tag AS cipherTag,
    command_run_id AS commandRunId,command_step_id AS commandStepId,result_json AS resultJson,
    error_code AS errorCode,error_message AS errorMessage,created_at AS createdAt,updated_at AS updatedAt,
    started_at AS startedAt,completed_at AS completedAt`;
}

function parseResult(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return {
      importId: typeof parsed.importId === 'string' ? parsed.importId : null,
      recordsSeen: Math.max(0, Number(parsed.recordsSeen) || 0),
      metrics: Math.max(0, Number(parsed.metrics) || 0),
      inserted: Math.max(0, Number(parsed.inserted) || 0),
      updated: Math.max(0, Number(parsed.updated) || 0),
      unchanged: Math.max(0, Number(parsed.unchanged) || 0),
      duplicatesRemoved: Math.max(0, Number(parsed.duplicatesRemoved) || 0),
      excludedByConsent: Math.max(0, Number(parsed.excludedByConsent) || 0),
      alreadyImported: Boolean(parsed.alreadyImported),
    };
  } catch { return null; }
}

export function publicHealthImportJob(row) {
  if (!row) return null;
  const state = HEALTH_IMPORT_JOB_STATES.includes(row.state) ? row.state : 'FAILED';
  return Object.freeze({
    id: row.id,
    state,
    mediaType: row.mediaType,
    fileName: row.fileName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    progress: Object.freeze({
      phase: String(row.phase || state),
      percent: Math.max(0, Math.min(100, Number(row.percent) || 0)),
      bytesReceived: Math.max(0, Number(row.bytesReceived) || 0),
      bytesTotal: row.bytesTotal == null ? null : Math.max(0, Number(row.bytesTotal) || 0),
    }),
    result: state === 'COMPLETED' ? parseResult(row.resultJson) : null,
    error: row.errorCode ? Object.freeze({ code: String(row.errorCode), message: String(row.errorMessage || ERROR_MESSAGES[row.errorCode] || 'Import fehlgeschlagen.') }) : null,
    canCancel: state === 'QUEUED' || state === 'RUNNING',
  });
}

export function safeHealthImportFailure(error, fallbackCode = 'HEALTH_IMPORT_WORKER_FAILED') {
  const raw = String(error?.code || fallbackCode).toUpperCase();
  const code = Object.hasOwn(ERROR_MESSAGES, raw) ? raw : fallbackCode;
  return Object.freeze({ code, message: ERROR_MESSAGES[code] || ERROR_MESSAGES[fallbackCode] || 'Import fehlgeschlagen.' });
}

export function initHealthImportJobStore(db, { quarantineDir } = {}) {
  const root = normalizeQuarantineDir(quarantineDir);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_health_import_jobs(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,consent_id TEXT NOT NULL,
      media_type TEXT NOT NULL,file_name TEXT NOT NULL,state TEXT NOT NULL,phase TEXT NOT NULL,
      percent INTEGER NOT NULL DEFAULT 0,bytes_received INTEGER NOT NULL DEFAULT 0,bytes_total INTEGER,
      source_hash TEXT,cipher_path TEXT,cipher_iv TEXT,cipher_tag TEXT,
      command_run_id TEXT,command_step_id TEXT,result_json TEXT,error_code TEXT,error_message TEXT,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,started_at TEXT,completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS personal_health_import_jobs_user_created
      ON personal_health_import_jobs(user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS personal_health_import_jobs_queue
      ON personal_health_import_jobs(state,created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS personal_health_import_jobs_source_active
      ON personal_health_import_jobs(user_id,source_hash)
      WHERE source_hash IS NOT NULL AND state IN ('QUEUED','RUNNING','COMPLETED');
  `);
  const current = nowIso();
  for (const row of db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE state='UPLOADING'`).all()) {
    const removed = unlinkExpectedSync(root, row.id, row.cipherPath);
    db.prepare(`UPDATE personal_health_import_jobs SET state='FAILED',phase='FAILED',error_code=?,error_message=?,cipher_path=CASE WHEN ? THEN NULL ELSE cipher_path END,cipher_iv=CASE WHEN ? THEN NULL ELSE cipher_iv END,cipher_tag=CASE WHEN ? THEN NULL ELSE cipher_tag END,updated_at=?,completed_at=? WHERE id=?`)
      .run('HEALTH_UPLOAD_INTERRUPTED', ERROR_MESSAGES.HEALTH_UPLOAD_INTERRUPTED, removed ? 1 : 0, removed ? 1 : 0, removed ? 1 : 0, current, current, row.id);
  }
  for (const row of db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE state='RUNNING'`).all()) {
    const expectedBytes = Number(row.bytesReceived);
    let intact = storedPathIsExpected(root, row.id, row.cipherPath) && validEnvelopePart(row.cipherIv, 12) && validEnvelopePart(row.cipherTag, 16)
      && Number.isSafeInteger(expectedBytes) && expectedBytes > 0 && expectedBytes <= HEALTH_IMPORT_JOB_MAX_BYTES && /^[a-f0-9]{64}$/i.test(String(row.sourceHash || ''));
    try { const stat = fs.statSync(row.cipherPath); intact = intact && stat.isFile() && stat.size === expectedBytes; } catch { intact = false; }
    if (intact) db.prepare(`UPDATE personal_health_import_jobs SET state='QUEUED',phase='QUEUED',percent=MAX(10,percent),started_at=NULL,updated_at=? WHERE id=?`).run(current, row.id);
    else {
      const removed = unlinkExpectedSync(root, row.id, row.cipherPath);
      db.prepare(`UPDATE personal_health_import_jobs SET state='FAILED',phase='FAILED',error_code=?,error_message=?,cipher_path=CASE WHEN ? THEN NULL ELSE cipher_path END,cipher_iv=CASE WHEN ? THEN NULL ELSE cipher_iv END,cipher_tag=CASE WHEN ? THEN NULL ELSE cipher_tag END,updated_at=?,completed_at=? WHERE id=?`)
        .run('HEALTH_IMPORT_SOURCE_MISSING', ERROR_MESSAGES.HEALTH_IMPORT_SOURCE_MISSING, removed ? 1 : 0, removed ? 1 : 0, removed ? 1 : 0, current, current, row.id);
    }
  }
  for (const row of db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE state IN ('COMPLETED','FAILED','CANCELLED') AND cipher_path IS NOT NULL`).all()) {
    if (unlinkExpectedSync(root, row.id, row.cipherPath)) {
      if (row.errorCode === 'HEALTH_IMPORT_DUPLICATE') db.prepare('DELETE FROM personal_health_import_jobs WHERE id=?').run(row.id);
      else db.prepare('UPDATE personal_health_import_jobs SET cipher_path=NULL,cipher_iv=NULL,cipher_tag=NULL WHERE id=?').run(row.id);
    }
  }
  return { quarantineDir: root };
}

export function listHealthImportJobs(db, { userId, limit = 50 } = {}) {
  const owner = requiredId(userId, 'userId'), safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 50)));
  return db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT ?`).all(owner, safeLimit).map(publicHealthImportJob);
}

export function getHealthImportJob(db, { userId, jobId } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId');
  const row = db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE user_id=? AND id=?`).get(owner, id);
  if (!row) throw jobError('Importjob nicht gefunden', 'HEALTH_IMPORT_JOB_NOT_FOUND', 404);
  return publicHealthImportJob(row);
}

export function getHealthImportJobInternal(db, { jobId } = {}) {
  const id = requiredId(jobId, 'jobId'), row = db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE id=?`).get(id);
  if (!row) throw jobError('Importjob nicht gefunden', 'HEALTH_IMPORT_JOB_NOT_FOUND', 404);
  return row;
}

export async function receiveHealthImportJob(req, {
  db, userId, consentId, fileName, contentType, contentLength,
  quarantineDir, masterSecret, maxBytes = HEALTH_IMPORT_JOB_MAX_BYTES,
  uploadTimeoutMs = 15 * 60_000,
} = {}) {
  const owner = requiredId(userId, 'userId'), consent = requiredId(consentId, 'consentId');
  const safeName = sanitizeHealthImportFileName(fileName), mediaType = normalizeContentType(contentType, safeName);
  const declared = contentLength == null || contentLength === '' ? null : Number(contentLength);
  if (declared != null && (!/^\d+$/.test(String(contentLength)) || declared <= 0)) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_SIZE_INVALID, 'HEALTH_UPLOAD_SIZE_INVALID', 400);
  if (declared != null && declared > maxBytes) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_TOO_LARGE, 'HEALTH_UPLOAD_TOO_LARGE', 413);
  requireMasterSecret(masterSecret);
  const root = normalizeQuarantineDir(quarantineDir), jobId = crypto.randomUUID(), target = archivePath(root, jobId);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const createdAt = nowIso();
  db.prepare(`INSERT INTO personal_health_import_jobs(
    id,user_id,consent_id,media_type,file_name,state,phase,percent,bytes_received,bytes_total,cipher_path,created_at,updated_at
  ) VALUES(?,?,?,?,?,'UPLOADING','UPLOADING',0,0,?,?,?,?)`).run(jobId, owner, consent, mediaType, safeName, declared, target, createdAt, createdAt);

  const iv = crypto.randomBytes(12), key = deriveKey(masterSecret, 'archive', owner, jobId), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadFor('archive', owner, jobId));
  const hash = crypto.createHash('sha256');
  let handle, received = 0, lastCheckpoint = 0, timeout;
  const destroyOnTimeout = () => req.destroy(jobError(ERROR_MESSAGES.HEALTH_UPLOAD_TIMEOUT, 'HEALTH_UPLOAD_TIMEOUT', 408));
  try {
    handle = await fs.promises.open(target, 'wx', 0o600);
    timeout = setTimeout(destroyOnTimeout, Math.max(1_000, Number(uploadTimeoutMs) || 15 * 60_000));
    timeout.unref?.();
    for await (const part of req) {
      const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
      received += chunk.length;
      if (received > maxBytes) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_TOO_LARGE, 'HEALTH_UPLOAD_TOO_LARGE', 413);
      hash.update(chunk);
      const encrypted = cipher.update(chunk);
      if (encrypted.length) await writeAll(handle, encrypted);
      if (received - lastCheckpoint >= 4 * 1024 * 1024) {
        const percent = declared ? Math.min(8, Math.max(1, Math.floor(received / declared * 8))) : 1;
        db.prepare('UPDATE personal_health_import_jobs SET bytes_received=?,percent=?,updated_at=? WHERE id=? AND state=\'UPLOADING\'').run(received, percent, nowIso(), jobId);
        lastCheckpoint = received;
      }
    }
    if (!received) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_EMPTY, 'HEALTH_UPLOAD_EMPTY', 400);
    if (declared != null && received !== declared) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_SIZE_INVALID, 'HEALTH_UPLOAD_SIZE_INVALID', 400);
    const final = cipher.final();
    if (final.length) await writeAll(handle, final);
    await handle.sync();
    await handle.close(); handle = null;
    const tag = cipher.getAuthTag().toString('base64'), sourceHash = hash.digest('hex'), queuedAt = nowIso();
    let existing;
    db.exec('BEGIN IMMEDIATE');
    try {
      existing = db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs
        WHERE user_id=? AND source_hash=? AND state IN ('QUEUED','RUNNING','COMPLETED') ORDER BY created_at LIMIT 1`).get(owner, sourceHash);
      if (existing) {
        db.prepare(`UPDATE personal_health_import_jobs SET state='CANCELLED',phase='CANCELLED',bytes_received=?,bytes_total=COALESCE(bytes_total,?),source_hash=?,error_code=?,error_message=?,updated_at=?,completed_at=? WHERE id=?`)
          .run(received, received, sourceHash, 'HEALTH_IMPORT_DUPLICATE', 'Dieser identische Importjob existiert bereits.', queuedAt, queuedAt, jobId);
      } else {
        db.prepare(`UPDATE personal_health_import_jobs SET state='QUEUED',phase='QUEUED',percent=10,bytes_received=?,bytes_total=COALESCE(bytes_total,?),source_hash=?,cipher_iv=?,cipher_tag=?,updated_at=? WHERE id=?`)
          .run(received, received, sourceHash, iv.toString('base64'), tag, queuedAt, jobId);
      }
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    if (existing) {
      const removed = await unlinkExpected(root, jobId, target);
      if (removed) db.prepare('DELETE FROM personal_health_import_jobs WHERE id=?').run(jobId);
      return { created: false, job: publicHealthImportJob(existing) };
    }
    return { created: true, job: getHealthImportJob(db, { userId: owner, jobId }) };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    const removed = await unlinkExpected(root, jobId, target);
    const failure = safeHealthImportFailure(error, error?.code === 'HEALTH_UPLOAD_TOO_LARGE' ? 'HEALTH_UPLOAD_TOO_LARGE' : 'HEALTH_IMPORT_WORKER_FAILED'), completedAt = nowIso();
    db.prepare(`UPDATE personal_health_import_jobs SET state='FAILED',phase='FAILED',bytes_received=?,error_code=?,error_message=?,cipher_path=CASE WHEN ? THEN NULL ELSE cipher_path END,cipher_iv=CASE WHEN ? THEN NULL ELSE cipher_iv END,cipher_tag=CASE WHEN ? THEN NULL ELSE cipher_tag END,updated_at=?,completed_at=? WHERE id=?`)
      .run(received, failure.code, failure.message, removed ? 1 : 0, removed ? 1 : 0, removed ? 1 : 0, completedAt, completedAt, jobId);
    throw Object.assign(error instanceof Error ? error : new Error(failure.message), { code: failure.code, status: Number(error?.status) || 400 });
  } finally {
    if (timeout) clearTimeout(timeout);
    key.fill(0);
  }
}

export function attachHealthImportCommand(db, { userId, jobId, runId, stepId } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId');
  const result = db.prepare(`UPDATE personal_health_import_jobs SET command_run_id=?,command_step_id=?,updated_at=? WHERE user_id=? AND id=? AND state='QUEUED'`)
    .run(requiredId(runId, 'runId'), requiredId(stepId, 'stepId'), nowIso(), owner, id);
  if (!result.changes) throw jobError('Importjob ist nicht mehr wartend', 'HEALTH_IMPORT_JOB_STATE', 409);
  return getHealthImportJob(db, { userId: owner, jobId: id });
}

export function claimNextHealthImportJob(db) {
  const candidate = db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE state='QUEUED' AND command_run_id IS NOT NULL ORDER BY created_at LIMIT 1`).get();
  if (!candidate) return null;
  const at = nowIso(), result = db.prepare(`UPDATE personal_health_import_jobs SET state='RUNNING',phase='DECRYPTING',percent=15,started_at=?,updated_at=? WHERE id=? AND state='QUEUED'`).run(at, at, candidate.id);
  return result.changes ? getHealthImportJobInternal(db, { jobId: candidate.id }) : null;
}

export function updateHealthImportJobProgress(db, { jobId, phase, percent } = {}) {
  const id = requiredId(jobId, 'jobId'), safePhase = String(phase ?? 'PROCESSING').replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 32) || 'PROCESSING';
  db.prepare(`UPDATE personal_health_import_jobs SET phase=?,percent=MAX(percent,?),updated_at=? WHERE id=? AND state='RUNNING'`)
    .run(safePhase, Math.max(15, Math.min(99, Math.trunc(Number(percent) || 15))), nowIso(), id);
  return getHealthImportJobInternal(db, { jobId: id });
}

export async function completeHealthImportJob(db, { jobId, result, quarantineDir } = {}) {
  const row = getHealthImportJobInternal(db, { jobId }), at = nowIso();
  if (!['RUNNING', 'COMPLETED'].includes(row.state)) throw jobError('Importjob ist nicht aktiv', 'HEALTH_IMPORT_JOB_STATE', 409);
  if (row.state === 'RUNNING') {
    const safeResult = parseResult(JSON.stringify(result || {})) || {};
    db.prepare(`UPDATE personal_health_import_jobs SET state='COMPLETED',phase='COMPLETED',percent=100,result_json=?,error_code=NULL,error_message=NULL,updated_at=?,completed_at=? WHERE id=? AND state='RUNNING'`)
      .run(JSON.stringify(safeResult), at, at, row.id);
  }
  if (await unlinkExpected(quarantineDir, row.id, row.cipherPath)) db.prepare('UPDATE personal_health_import_jobs SET cipher_path=NULL,cipher_iv=NULL,cipher_tag=NULL WHERE id=?').run(row.id);
  return getHealthImportJob(db, { userId: row.userId, jobId: row.id });
}

export async function failHealthImportJob(db, { jobId, error, quarantineDir } = {}) {
  const row = getHealthImportJobInternal(db, { jobId });
  if (TERMINAL_STATES.has(row.state)) return publicHealthImportJob(row);
  const failure = safeHealthImportFailure(error), at = nowIso();
  db.prepare(`UPDATE personal_health_import_jobs SET state='FAILED',phase='FAILED',error_code=?,error_message=?,updated_at=?,completed_at=? WHERE id=? AND state IN ('UPLOADING','QUEUED','RUNNING')`)
    .run(failure.code, failure.message, at, at, row.id);
  if (await unlinkExpected(quarantineDir, row.id, row.cipherPath)) db.prepare('UPDATE personal_health_import_jobs SET cipher_path=NULL,cipher_iv=NULL,cipher_tag=NULL WHERE id=?').run(row.id);
  return getHealthImportJob(db, { userId: row.userId, jobId: row.id });
}

export async function cancelHealthImportJob(db, { userId, jobId, quarantineDir } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId');
  const row = db.prepare(`SELECT ${rowSelect()} FROM personal_health_import_jobs WHERE user_id=? AND id=?`).get(owner, id);
  if (!row) throw jobError('Importjob nicht gefunden', 'HEALTH_IMPORT_JOB_NOT_FOUND', 404);
  if (!TERMINAL_STATES.has(row.state)) {
    const at = nowIso();
    db.prepare(`UPDATE personal_health_import_jobs SET state='CANCELLED',phase='CANCELLED',error_code='HEALTH_IMPORT_CANCELLED',error_message=?,updated_at=?,completed_at=? WHERE user_id=? AND id=? AND state IN ('UPLOADING','QUEUED','RUNNING')`)
      .run(ERROR_MESSAGES.HEALTH_IMPORT_CANCELLED, at, at, owner, id);
    if (await unlinkExpected(quarantineDir, id, row.cipherPath)) db.prepare('UPDATE personal_health_import_jobs SET cipher_path=NULL,cipher_iv=NULL,cipher_tag=NULL WHERE id=?').run(id);
  }
  return getHealthImportJob(db, { userId: owner, jobId: id });
}

export async function decryptHealthImportArchive({ inputPath, masterSecret, userId, jobId, iv, tag, maxBytes = HEALTH_IMPORT_JOB_MAX_BYTES } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId');
  const stat = await fs.promises.stat(inputPath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0 || stat.size > maxBytes) throw jobError(ERROR_MESSAGES.HEALTH_IMPORT_SOURCE_MISSING, 'HEALTH_IMPORT_SOURCE_MISSING', 422);
  const key = deriveKey(masterSecret, 'archive', owner, id), decipher = crypto.createDecipheriv('aes-256-gcm', key, decodeEnvelopePart(iv, 12));
  decipher.setAAD(aadFor('archive', owner, id));
  decipher.setAuthTag(decodeEnvelopePart(tag, 16));
  const chunks = []; let total = 0;
  try {
    for await (const chunk of fs.createReadStream(inputPath, { highWaterMark: 1024 * 1024 })) {
      const plain = decipher.update(chunk); total += plain.length;
      if (total > maxBytes) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_TOO_LARGE, 'HEALTH_UPLOAD_TOO_LARGE', 413);
      if (plain.length) chunks.push(plain);
    }
    const final = decipher.final(); total += final.length;
    if (total > maxBytes) throw jobError(ERROR_MESSAGES.HEALTH_UPLOAD_TOO_LARGE, 'HEALTH_UPLOAD_TOO_LARGE', 413);
    if (final.length) chunks.push(final);
    return Buffer.concat(chunks, total);
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0);
    if (error?.code) throw error;
    throw jobError(ERROR_MESSAGES.HEALTH_IMPORT_SOURCE_CORRUPT, 'HEALTH_IMPORT_SOURCE_CORRUPT', 422);
  } finally { key.fill(0); }
}

export async function writeEncryptedHealthImportResult({ outputPath, masterSecret, userId, jobId, value } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId'), key = deriveKey(masterSecret, 'result', owner, id);
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aadFor('result', owner, id));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  try {
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    await fs.promises.writeFile(outputPath, encrypted, { flag: 'wx', mode: 0o600 });
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), bytes: encrypted.length };
  } finally { plaintext.fill(0); key.fill(0); }
}

export async function readEncryptedHealthImportResult({ inputPath, masterSecret, userId, jobId, iv, tag, maxBytes = 768 * 1024 * 1024 } = {}) {
  const owner = requiredId(userId, 'userId'), id = requiredId(jobId, 'jobId'), stat = await fs.promises.stat(inputPath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0 || stat.size > maxBytes) throw jobError('Worker-Ergebnis fehlt', 'HEALTH_IMPORT_WORKER_FAILED', 500);
  const key = deriveKey(masterSecret, 'result', owner, id), decipher = crypto.createDecipheriv('aes-256-gcm', key, decodeEnvelopePart(iv, 12));
  decipher.setAAD(aadFor('result', owner, id)); decipher.setAuthTag(decodeEnvelopePart(tag, 16));
  let encrypted, plaintext;
  try {
    encrypted = await fs.promises.readFile(inputPath);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw jobError('Worker-Ergebnis ist beschädigt', 'HEALTH_IMPORT_WORKER_FAILED', 500);
    if (error?.code) throw error;
    throw jobError('Worker-Ergebnis ist beschädigt', 'HEALTH_IMPORT_WORKER_FAILED', 500);
  } finally { encrypted?.fill(0); plaintext?.fill(0); key.fill(0); }
}

export const healthImportJobInternals = Object.freeze({ deriveKey, aadFor, archivePath, ERROR_MESSAGES, ACTIVE_STATES, TERMINAL_STATES });
