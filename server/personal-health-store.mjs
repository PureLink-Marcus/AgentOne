import { createHash, randomUUID } from 'node:crypto';

const MAX_QUERY_LIMIT = 5_000;
const MAX_EXPORT_RECORDS = 10_000;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
const SOURCE_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function storeError(message, code = 'HEALTH_STORE_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function id(value, field = 'id') {
  const normalized = String(value ?? '').trim();
  if (!ID_PATTERN.test(normalized)) throw storeError(`${field} ist ungültig`);
  return normalized;
}

function source(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!SOURCE_PATTERN.test(normalized)) throw storeError('Gesundheitsquelle ist ungültig');
  return normalized;
}

function iso(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw storeError(`${field} ist kein gültiger Zeitstempel`);
  return date.toISOString();
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function stable(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requireCrypto(callback, name) {
  if (typeof callback !== 'function') throw storeError(`${name}-Callback fehlt`, 'HEALTH_STORE_CRYPTO_REQUIRED', 500);
  return callback;
}

function seal(value, encrypt) {
  const plaintext = stable(value);
  if (Buffer.byteLength(plaintext, 'utf8') > 1_048_576) throw storeError('Gesundheitsdatensatz ist zu groß');
  let envelope;
  try { envelope = requireCrypto(encrypt, 'encrypt')(plaintext); }
  catch { throw storeError('Gesundheitsdatensatz konnte nicht verschlüsselt werden', 'HEALTH_STORE_ENCRYPT_FAILED', 500); }
  if (envelope == null) throw storeError('Verschlüsselung lieferte kein Ergebnis', 'HEALTH_STORE_ENCRYPT_FAILED', 500);
  try { return { encrypted: JSON.stringify({ schema: 'agentone.health-cipher/v1', envelope }), payloadHash: hash(plaintext) }; }
  catch { throw storeError('Verschlüsselungsformat ist ungültig', 'HEALTH_STORE_ENCRYPT_FAILED', 500); }
}

function unseal(value, decrypt) {
  let record;
  try { record = JSON.parse(value); } catch { throw storeError('Gesundheitsdatensatz ist beschädigt', 'HEALTH_STORE_CORRUPT', 500); }
  if (record?.schema !== 'agentone.health-cipher/v1') throw storeError('Unbekanntes Verschlüsselungsformat', 'HEALTH_STORE_CORRUPT', 500);
  let plaintext;
  try { plaintext = requireCrypto(decrypt, 'decrypt')(record.envelope); }
  catch { throw storeError('Gesundheitsdatensatz konnte nicht entschlüsselt werden', 'HEALTH_STORE_DECRYPT_FAILED', 500); }
  try { return JSON.parse(plaintext); } catch { throw storeError('Gesundheitsdatensatz konnte nicht entschlüsselt werden', 'HEALTH_STORE_DECRYPT_FAILED', 500); }
}

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ }
    throw error;
  }
}

export function initPersonalHealthStore(db) {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS personal_health_consents(
      user_id TEXT NOT NULL,id TEXT NOT NULL,status TEXT NOT NULL,
      granted_at TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,
      payload_encrypted TEXT NOT NULL,payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS personal_health_imports(
      user_id TEXT NOT NULL,id TEXT NOT NULL,source TEXT NOT NULL,consent_id TEXT NOT NULL,
      source_hash TEXT NOT NULL,metric_count INTEGER NOT NULL,duplicate_count INTEGER NOT NULL,
      metadata_encrypted TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,id),UNIQUE(user_id,source_hash)
    );
    CREATE TABLE IF NOT EXISTS personal_health_consent_sources(
      user_id TEXT NOT NULL,consent_id TEXT NOT NULL,source_hash TEXT NOT NULL,
      PRIMARY KEY(user_id,consent_id,source_hash),
      FOREIGN KEY(user_id,consent_id) REFERENCES personal_health_consents(user_id,id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS personal_health_metrics(
      user_id TEXT NOT NULL,id TEXT NOT NULL,source TEXT NOT NULL,metric_hash TEXT NOT NULL,
      consent_id TEXT NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,
      payload_encrypted TEXT NOT NULL,payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS personal_health_signals(
      user_id TEXT NOT NULL,id TEXT NOT NULL,kind_hash TEXT NOT NULL,
      payload_encrypted TEXT NOT NULL,payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,id)
    );
    CREATE TABLE IF NOT EXISTS personal_health_signal_metrics(
      user_id TEXT NOT NULL,signal_id TEXT NOT NULL,metric_id TEXT NOT NULL,
      PRIMARY KEY(user_id,signal_id,metric_id),
      FOREIGN KEY(user_id,signal_id) REFERENCES personal_health_signals(user_id,id) ON DELETE CASCADE,
      FOREIGN KEY(user_id,metric_id) REFERENCES personal_health_metrics(user_id,id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS personal_health_metric_query
      ON personal_health_metrics(user_id,source,metric_hash,start_at);
    CREATE INDEX IF NOT EXISTS personal_health_import_query
      ON personal_health_imports(user_id,source,created_at);
    CREATE INDEX IF NOT EXISTS personal_health_signal_dependency
      ON personal_health_signal_metrics(user_id,metric_id);
  `);
}

export function saveHealthConsent(db, { userId, consent, encrypt } = {}) {
  const owner = id(userId, 'userId');
  if (!consent || consent.userId !== owner) throw storeError('Freigabe gehört nicht zu diesem Benutzer', 'HEALTH_STORE_USER_MISMATCH', 403);
  const consentId = id(consent.id, 'consent.id');
  const existing = db.prepare('SELECT status FROM personal_health_consents WHERE user_id=? AND id=?').get(owner, consentId);
  if (existing?.status === 'REVOKED' && !consent.revokedAt) {
    throw storeError('Eine widerrufene Gesundheitsfreigabe kann nicht reaktiviert werden; neue Freigabe erforderlich', 'HEALTH_CONSENT_REVOKED', 409);
  }
  const providers = [...new Set((Array.isArray(consent.providers) ? consent.providers : []).map(source))];
  if (!providers.length) throw storeError('Freigabe benötigt mindestens eine Gesundheitsquelle');
  const grantedAt = iso(consent.grantedAt, 'consent.grantedAt');
  const expiresAt = iso(consent.expiresAt, 'consent.expiresAt', { optional: true });
  const revokedAt = iso(consent.revokedAt, 'consent.revokedAt', { optional: true });
  const now = new Date().toISOString();
  const secured = seal(consent, encrypt);
  transaction(db, () => {
    db.prepare(`INSERT INTO personal_health_consents(
        user_id,id,status,granted_at,expires_at,revoked_at,payload_encrypted,payload_hash,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,id) DO UPDATE SET status=excluded.status,expires_at=excluded.expires_at,
        revoked_at=excluded.revoked_at,payload_encrypted=excluded.payload_encrypted,
        payload_hash=excluded.payload_hash,updated_at=excluded.updated_at`)
      .run(owner, consentId, revokedAt ? 'REVOKED' : 'ACTIVE', grantedAt, expiresAt, revokedAt,
        secured.encrypted, secured.payloadHash, now, now);
    db.prepare('DELETE FROM personal_health_consent_sources WHERE user_id=? AND consent_id=?').run(owner, consentId);
    const addProvider = db.prepare('INSERT INTO personal_health_consent_sources(user_id,consent_id,source_hash) VALUES(?,?,?)');
    for (const provider of providers) addProvider.run(owner, consentId, hash(provider));
  });
  return { id: consentId, status: revokedAt ? 'REVOKED' : 'ACTIVE', grantedAt, expiresAt, revokedAt };
}

export function getHealthConsent(db, { userId, consentId, decrypt } = {}) {
  const owner = id(userId, 'userId'), target = id(consentId, 'consentId');
  const row = db.prepare(`SELECT status,payload_encrypted AS payload FROM personal_health_consents
    WHERE user_id=? AND id=?`).get(owner, target);
  if (!row) throw storeError('Gesundheitsfreigabe nicht gefunden', 'HEALTH_CONSENT_NOT_FOUND', 404);
  return { ...unseal(row.payload, decrypt), status: row.status };
}

export function listHealthConsents(db, { userId, decrypt } = {}) {
  const owner = id(userId, 'userId');
  return db.prepare(`SELECT status,payload_encrypted AS payload FROM personal_health_consents
    WHERE user_id=? ORDER BY granted_at DESC`).all(owner).map((row) => {
    const consent = unseal(row.payload, decrypt);
    return {
      id: consent.id,
      userId: owner,
      providers: Array.isArray(consent.providers) ? consent.providers : [],
      scopes: Array.isArray(consent.scopes) ? consent.scopes : [],
      purpose: String(consent.purpose ?? ''),
      grantedAt: consent.grantedAt,
      expiresAt: consent.expiresAt ?? null,
      revokedAt: consent.revokedAt ?? null,
      status: row.status,
    };
  });
}

export function revokeHealthConsent(db, { userId, consentId, revokedAt = new Date() } = {}) {
  const owner = id(userId, 'userId'), target = id(consentId, 'consentId'), at = iso(revokedAt, 'revokedAt');
  const result = db.prepare(`UPDATE personal_health_consents SET status='REVOKED',revoked_at=?,updated_at=?
    WHERE user_id=? AND id=? AND status<>'REVOKED'`).run(at, at, owner, target);
  if (!result.changes) {
    const exists = db.prepare('SELECT 1 AS found FROM personal_health_consents WHERE user_id=? AND id=?').get(owner, target);
    if (!exists) throw storeError('Gesundheitsfreigabe nicht gefunden', 'HEALTH_CONSENT_NOT_FOUND', 404);
  }
  return { id: target, status: 'REVOKED', revokedAt: at, changed: Boolean(result.changes) };
}

function validateMetric(metric, owner, consentId) {
  if (!metric || metric.sensitivity !== 'health') throw storeError('Nur normalisierte Gesundheitsmetriken sind zulässig');
  if (metric.provenance?.consentId !== consentId) throw storeError('Metrik und Freigabe stimmen nicht überein', 'HEALTH_CONSENT_SCOPE', 403);
  const normalized = {
    ...metric,
    id: id(metric.id, 'metric.id'),
    source: source(metric.source),
    metric: String(metric.metric ?? '').trim().slice(0, 120),
    startAt: iso(metric.startAt, 'metric.startAt'),
    endAt: iso(metric.endAt ?? metric.startAt, 'metric.endAt'),
  };
  if (!normalized.metric || !Number.isFinite(Number(normalized.value))) throw storeError('Metrikname und numerischer Wert sind erforderlich');
  if (metric.provenance?.provider && source(metric.provenance.provider) !== normalized.source) throw storeError('Metrikquelle und Herkunft stimmen nicht überein');
  if (normalized.endAt < normalized.startAt) throw storeError('Metrikende liegt vor dem Beginn');
  return Object.freeze({ ...normalized, userId: owner });
}

function activeConsent(db, owner, consentId, provider, now) {
  const row = db.prepare(`SELECT status,expires_at AS expiresAt FROM personal_health_consents
    WHERE user_id=? AND id=?`).get(owner, consentId);
  if (!row || row.status !== 'ACTIVE' || (row.expiresAt && row.expiresAt <= now)) {
    throw storeError('Aktive Gesundheitsfreigabe fehlt', 'HEALTH_CONSENT_REQUIRED', 403);
  }
  const allowed = db.prepare(`SELECT 1 AS allowed FROM personal_health_consent_sources
    WHERE user_id=? AND consent_id=? AND source_hash=?`).get(owner, consentId, hash(provider));
  if (!allowed) throw storeError('Freigabe umfasst diese Gesundheitsquelle nicht', 'HEALTH_CONSENT_SCOPE', 403);
}

export function storeHealthImport(db, {
  userId, importId = randomUUID(), provider, consentId, sourceHash,
  metrics = [], duplicateCount = 0, metadata = {}, encrypt,
} = {}) {
  const owner = id(userId, 'userId'), targetImportId = id(importId, 'importId');
  const normalizedSource = source(provider), normalizedConsentId = id(consentId, 'consentId');
  if (!/^[a-f0-9]{64}$/i.test(String(sourceHash ?? ''))) throw storeError('sourceHash muss SHA-256 sein');
  if (!Array.isArray(metrics) || metrics.length > 300_000) throw storeError('Ungültige Anzahl Gesundheitsmetriken');
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM personal_health_imports WHERE user_id=? AND source_hash=?').get(owner, String(sourceHash).toLowerCase());
  if (existing) return { id: existing.id, source: normalizedSource, alreadyImported: true, inserted: 0, updated: 0, unchanged: metrics.length };
  activeConsent(db, owner, normalizedConsentId, normalizedSource, now);
  const normalized = metrics.map((metric) => validateMetric(metric, owner, normalizedConsentId));
  if (normalized.some((metric) => metric.source !== normalizedSource)) throw storeError('Importquelle und Metrikquelle stimmen nicht überein');
  const securedMetadata = seal({ ...metadata, schema: 'agentone.health-import/v1' }, encrypt);

  return transaction(db, () => {
    let inserted = 0, updated = 0, unchanged = 0;
    const existingStatement = db.prepare('SELECT payload_hash AS payloadHash FROM personal_health_metrics WHERE user_id=? AND id=?');
    const insertStatement = db.prepare(`INSERT INTO personal_health_metrics(
      user_id,id,source,metric_hash,consent_id,start_at,end_at,payload_encrypted,payload_hash,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,id) DO UPDATE SET source=excluded.source,metric_hash=excluded.metric_hash,
      consent_id=excluded.consent_id,start_at=excluded.start_at,end_at=excluded.end_at,
      payload_encrypted=excluded.payload_encrypted,payload_hash=excluded.payload_hash,updated_at=excluded.updated_at
    WHERE personal_health_metrics.payload_hash<>excluded.payload_hash`);
    for (const metric of normalized) {
      const previous = existingStatement.get(owner, metric.id);
      const secured = seal(metric, encrypt);
      if (previous?.payloadHash === secured.payloadHash) { unchanged += 1; continue; }
      insertStatement.run(owner, metric.id, metric.source, hash(metric.metric), normalizedConsentId,
        metric.startAt, metric.endAt, secured.encrypted, secured.payloadHash, now, now);
      if (previous) updated += 1; else inserted += 1;
    }
    db.prepare(`INSERT INTO personal_health_imports(
      user_id,id,source,consent_id,source_hash,metric_count,duplicate_count,metadata_encrypted,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run(owner, targetImportId, normalizedSource, normalizedConsentId,
      String(sourceHash).toLowerCase(), normalized.length, Number.isFinite(Number(duplicateCount)) ? Math.max(0, Math.trunc(Number(duplicateCount))) : 0, securedMetadata.encrypted, now);
    return { id: targetImportId, source: normalizedSource, alreadyImported: false, inserted, updated, unchanged };
  });
}

export function queryHealthMetrics(db, {
  userId, source: requestedSource, metricNames = [], from, to, limit = 1_000, decrypt,
} = {}) {
  const owner = id(userId, 'userId'), clauses = ['user_id=?'], params = [owner];
  if (requestedSource) { clauses.push('source=?'); params.push(source(requestedSource)); }
  if (!Array.isArray(metricNames)) throw storeError('metricNames muss eine Liste sein');
  const names = [...new Set(metricNames.map((name) => String(name).trim()).filter(Boolean))].slice(0, 100);
  if (names.length) {
    clauses.push(`metric_hash IN (${names.map(() => '?').join(',')})`);
    params.push(...names.map(hash));
  }
  if (from) { clauses.push('end_at>=?'); params.push(iso(from, 'from')); }
  if (to) { clauses.push('start_at<=?'); params.push(iso(to, 'to')); }
  if (from && to && new Date(from) > new Date(to)) throw storeError('Zeitraum ist ungültig');
  const safeLimit = Math.trunc(Math.max(1, Math.min(MAX_QUERY_LIMIT, Number(limit) || 1_000)));
  params.push(safeLimit);
  return db.prepare(`SELECT payload_encrypted AS payload FROM personal_health_metrics
    WHERE ${clauses.join(' AND ')} ORDER BY start_at DESC LIMIT ?`).all(...params)
    .map((row) => unseal(row.payload, decrypt));
}

export function saveDerivedHealthSignal(db, { userId, signal, metricIds = [], encrypt } = {}) {
  const owner = id(userId, 'userId');
  if (!signal || typeof signal !== 'object') throw storeError('Gesundheitssignal fehlt');
  const signalId = id(signal.id, 'signal.id'), kind = String(signal.kind ?? signal.id).trim().slice(0, 120);
  if (!Array.isArray(metricIds) || metricIds.length > 500) throw storeError('Ungültige Anzahl Signalquellen');
  const dependencies = [...new Set(metricIds.map((metricId) => id(metricId, 'metricId')))];
  if (!kind || !dependencies.length) throw storeError('Signaltyp und Metrik-Herkunft sind erforderlich');
  const found = db.prepare(`SELECT id FROM personal_health_metrics WHERE user_id=? AND id IN (${dependencies.map(() => '?').join(',')})`).all(owner, ...dependencies);
  if (found.length !== dependencies.length) throw storeError('Signal darf nur eigene vorhandene Metriken referenzieren', 'HEALTH_STORE_USER_MISMATCH', 403);
  const secured = seal({ ...signal, sensitivity: 'health', metricIds: dependencies }, encrypt), now = new Date().toISOString();
  return transaction(db, () => {
    db.prepare(`INSERT INTO personal_health_signals(user_id,id,kind_hash,payload_encrypted,payload_hash,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET kind_hash=excluded.kind_hash,
      payload_encrypted=excluded.payload_encrypted,payload_hash=excluded.payload_hash,updated_at=excluded.updated_at`)
      .run(owner, signalId, hash(kind), secured.encrypted, secured.payloadHash, now, now);
    db.prepare('DELETE FROM personal_health_signal_metrics WHERE user_id=? AND signal_id=?').run(owner, signalId);
    const link = db.prepare('INSERT INTO personal_health_signal_metrics(user_id,signal_id,metric_id) VALUES(?,?,?)');
    for (const metricId of dependencies) link.run(owner, signalId, metricId);
    return { id: signalId, metricCount: dependencies.length, updatedAt: now };
  });
}

export function exportHealthData(db, { userId, decrypt } = {}) {
  const owner = id(userId, 'userId');
  const counts = {
    metrics: Number(db.prepare('SELECT COUNT(*) AS count FROM personal_health_metrics WHERE user_id=?').get(owner).count),
    signals: Number(db.prepare('SELECT COUNT(*) AS count FROM personal_health_signals WHERE user_id=?').get(owner).count),
    imports: Number(db.prepare('SELECT COUNT(*) AS count FROM personal_health_imports WHERE user_id=?').get(owner).count),
  };
  if (counts.metrics + counts.signals + counts.imports > MAX_EXPORT_RECORDS) throw storeError('Health-Export ist für den direkten Download zu groß; Worker-Export erforderlich', 'HEALTH_EXPORT_TOO_LARGE', 413);
  const metrics = db.prepare('SELECT payload_encrypted AS payload FROM personal_health_metrics WHERE user_id=? ORDER BY start_at').all(owner).map((row) => unseal(row.payload, decrypt));
  const signals = db.prepare('SELECT payload_encrypted AS payload FROM personal_health_signals WHERE user_id=? ORDER BY created_at').all(owner).map((row) => unseal(row.payload, decrypt));
  const imports = db.prepare('SELECT id,source,consent_id AS consentId,source_hash AS sourceHash,metric_count AS metricCount,duplicate_count AS duplicateCount,metadata_encrypted AS metadata,created_at AS createdAt FROM personal_health_imports WHERE user_id=? ORDER BY created_at').all(owner).map((row) => ({ ...row, metadata: unseal(row.metadata, decrypt) }));
  const result = { schema: 'agentone.health-export/v1', userId: owner, exportedAt: new Date().toISOString(), warning: 'SENSITIVE_PLAINTEXT_EXPORT', limits: { maxRecords: MAX_EXPORT_RECORDS, maxBytes: MAX_EXPORT_BYTES }, metrics, signals, imports };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_EXPORT_BYTES) throw storeError('Health-Export ist für den direkten Download zu groß; Worker-Export erforderlich', 'HEALTH_EXPORT_TOO_LARGE', 413);
  return result;
}

export function deleteHealthData(db, { userId, source: requestedSource, from, to, includeConsents = false } = {}) {
  const owner = id(userId, 'userId'), clauses = ['user_id=?'], params = [owner];
  const normalizedSource = requestedSource ? source(requestedSource) : null;
  if (normalizedSource) { clauses.push('source=?'); params.push(normalizedSource); }
  if (from) { clauses.push('end_at>=?'); params.push(iso(from, 'from')); }
  if (to) { clauses.push('start_at<=?'); params.push(iso(to, 'to')); }
  if (from && to && new Date(from) > new Date(to)) throw storeError('Zeitraum ist ungültig');
  if (includeConsents && (normalizedSource || from || to)) throw storeError('Freigaben können nur bei vollständiger Löschung entfernt werden');
  return transaction(db, () => {
    const metrics = db.prepare(`SELECT id FROM personal_health_metrics WHERE ${clauses.join(' AND ')}`).all(...params);
    const metricIds = metrics.map((row) => row.id);
    let signalsDeleted = 0;
    if (metricIds.length) {
      const signalIds = new Set();
      for (let offset = 0; offset < metricIds.length; offset += 500) {
        const chunk = metricIds.slice(offset, offset + 500), placeholders = chunk.map(() => '?').join(',');
        const signals = db.prepare(`SELECT DISTINCT signal_id AS id FROM personal_health_signal_metrics
          WHERE user_id=? AND metric_id IN (${placeholders})`).all(owner, ...chunk);
        for (const signal of signals) signalIds.add(signal.id);
      }
      for (const signalId of signalIds) signalsDeleted += db.prepare('DELETE FROM personal_health_signals WHERE user_id=? AND id=?').run(owner, signalId).changes;
      for (const metricId of metricIds) db.prepare('DELETE FROM personal_health_metrics WHERE user_id=? AND id=?').run(owner, metricId);
    }
    const importsDeleted = !from && !to
      ? (normalizedSource
        ? db.prepare('DELETE FROM personal_health_imports WHERE user_id=? AND source=?').run(owner, normalizedSource).changes
        : db.prepare('DELETE FROM personal_health_imports WHERE user_id=?').run(owner).changes)
      : 0;
    const consentsDeleted = includeConsents
      ? db.prepare('DELETE FROM personal_health_consents WHERE user_id=?').run(owner).changes : 0;
    return { metricsDeleted: metricIds.length, derivedSignalsDeleted: signalsDeleted, importsDeleted, consentsDeleted };
  });
}

export function healthStoreAuditSummary(db, userId) {
  const owner = id(userId, 'userId');
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE user_id=?`).get(owner).total);
  return Object.freeze({
    schema: 'agentone.health-store-audit/v1',
    userId: owner,
    consents: count('personal_health_consents'),
    imports: count('personal_health_imports'),
    metrics: count('personal_health_metrics'),
    derivedSignals: count('personal_health_signals'),
    containsHealthValues: false,
    containsSecrets: false,
  });
}

export const personalHealthStoreInternals = Object.freeze({ hash, stable });
