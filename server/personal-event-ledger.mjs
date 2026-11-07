import { createHash, randomUUID } from 'node:crypto';

const MAX_QUERY_LIMIT = 5_000;
const MAX_EXPORT_RECORDS = 10_000;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
const MAX_SUMMARY_BYTES = 2_048;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_PROVENANCE_BYTES = 8 * 1024;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const NAME_PATTERN = /^[a-z][a-z0-9_.-]{1,79}$/;
const FORBIDDEN_KEY = /^(?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|passwd|secret|cookie|set-cookie|raw|raw[_-]?body|body|html|html[_-]?body|text[_-]?body|mime|rfc822)$/i;

function ledgerError(message, code = 'EVENT_LEDGER_INVALID', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function text(value, field, maxBytes, { optional = false } = {}) {
  const normalized = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!normalized && optional) return null;
  if (!normalized) throw ledgerError(`${field} fehlt`);
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) throw ledgerError(`${field} ist zu groß`);
  return normalized;
}

function identifier(value, field, { optional = false } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized && optional) return null;
  if (!ID_PATTERN.test(normalized)) throw ledgerError(`${field} ist ungültig`);
  return normalized;
}

function name(value, field) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!NAME_PATTERN.test(normalized)) throw ledgerError(`${field} ist ungültig`);
  return normalized;
}

function timestamp(value, field, { optional = false } = {}) {
  if (optional && (value == null || value === '')) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw ledgerError(`${field} ist kein gültiger Zeitstempel`);
  return date.toISOString();
}

function stable(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }

function minimalObject(value, field, maxBytes, depth = 0) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw ledgerError(`${field} muss ein Objekt sein`);
  if (depth > 8) throw ledgerError(`${field} ist zu tief verschachtelt`);
  const clean = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = text(rawKey, `${field}.key`, 128);
    if (FORBIDDEN_KEY.test(key)) throw ledgerError(`${field}.${key} ist im minimierten Ledger nicht zulässig`, 'EVENT_LEDGER_SENSITIVE_FIELD', 400);
    if (rawValue == null || typeof rawValue === 'boolean') clean[key] = rawValue;
    else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) throw ledgerError(`${field}.${key} ist keine endliche Zahl`);
      clean[key] = rawValue;
    } else if (typeof rawValue === 'string') clean[key] = text(rawValue, `${field}.${key}`, 2_048, { optional: true });
    else if (Array.isArray(rawValue)) {
      if (rawValue.length > 200) throw ledgerError(`${field}.${key} enthält zu viele Werte`);
      clean[key] = rawValue.map((item, index) => {
        if (item == null || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'string') return text(item, `${field}.${key}[${index}]`, 1_024, { optional: true });
        if (item && typeof item === 'object' && !Array.isArray(item)) return minimalObject(item, `${field}.${key}[${index}]`, maxBytes, depth + 1);
        throw ledgerError(`${field}.${key}[${index}] ist nicht zulässig`);
      });
    } else if (typeof rawValue === 'object') clean[key] = minimalObject(rawValue, `${field}.${key}`, maxBytes, depth + 1);
    else throw ledgerError(`${field}.${key} ist nicht zulässig`);
  }
  if (Buffer.byteLength(stable(clean), 'utf8') > maxBytes) throw ledgerError(`${field} ist zu groß`);
  return clean;
}

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve the original error */ } throw error; }
}

function normalizeEvent(owner, event, ingestedAt) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw ledgerError('Ereignis muss ein Objekt sein');
  if (event.userId != null && identifier(event.userId, 'event.userId') !== owner) throw ledgerError('Ereignis gehört nicht zu diesem Benutzer', 'EVENT_LEDGER_USER_MISMATCH', 403);
  const source = name(event.source, 'event.source');
  const sourceAccount = identifier(event.sourceAccount ?? 'default', 'event.sourceAccount');
  const sourceEventId = identifier(event.sourceEventId ?? event.externalId, 'event.sourceEventId', { optional: true });
  const occurredAt = timestamp(event.occurredAt ?? event.startAt, 'event.occurredAt');
  const type = name(event.type ?? event.kind, 'event.type');
  const summary = text(event.summary ?? event.title, 'event.summary', MAX_SUMMARY_BYTES, { optional: true }) ?? '';
  const structuredPayload = minimalObject(event.structuredPayload ?? event.payload ?? event.metrics, 'event.structuredPayload', MAX_PAYLOAD_BYTES);
  const provenance = minimalObject(event.provenance, 'event.provenance', MAX_PROVENANCE_BYTES);
  const sensitivity = name(event.sensitivity ?? 'personal', 'event.sensitivity');
  const consentId = identifier(event.consentId ?? event.provenance?.consentId, 'event.consentId', { optional: true });
  const confidence = event.confidence == null ? 1 : Number(event.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw ledgerError('event.confidence muss zwischen 0 und 1 liegen');
  const identity = sourceEventId ? `${source}|${sourceAccount}|${sourceEventId}` : stable({ source, sourceAccount, occurredAt, type, summary, structuredPayload });
  const dedupeKey = event.dedupeKey == null ? hash(identity) : identifier(event.dedupeKey, 'event.dedupeKey');
  const eventId = identifier(event.eventId ?? event.id ?? randomUUID(), 'event.eventId');
  const normalized = { eventId, userId: owner, source, sourceAccount, sourceEventId, occurredAt, ingestedAt, type, summary, structuredPayload, provenance, sensitivity, consentId, confidence, dedupeKey };
  const logicalContent = { userId: owner, source, sourceAccount, sourceEventId, occurredAt, type, summary, structuredPayload, provenance, sensitivity, consentId, confidence };
  return { ...normalized, contentHash: hash(stable(logicalContent)) };
}

function rowToEvent(row) {
  return {
    eventId: row.eventId, userId: row.userId, source: row.source, sourceAccount: row.sourceAccount,
    sourceEventId: row.sourceEventId, occurredAt: row.occurredAt, ingestedAt: row.ingestedAt,
    type: row.type, summary: row.summary, structuredPayload: JSON.parse(row.structuredPayload),
    provenance: JSON.parse(row.provenance), sensitivity: row.sensitivity, consentId: row.consentId,
    confidence: Number(row.confidence), dedupeKey: row.dedupeKey,
  };
}

export function initPersonalEventLedger(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_event_ledger(
      user_id TEXT NOT NULL,event_id TEXT NOT NULL,source TEXT NOT NULL,source_account TEXT NOT NULL,
      source_event_id TEXT,occurred_at TEXT NOT NULL,ingested_at TEXT NOT NULL,type TEXT NOT NULL,
      summary TEXT NOT NULL,structured_payload TEXT NOT NULL,provenance TEXT NOT NULL,
      sensitivity TEXT NOT NULL,consent_id TEXT,confidence REAL NOT NULL,dedupe_key TEXT NOT NULL,
      content_hash TEXT NOT NULL,PRIMARY KEY(user_id,event_id),UNIQUE(user_id,dedupe_key)
    );
    CREATE INDEX IF NOT EXISTS personal_event_ledger_timeline ON personal_event_ledger(user_id,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS personal_event_ledger_source ON personal_event_ledger(user_id,source,occurred_at DESC);
    CREATE INDEX IF NOT EXISTS personal_event_ledger_type ON personal_event_ledger(user_id,type,occurred_at DESC);
  `);
}

function writeNormalizedEvents(db, owner, normalized) {
    const byDedupe = db.prepare('SELECT event_id AS eventId,content_hash AS contentHash FROM personal_event_ledger WHERE user_id=? AND dedupe_key=?');
    const byId = db.prepare('SELECT dedupe_key AS dedupeKey,content_hash AS contentHash FROM personal_event_ledger WHERE user_id=? AND event_id=?');
    const insert = db.prepare(`INSERT INTO personal_event_ledger(user_id,event_id,source,source_account,source_event_id,occurred_at,ingested_at,type,summary,structured_payload,provenance,sensitivity,consent_id,confidence,dedupe_key,content_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let inserted = 0, unchanged = 0, conflicts = 0;
    const conflictKeys = [];
    for (const event of normalized) {
      const existing = byDedupe.get(owner, event.dedupeKey) ?? byId.get(owner, event.eventId);
      if (existing) {
        if (existing.contentHash === event.contentHash) unchanged += 1;
        else { conflicts += 1; conflictKeys.push(event.dedupeKey); }
        continue;
      }
      insert.run(owner, event.eventId, event.source, event.sourceAccount, event.sourceEventId, event.occurredAt,
        event.ingestedAt, event.type, event.summary, stable(event.structuredPayload), stable(event.provenance),
        event.sensitivity, event.consentId, event.confidence, event.dedupeKey, event.contentHash);
      inserted += 1;
    }
    return { inserted, unchanged, conflicts, conflictKeys: conflictKeys.slice(0, 100), accepted: normalized.length };
}

export function appendPersonalEvents(db, { userId, events = [], ingestedAt = new Date() } = {}) {
  const owner = identifier(userId, 'userId');
  if (!Array.isArray(events) || events.length > 25_000) throw ledgerError('events muss eine Liste mit höchstens 25.000 Einträgen sein');
  const at = timestamp(ingestedAt, 'ingestedAt');
  const normalized = events.map((event) => normalizeEvent(owner, event, at));
  return transaction(db, () => writeNormalizedEvents(db, owner, normalized));
}

export function replacePersonalEvents(db, { userId, source, events = [], ingestedAt = new Date() } = {}, { onReplaced } = {}) {
  const owner = identifier(userId, 'userId'), normalizedSource = name(source, 'source');
  if (!Array.isArray(events) || events.length > 25_000) throw ledgerError('events muss eine Liste mit höchstens 25.000 Einträgen sein');
  const at = timestamp(ingestedAt, 'ingestedAt'), normalized = events.map((event) => normalizeEvent(owner, event, at));
  if (normalized.some((event) => event.source !== normalizedSource)) throw ledgerError('Alle Ersatzereignisse müssen zur gewählten Quelle gehören');
  return transaction(db, () => {
    const deleted = Number(db.prepare('DELETE FROM personal_event_ledger WHERE user_id=? AND source=?').run(owner, normalizedSource).changes);
    const result = { deleted, ...writeNormalizedEvents(db, owner, normalized) };
    if (onReplaced) onReplaced(result);
    return result;
  });
}

export function queryPersonalEvents(db, { userId, source, type, from, to, limit = 1_000 } = {}) {
  const owner = identifier(userId, 'userId'), clauses = ['user_id=?'], params = [owner];
  if (source) { clauses.push('source=?'); params.push(name(source, 'source')); }
  if (type) { clauses.push('type=?'); params.push(name(type, 'type')); }
  const fromAt = timestamp(from, 'from', { optional: true }), toAt = timestamp(to, 'to', { optional: true });
  if (fromAt) { clauses.push('occurred_at>=?'); params.push(fromAt); }
  if (toAt) { clauses.push('occurred_at<=?'); params.push(toAt); }
  if (fromAt && toAt && fromAt > toAt) throw ledgerError('Zeitraum ist ungültig');
  const safeLimit = Math.trunc(Math.max(1, Math.min(MAX_QUERY_LIMIT, Number(limit) || 1_000)));
  params.push(safeLimit);
  return db.prepare(`SELECT user_id AS userId,event_id AS eventId,source,source_account AS sourceAccount,
    source_event_id AS sourceEventId,occurred_at AS occurredAt,ingested_at AS ingestedAt,type,summary,
    structured_payload AS structuredPayload,provenance,sensitivity,consent_id AS consentId,confidence,
    dedupe_key AS dedupeKey FROM personal_event_ledger WHERE ${clauses.join(' AND ')}
    ORDER BY occurred_at DESC,event_id LIMIT ?`).all(...params).map(rowToEvent);
}

export function exportPersonalEvents(db, { userId, source } = {}) {
  const owner = identifier(userId, 'userId'), normalizedSource = source ? name(source, 'source') : null;
  const where = normalizedSource ? 'user_id=? AND source=?' : 'user_id=?', params = normalizedSource ? [owner, normalizedSource] : [owner];
  const count = Number(db.prepare(`SELECT COUNT(*) AS count FROM personal_event_ledger WHERE ${where}`).get(...params).count);
  if (count > MAX_EXPORT_RECORDS) throw ledgerError('Ledger-Export ist für den direkten Download zu groß; Worker-Export erforderlich', 'EVENT_LEDGER_EXPORT_TOO_LARGE', 413);
  const events = db.prepare(`SELECT user_id AS userId,event_id AS eventId,source,source_account AS sourceAccount,
    source_event_id AS sourceEventId,occurred_at AS occurredAt,ingested_at AS ingestedAt,type,summary,
    structured_payload AS structuredPayload,provenance,sensitivity,consent_id AS consentId,confidence,
    dedupe_key AS dedupeKey FROM personal_event_ledger WHERE ${where} ORDER BY occurred_at,event_id`).all(...params).map(rowToEvent);
  const result = { schema: 'agentone.personal-event-export/v1', userId: owner, source: normalizedSource, exportedAt: new Date().toISOString(), warning: 'PERSONAL_PLAINTEXT_EXPORT', events };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_EXPORT_BYTES) throw ledgerError('Ledger-Export ist für den direkten Download zu groß; Worker-Export erforderlich', 'EVENT_LEDGER_EXPORT_TOO_LARGE', 413);
  return result;
}

export function deletePersonalEvents(db, { userId, source, confirmAll = false } = {}) {
  const owner = identifier(userId, 'userId'), normalizedSource = source ? name(source, 'source') : null;
  if (!normalizedSource && confirmAll !== true) throw ledgerError('Vollständige Löschung benötigt confirmAll=true', 'EVENT_LEDGER_CONFIRM_REQUIRED', 400);
  const result = normalizedSource
    ? db.prepare('DELETE FROM personal_event_ledger WHERE user_id=? AND source=?').run(owner, normalizedSource)
    : db.prepare('DELETE FROM personal_event_ledger WHERE user_id=?').run(owner);
  return { userId: owner, source: normalizedSource, deleted: Number(result.changes) };
}

export function applyPersonalEventRetention(db, { userId, before } = {}) {
  const owner = identifier(userId, 'userId'), cutoff = timestamp(before, 'before');
  const result = db.prepare('DELETE FROM personal_event_ledger WHERE user_id=? AND occurred_at<?').run(owner, cutoff);
  return { userId: owner, before: cutoff, deleted: Number(result.changes) };
}

export function personalEventLedgerAuditSummary(db, userId) {
  const owner = identifier(userId, 'userId');
  const row = db.prepare('SELECT COUNT(*) AS total,COUNT(DISTINCT source) AS sources,MIN(occurred_at) AS oldest,MAX(occurred_at) AS newest FROM personal_event_ledger WHERE user_id=?').get(owner);
  return Object.freeze({ schema: 'agentone.personal-event-ledger-audit/v1', userId: owner, total: Number(row.total), sources: Number(row.sources), oldest: row.oldest ?? null, newest: row.newest ?? null, containsPayloads: false, containsSecrets: false });
}

export const personalEventLedgerInternals = Object.freeze({ stable, hash, minimalObject });
