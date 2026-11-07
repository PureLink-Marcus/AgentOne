const USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;
const ENDPOINT_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_.:-]{0,79}$/;
const AES_GCM_PATTERN = /^AES-(128|192|256)-GCM$/i;
const MAX_EVENT_COUNT = 1_000_000;
const MAX_FEED_URL_BYTES = 16 * 1024;

let savepointSequence = 0;

function storeError(message, code = 'ICS_STORE_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function userId(value) {
  const normalized = String(value ?? '').trim();
  if (!USER_ID_PATTERN.test(normalized)) throw storeError('userId ist ungültig');
  return normalized;
}

function timestamp(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw storeError(`${field} ist kein gültiger Zeitstempel`);
  return date.toISOString();
}

function eventCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > MAX_EVENT_COUNT) {
    throw storeError('eventCount ist ungültig');
  }
  return count;
}

function endpointHash(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!ENDPOINT_HASH_PATTERN.test(normalized)) throw storeError('endpointHash muss SHA-256 sein');
  return normalized;
}

function requireCallback(callback, name) {
  if (typeof callback !== 'function') {
    throw storeError(`${name}-Callback fehlt`, 'ICS_STORE_CRYPTO_REQUIRED', 500);
  }
  return callback;
}

function base64(value, field, expectedBytes) {
  const normalized = String(value ?? '');
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw storeError(`Ungültiges ${field}`, 'ICS_STORE_ENCRYPT_FAILED', 500);
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (!decoded.length || (expectedBytes != null && decoded.length !== expectedBytes)) {
    throw storeError(`Ungültiges ${field}`, 'ICS_STORE_ENCRYPT_FAILED', 500);
  }
  return normalized;
}

function encryptedFeedUrl(value, encrypt) {
  const plaintext = String(value ?? '').trim();
  if (!plaintext || Buffer.byteLength(plaintext, 'utf8') > MAX_FEED_URL_BYTES) {
    throw storeError('Feed-Adresse ist ungültig');
  }

  let encrypted;
  try {
    encrypted = requireCallback(encrypt, 'encrypt')(plaintext);
  } catch (error) {
    if (error?.code === 'ICS_STORE_CRYPTO_REQUIRED') throw error;
    throw storeError('Feed-Zugangsdaten konnten nicht verschlüsselt werden', 'ICS_STORE_ENCRYPT_FAILED', 500);
  }
  if (!encrypted || typeof encrypted !== 'object' || Array.isArray(encrypted)) {
    throw storeError('Ungültiges Verschlüsselungsformat', 'ICS_STORE_ENCRYPT_FAILED', 500);
  }

  const algorithm = String(encrypted.algorithm ?? '').toUpperCase();
  if (!AES_GCM_PATTERN.test(algorithm)) {
    throw storeError('Feed-Zugangsdaten benötigen AES-GCM', 'ICS_STORE_ENCRYPT_FAILED', 500);
  }
  return Object.freeze({
    ciphertext: base64(encrypted.ciphertext, 'ciphertext'),
    iv: base64(encrypted.iv, 'iv', 12),
    tag: base64(encrypted.tag, 'tag', 16),
    algorithm,
  });
}

function atomic(db, operation) {
  const savepoint = `personal_ics_store_${++savepointSequence}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = operation();
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } catch { /* preserve original failure */ }
    throw error;
  }
}

function publicStatus(row) {
  const feedConnected = row?.sourceType === 'FEED' && Boolean(
    row.feedCiphertext && row.feedIv && row.feedTag && row.feedAlgorithm,
  );
  return Object.freeze({
    sourceType: row?.sourceType ?? null,
    endpointHash: row?.endpointHash ?? null,
    eventCount: Number(row?.eventCount ?? 0),
    importedAt: row?.importedAt ?? null,
    lastAttemptAt: row?.lastAttemptAt ?? null,
    lastSuccessAt: row?.lastSuccessAt ?? null,
    failureCount: Number(row?.failureCount ?? 0),
    lastErrorCode: row?.lastErrorCode ?? null,
    nextAttemptAt: row?.nextAttemptAt ?? null,
    feedConnected,
    status: row?.status ?? 'NOT_CONNECTED',
  });
}

function selectState(db, owner) {
  return db.prepare(`SELECT source_type AS sourceType,endpoint_hash AS endpointHash,
    event_count AS eventCount,imported_at AS importedAt,last_attempt_at AS lastAttemptAt,
    last_success_at AS lastSuccessAt,failure_count AS failureCount,last_error_code AS lastErrorCode,
    next_attempt_at AS nextAttemptAt,feed_ciphertext AS feedCiphertext,feed_iv AS feedIv,
    feed_tag AS feedTag,feed_algorithm AS feedAlgorithm,status
    FROM personal_ics_calendar_state WHERE user_id=?`).get(owner);
}

export function initPersonalIcsStore(db) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw storeError('SQLite-Datenbank fehlt', 'ICS_STORE_DATABASE_REQUIRED', 500);
  }
  return atomic(db, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS personal_ics_calendar_state(
      user_id TEXT PRIMARY KEY,
      source_type TEXT,
      endpoint_hash TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT,
      last_attempt_at TEXT,
      last_success_at TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
      feed_ciphertext TEXT,
      feed_iv TEXT,
      feed_tag TEXT,
      feed_algorithm TEXT,
      next_attempt_at TEXT,
      last_error_code TEXT,
      updated_at TEXT NOT NULL
    )`);

    const existing = new Set(db.prepare('PRAGMA table_info(personal_ics_calendar_state)').all().map((column) => column.name));
    const additions = [
      ['source_type', 'source_type TEXT'],
      ['endpoint_hash', 'endpoint_hash TEXT'],
      ['event_count', 'event_count INTEGER NOT NULL DEFAULT 0'],
      ['imported_at', 'imported_at TEXT'],
      ['last_attempt_at', 'last_attempt_at TEXT'],
      ['last_success_at', 'last_success_at TEXT'],
      ['failure_count', 'failure_count INTEGER NOT NULL DEFAULT 0'],
      ['status', "status TEXT NOT NULL DEFAULT 'NOT_CONNECTED'"],
      ['feed_ciphertext', 'feed_ciphertext TEXT'],
      ['feed_iv', 'feed_iv TEXT'],
      ['feed_tag', 'feed_tag TEXT'],
      ['feed_algorithm', 'feed_algorithm TEXT'],
      ['next_attempt_at', 'next_attempt_at TEXT'],
      ['last_error_code', 'last_error_code TEXT'],
      ['updated_at', 'updated_at TEXT'],
    ];
    for (const [name, definition] of additions) {
      if (!existing.has(name)) db.exec(`ALTER TABLE personal_ics_calendar_state ADD COLUMN ${definition}`);
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE personal_ics_calendar_state SET
      event_count=MAX(COALESCE(event_count,0),0),
      failure_count=MAX(COALESCE(failure_count,0),0),
      source_type=CASE
        WHEN source_type IS NOT NULL THEN source_type
        WHEN imported_at IS NOT NULL OR COALESCE(event_count,0)>0 THEN 'UPLOAD'
        ELSE NULL END,
      last_attempt_at=CASE
        WHEN last_attempt_at IS NOT NULL THEN last_attempt_at
        WHEN status<>'NOT_CONNECTED' THEN COALESCE(updated_at,imported_at,?)
        ELSE NULL END,
      last_success_at=COALESCE(last_success_at,imported_at),
      updated_at=COALESCE(updated_at,imported_at,?)`).run(now, now);
    db.exec(`CREATE INDEX IF NOT EXISTS personal_ics_feed_due
      ON personal_ics_calendar_state(source_type,next_attempt_at,last_attempt_at)`);
    return true;
  });
}

export function getPersonalIcsStatus(db, { userId: value } = {}) {
  return publicStatus(selectState(db, userId(value)));
}

export function getPersonalIcsFeedCredential(db, { userId: value, decrypt } = {}) {
  const owner = userId(value);
  const row = db.prepare(`SELECT feed_ciphertext AS ciphertext,feed_iv AS iv,
    feed_tag AS tag,feed_algorithm AS algorithm
    FROM personal_ics_calendar_state WHERE user_id=?`).get(owner);
  if (!row || Object.values(row).every((field) => field == null)) return null;
  if (!row.ciphertext || !row.iv || !row.tag || !row.algorithm || !AES_GCM_PATTERN.test(row.algorithm)) {
    throw storeError('Gespeicherte Feed-Zugangsdaten sind beschädigt', 'ICS_STORE_CORRUPT', 500);
  }
  let plaintext;
  try {
    plaintext = requireCallback(decrypt, 'decrypt')({
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
      algorithm: row.algorithm,
    });
  } catch (error) {
    if (error?.code === 'ICS_STORE_CRYPTO_REQUIRED') throw error;
    throw storeError('Feed-Zugangsdaten konnten nicht entschlüsselt werden', 'ICS_STORE_DECRYPT_FAILED', 500);
  }
  if (typeof plaintext !== 'string' || !plaintext.trim() || Buffer.byteLength(plaintext, 'utf8') > MAX_FEED_URL_BYTES) {
    throw storeError('Feed-Zugangsdaten konnten nicht entschlüsselt werden', 'ICS_STORE_DECRYPT_FAILED', 500);
  }
  return plaintext;
}

export function savePersonalIcsFeedSuccess(db, {
  userId: value,
  feedUrl,
  url,
  endpointHash: hashValue,
  eventCount: countValue,
  importedAt = new Date(),
  lastAttemptAt,
  lastSuccessAt,
  nextAttemptAt,
  encrypt,
} = {}) {
  const owner = userId(value);
  const secured = encryptedFeedUrl(feedUrl ?? url, encrypt);
  const hash = endpointHash(hashValue);
  const count = eventCount(countValue);
  const imported = timestamp(importedAt, 'importedAt');
  const attempted = timestamp(lastAttemptAt ?? imported, 'lastAttemptAt');
  const succeeded = timestamp(lastSuccessAt ?? imported, 'lastSuccessAt');
  const nextAttempt = timestamp(nextAttemptAt, 'nextAttemptAt', { optional: true });
  const updated = attempted;

  return atomic(db, () => {
    db.prepare(`INSERT INTO personal_ics_calendar_state(
      user_id,source_type,endpoint_hash,event_count,imported_at,last_attempt_at,last_success_at,
      failure_count,status,feed_ciphertext,feed_iv,feed_tag,feed_algorithm,next_attempt_at,last_error_code,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      source_type=excluded.source_type,endpoint_hash=excluded.endpoint_hash,event_count=excluded.event_count,
      imported_at=excluded.imported_at,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,
      failure_count=excluded.failure_count,status=excluded.status,feed_ciphertext=excluded.feed_ciphertext,
      feed_iv=excluded.feed_iv,feed_tag=excluded.feed_tag,feed_algorithm=excluded.feed_algorithm,
      next_attempt_at=excluded.next_attempt_at,last_error_code=NULL,updated_at=excluded.updated_at`)
      .run(owner, 'FEED', hash, count, imported, attempted, succeeded, 0, 'LIVE',
        secured.ciphertext, secured.iv, secured.tag, secured.algorithm, nextAttempt, null, updated);
    return publicStatus(selectState(db, owner));
  });
}

export function savePersonalIcsUploadState(db, {
  userId: value,
  eventCount: countValue,
  importedAt = new Date(),
  lastAttemptAt,
} = {}) {
  const owner = userId(value);
  const count = eventCount(countValue);
  const imported = timestamp(importedAt, 'importedAt');
  const attempted = timestamp(lastAttemptAt ?? imported, 'lastAttemptAt');
  return atomic(db, () => {
    db.prepare(`INSERT INTO personal_ics_calendar_state(
      user_id,source_type,endpoint_hash,event_count,imported_at,last_attempt_at,last_success_at,
      failure_count,status,feed_ciphertext,feed_iv,feed_tag,feed_algorithm,next_attempt_at,last_error_code,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      source_type=excluded.source_type,endpoint_hash=NULL,event_count=excluded.event_count,
      imported_at=excluded.imported_at,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,
      failure_count=0,status='LIVE',feed_ciphertext=NULL,feed_iv=NULL,feed_tag=NULL,
      feed_algorithm=NULL,next_attempt_at=NULL,last_error_code=NULL,updated_at=excluded.updated_at`)
      .run(owner, 'UPLOAD', null, count, imported, attempted, imported, 0, 'LIVE',
        null, null, null, null, null, null, attempted);
    return publicStatus(selectState(db, owner));
  });
}

export function recordPersonalIcsFailure(db, {
  userId: value,
  lastAttemptAt,
  attemptedAt,
  errorCode = 'ICS_SYNC_FAILED',
  nextAttemptAt,
} = {}) {
  const owner = userId(value);
  const attempted = timestamp(lastAttemptAt ?? attemptedAt ?? new Date(), 'lastAttemptAt');
  const nextAttempt = timestamp(nextAttemptAt, 'nextAttemptAt', { optional: true });
  const safeErrorCode = ERROR_CODE_PATTERN.test(String(errorCode ?? '')) ? String(errorCode) : 'ICS_SYNC_FAILED';
  return atomic(db, () => {
    const previous = db.prepare(`SELECT event_count AS eventCount,imported_at AS importedAt,
      last_success_at AS lastSuccessAt,feed_ciphertext AS feedCiphertext
      FROM personal_ics_calendar_state WHERE user_id=?`).get(owner);
    const recoverable = Boolean(previous && (
      Number(previous.eventCount) > 0 || previous.importedAt || previous.lastSuccessAt || previous.feedCiphertext
    ));
    const status = recoverable ? 'DEGRADED' : 'ERROR';
    if (!previous) {
      db.prepare(`INSERT INTO personal_ics_calendar_state(
        user_id,source_type,endpoint_hash,event_count,imported_at,last_attempt_at,last_success_at,
        failure_count,status,feed_ciphertext,feed_iv,feed_tag,feed_algorithm,next_attempt_at,last_error_code,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(owner, null, null, 0, null, attempted, null, 1, status,
          null, null, null, null, nextAttempt, safeErrorCode, attempted);
    } else {
      db.prepare(`UPDATE personal_ics_calendar_state SET
        last_attempt_at=?,failure_count=COALESCE(failure_count,0)+1,status=?,
        next_attempt_at=?,last_error_code=?,updated_at=? WHERE user_id=?`)
        .run(attempted, status, nextAttempt, safeErrorCode, attempted, owner);
    }
    return publicStatus(selectState(db, owner));
  });
}

export function removePersonalIcsState(db, { userId: value } = {}) {
  const owner = userId(value);
  const result = db.prepare('DELETE FROM personal_ics_calendar_state WHERE user_id=?').run(owner);
  return Object.freeze({ removed: Boolean(result.changes) });
}

export function listDuePersonalIcsFeedUsers(db, {
  asOf = new Date(),
  limit = 100,
} = {}) {
  const dueAt = timestamp(asOf, 'asOf');
  const safeLimit = Math.trunc(Number(limit));
  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 1_000) {
    throw storeError('limit ist ungültig');
  }
  return db.prepare(`SELECT user_id AS userId,status,last_attempt_at AS lastAttemptAt,
    next_attempt_at AS nextAttemptAt,failure_count AS failureCount
    FROM personal_ics_calendar_state
    WHERE source_type='FEED' AND feed_ciphertext IS NOT NULL
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY COALESCE(next_attempt_at,last_attempt_at,'') ASC,user_id ASC LIMIT ?`)
    .all(dueAt, safeLimit)
    .map((row) => Object.freeze({ ...row, failureCount: Number(row.failureCount ?? 0) }));
}
