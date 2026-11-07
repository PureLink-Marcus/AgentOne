import { randomUUID } from 'node:crypto';

import {
  activateSkillCandidate,
  approveSkillCandidate,
  auditSafeSkillCandidate,
  createSkillCandidate,
  createSkillRevision,
  learningLabInternals,
  markSkillTested,
  rollbackSkillCandidate,
} from './personal-learning-lab.mjs';

export const PERSONAL_BRIEFING_SKILL_ID = 'personal-briefing.v1';
export const PERSONAL_BRIEFING_READ_TOOLS = Object.freeze([
  'calendar.read',
  'health.summary',
  'mail.read',
]);

const RELEASE_WORKER = Object.freeze({ kind: 'system', id: 'learning-release-worker' });
const SKILL_NAME = 'Persönliches Briefing';
const SKILL_DESCRIPTION = 'Fasst ausschließlich minimierte, freigegebene Lesesignale deterministisch mit Herkunft zusammen.';
const SKILL_PROCEDURE = Object.freeze([
  'Minimierte Mail-, Kalender- und Health-Signale aus dem isolierten Eingabepuffer lesen.',
  'Signale deterministisch nach Dringlichkeit, Handlungsbedarf und Zeitpunkt priorisieren.',
  'Nur redigierte Hinweise, Herkunft und Unsicherheit ohne Mutation ausgeben.',
]);
const EVENT_SOURCES = Object.freeze(['calendar', 'health', 'mail']);
const EVENT_URGENCY = Object.freeze(['normal', 'high', 'critical']);
const EVENT_KEYS = new Set(['id', 'source', 'kind', 'occurredAt', 'title', 'urgency', 'actionRequired', 'unread', 'confidence']);
const DRAFT_KEYS = new Set(['candidateId', 'skillId', 'sourceRunId', 'userId']);
const EVALUATE_KEYS = new Set(['candidateId', 'userId']);
const APPROVE_KEYS = new Set(['candidateId', 'contentHash', 'principal', 'userId']);
const ACTIVATE_KEYS = new Set(['candidateId', 'principal', 'userId']);
const EXECUTE_KEYS = new Set(['executionId', 'input', 'userId']);
const ROLLBACK_KEYS = new Set(['candidateId', 'principal', 'reason', 'targetVersion', 'userId']);

const secretPatterns = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/gi,
  /\bauthorization\s*:\s*bearer\s+[a-z0-9._~+/=-]{8,}/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\s*[=:]\s*['"]?[^\s'"]{4,}/gi,
  /\b(?:sk-[a-z0-9_-]{12,}|gh[opusr]_[a-z0-9]{16,}|xox[baprs]-[a-z0-9-]{12,})\b/gi,
]);

function labError(message, code = 'LEARNING_INVALID_OPERATION', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function cleanId(value, field) {
  const id = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    throw labError(`${field} ist ungültig`, 'LEARNING_INVALID_ID');
  }
  return id;
}

function exactKeys(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw labError('Ungültige Anfrage', code);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw labError('Nicht erlaubte Felder in der Anfrage', code);
}

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { throw labError('Skill-Speicher ist inkonsistent', 'LEARNING_STORE_CORRUPT', 500); }
}

function assertAllowedCandidate(candidate) {
  const audit = auditSafeSkillCandidate(candidate);
  if (audit.familyId !== PERSONAL_BRIEFING_SKILL_ID || candidate.name !== SKILL_NAME || candidate.description !== SKILL_DESCRIPTION) {
    throw labError('Skill ist nicht freigegeben', 'LEARNING_SKILL_NOT_ALLOWED', 403);
  }
  if (learningLabInternals.canonical(candidate.procedure) !== learningLabInternals.canonical(SKILL_PROCEDURE)
    || learningLabInternals.canonical(candidate.allowedTools) !== learningLabInternals.canonical(PERSONAL_BRIEFING_READ_TOOLS)) {
    throw labError('Skill-Berechtigungen sind ungültig', 'LEARNING_SKILL_SCOPE_MISMATCH', 403);
  }
  return candidate;
}

function candidateFromRow(row, expectedUserId) {
  if (!row) throw labError('Skill-Kandidat wurde nicht gefunden', 'LEARNING_CANDIDATE_NOT_FOUND', 404);
  const candidate = assertAllowedCandidate(safeParse(row.candidate_json));
  const consistent = candidate.userId === expectedUserId
    && row.user_id === expectedUserId
    && row.skill_id === PERSONAL_BRIEFING_SKILL_ID
    && row.candidate_id === candidate.id
    && row.family_id === candidate.familyId
    && Number(row.version) === candidate.version
    && row.status === candidate.status
    && row.content_hash === candidate.contentHash;
  if (!consistent) throw labError('Skill-Speicher ist inkonsistent', 'LEARNING_STORE_CORRUPT', 500);
  assertLifecycle(candidate, row);
  return candidate;
}

function candidateRow(db, userId, candidateId) {
  return db.prepare(`SELECT user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,
    evaluation_json,is_active,created_at,updated_at
    FROM personal_learning_lab_skills WHERE user_id=? AND candidate_id=?`).get(userId, candidateId);
}

function loadCandidate(db, userId, candidateId) {
  return candidateFromRow(candidateRow(db, userId, candidateId), userId);
}

function isHash(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function validatedEvaluation(row, candidate) {
  if (!row?.evaluation_json) return null;
  const value = safeParse(row.evaluation_json);
  const base = {
    schema: 'agentone.personal-briefing-evaluation/v1',
    candidateId: candidate.id,
    skillId: PERSONAL_BRIEFING_SKILL_ID,
    contentHash: candidate.contentHash,
    passed: true,
    sandboxed: true,
    total: Number(value.total),
    successful: Number(value.successful),
    fixtureHash: String(value.fixtureHash ?? '').toLowerCase(),
    outputHash: String(value.outputHash ?? '').toLowerCase(),
  };
  const valid = value.schema === base.schema
    && value.candidateId === base.candidateId
    && value.skillId === base.skillId
    && value.contentHash === base.contentHash
    && value.passed === true
    && value.sandboxed === true
    && Number.isSafeInteger(base.total)
    && base.total > 0
    && base.successful === base.total
    && isHash(base.fixtureHash)
    && isHash(base.outputHash)
    && value.attestationHash === learningLabInternals.digest(base);
  if (!valid) throw labError('Skill-Testattestierung ist inkonsistent', 'LEARNING_ATTESTATION_INVALID', 500);
  return Object.freeze({ ...base, attestationHash: value.attestationHash });
}

function assertLifecycle(candidate, row) {
  const evaluation = validatedEvaluation(row, candidate);
  const requiresTest = ['TESTED', 'APPROVED', 'ACTIVE', 'ROLLED_BACK'].includes(candidate.status);
  const requiresApproval = ['APPROVED', 'ACTIVE', 'ROLLED_BACK'].includes(candidate.status);
  const guard = candidate.guardReport;
  const report = candidate.testReport;
  const testValid = guard?.passed === true
    && guard.contentHash === candidate.contentHash
    && Array.isArray(guard.findings)
    && guard.findings.every((finding) => finding?.severity !== 'BLOCK')
    && report?.passed === true
    && report.sandboxed === true
    && Number.isSafeInteger(report.total)
    && report.total > 0
    && report.successful === report.total
    && evaluation
    && report.total === evaluation.total
    && report.successful === evaluation.successful
    && report.fixtureHash === evaluation.fixtureHash;
  if (requiresTest && !testValid) throw labError('Skill-Teststatus ist inkonsistent', 'LEARNING_ATTESTATION_INVALID', 500);
  if (candidate.status === 'STAGED' && (candidate.guardReport || candidate.testReport || candidate.approval || evaluation)) {
    throw labError('Skill-Entwurfsstatus ist inkonsistent', 'LEARNING_STORE_CORRUPT', 500);
  }
  const approvalValid = candidate.approval?.actor?.kind === 'human'
    && candidate.approval.actor.id === candidate.userId
    && candidate.approval.contentHash === candidate.contentHash;
  if (requiresApproval && !approvalValid) throw labError('Skill-Freigabestatus ist inkonsistent', 'LEARNING_ATTESTATION_INVALID', 500);
  if (Number(row.is_active) === 1 && candidate.status !== 'ACTIVE') {
    throw labError('Skill-Aktivstatus ist inkonsistent', 'LEARNING_STORE_CORRUPT', 500);
  }
  return true;
}

function safeEvaluation(row, candidate) {
  const value = validatedEvaluation(row, candidate);
  if (!value) return null;
  return Object.freeze({
    schema: value.schema,
    passed: value.passed,
    sandboxed: value.sandboxed,
    total: value.total,
    successful: value.successful,
    fixtureHash: value.fixtureHash,
    outputHash: value.outputHash,
  });
}

function publicSkill(row, userId) {
  const candidate = candidateFromRow(row, userId);
  return Object.freeze({
    skillId: PERSONAL_BRIEFING_SKILL_ID,
    active: Number(row.is_active) === 1,
    ...auditSafeSkillCandidate(candidate),
    evaluation: safeEvaluation(row, candidate),
  });
}

function insertCandidate(db, candidate) {
  db.prepare(`INSERT INTO personal_learning_lab_skills(
    user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,evaluation_json,is_active,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)`).run(
    candidate.userId,
    candidate.id,
    PERSONAL_BRIEFING_SKILL_ID,
    candidate.familyId,
    candidate.version,
    candidate.status,
    candidate.contentHash,
    JSON.stringify(candidate),
    null,
    candidate.createdAt,
    candidate.updatedAt,
  );
}

function persistTransition(db, before, after, { evaluation = undefined, active = undefined } = {}) {
  assertAllowedCandidate(after);
  const assignments = ['status=?', 'candidate_json=?', 'updated_at=?'];
  const values = [after.status, JSON.stringify(after), after.updatedAt];
  if (evaluation !== undefined) { assignments.push('evaluation_json=?'); values.push(evaluation ? JSON.stringify(evaluation) : null); }
  if (active !== undefined) { assignments.push('is_active=?'); values.push(active ? 1 : 0); }
  values.push(before.userId, before.id, before.status, before.contentHash);
  const result = db.prepare(`UPDATE personal_learning_lab_skills SET ${assignments.join(',')}
    WHERE user_id=? AND candidate_id=? AND status=? AND content_hash=?`).run(...values);
  if (result.changes !== 1) throw labError('Skill wurde parallel verändert', 'LEARNING_CONCURRENT_CHANGE', 409);
}

function sanitizeText(value, maxLength = 160) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  for (const pattern of secretPatterns) text = text.replace(pattern, '[REDACTED]');
  return text || 'Signal';
}

function normalizeEvents(input) {
  exactKeys(input, new Set(['events']), 'LEARNING_EXECUTION_INPUT_DENIED');
  if (!Array.isArray(input.events) || input.events.length > 100) {
    throw labError('Briefing-Ereignisse sind ungültig', 'LEARNING_EXECUTION_INPUT_DENIED');
  }
  const ids = new Set();
  const events = input.events.map((event) => {
    exactKeys(event, EVENT_KEYS, 'LEARNING_EXECUTION_INPUT_DENIED');
    const id = cleanId(event.id, 'event.id');
    if (ids.has(id)) throw labError('Briefing-Ereignisse sind nicht eindeutig', 'LEARNING_EXECUTION_INPUT_DENIED');
    ids.add(id);
    const source = String(event.source ?? '').toLowerCase();
    if (!EVENT_SOURCES.includes(source)) throw labError('Briefing-Quelle ist nicht freigegeben', 'LEARNING_EXECUTION_INPUT_DENIED');
    const kind = cleanId(event.kind || 'signal', 'event.kind');
    const instant = new Date(event.occurredAt);
    if (!event.occurredAt || Number.isNaN(instant.getTime())) throw labError('Briefing-Zeitpunkt ist ungültig', 'LEARNING_EXECUTION_INPUT_DENIED');
    const urgency = String(event.urgency || 'normal').toLowerCase();
    if (!EVENT_URGENCY.includes(urgency)) throw labError('Briefing-Dringlichkeit ist ungültig', 'LEARNING_EXECUTION_INPUT_DENIED');
    const confidence = event.confidence === undefined ? 1 : Number(event.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw labError('Briefing-Konfidenz ist ungültig', 'LEARNING_EXECUTION_INPUT_DENIED');
    return Object.freeze({
      id,
      source,
      kind,
      occurredAt: instant.toISOString(),
      title: sanitizeText(event.title),
      urgency,
      actionRequired: event.actionRequired === true,
      unread: event.unread === true,
      confidence: Math.round(confidence * 1000) / 1000,
    });
  });
  return Object.freeze(events.sort((left, right) => left.id.localeCompare(right.id)));
}

function priority(event) {
  return (event.urgency === 'critical' ? 40 : event.urgency === 'high' ? 20 : 0)
    + (event.actionRequired ? 15 : 0)
    + (event.unread ? 5 : 0)
    + ({ calendar: 4, health: 3, mail: 2 }[event.source] ?? 0);
}

function executeDeterministic(candidate, events) {
  const stableEvents = [...events].sort((left, right) => left.id.localeCompare(right.id));
  const inputHash = learningLabInternals.digest(stableEvents);
  const ranked = [...stableEvents].sort((left, right) => priority(right) - priority(left)
    || right.occurredAt.localeCompare(left.occurredAt)
    || left.id.localeCompare(right.id));
  const value = {
    schema: 'agentone.personal-briefing-result/v1',
    skill: Object.freeze({ id: PERSONAL_BRIEFING_SKILL_ID, version: candidate.version, contentHash: candidate.contentHash }),
    readOnly: true,
    mutations: Object.freeze([]),
    inputHash,
    overview: Object.freeze({
      total: stableEvents.length,
      actionRequired: stableEvents.filter((event) => event.actionRequired).length,
      bySource: Object.freeze(Object.fromEntries(EVENT_SOURCES.map((source) => [source, stableEvents.filter((event) => event.source === source).length]))),
    }),
    items: Object.freeze(ranked.slice(0, 12).map((event) => Object.freeze({
      eventId: event.id,
      source: event.source,
      kind: event.kind,
      occurredAt: event.occurredAt,
      title: event.title,
      urgency: event.urgency,
      actionRequired: event.actionRequired,
      confidence: event.confidence,
      priority: priority(event),
    }))),
  };
  return Object.freeze({ ...value, outputHash: learningLabInternals.digest(value) });
}

function evaluateCandidate(candidate) {
  const fixture = normalizeEvents({ events: [
    { id: 'calendar-1', source: 'calendar', kind: 'appointment', occurredAt: '2026-01-01T08:00:00.000Z', title: 'Teamtermin', urgency: 'high', actionRequired: true },
    { id: 'health-1', source: 'health', kind: 'recovery', occurredAt: '2026-01-01T07:00:00.000Z', title: 'Erholung beachten', urgency: 'normal', confidence: 0.8 },
    { id: 'mail-1', source: 'mail', kind: 'message', occurredAt: '2026-01-01T09:00:00.000Z', title: 'client_secret=fixture-value', unread: true },
  ] });
  const first = executeDeterministic(candidate, fixture);
  const second = executeDeterministic(candidate, Object.freeze([...fixture].reverse()));
  const checks = Object.freeze([
    first.outputHash === second.outputHash,
    first.readOnly === true && first.mutations.length === 0,
    !JSON.stringify(first).includes('fixture-value'),
    learningLabInternals.canonical(candidate.allowedTools) === learningLabInternals.canonical(PERSONAL_BRIEFING_READ_TOOLS),
  ]);
  const successful = checks.filter(Boolean).length;
  if (successful !== checks.length) throw labError('Isolierte Skill-Auswertung ist fehlgeschlagen', 'LEARNING_TEST_FAILED', 422);
  const evaluation = {
    schema: 'agentone.personal-briefing-evaluation/v1',
    candidateId: candidate.id,
    skillId: PERSONAL_BRIEFING_SKILL_ID,
    contentHash: candidate.contentHash,
    passed: true,
    sandboxed: true,
    total: checks.length,
    successful,
    fixtureHash: learningLabInternals.digest(fixture),
    outputHash: first.outputHash,
  };
  return Object.freeze({ ...evaluation, attestationHash: learningLabInternals.digest(evaluation) });
}

function requireHumanPrincipal(principal, userId) {
  if (!principal || principal.kind !== 'human' || principal.authenticated !== true || String(principal.userId ?? '') !== userId) {
    throw labError('Aktion benötigt den authentifizierten Benutzer', 'LEARNING_HUMAN_GATE_REQUIRED', 403);
  }
  return Object.freeze({ kind: 'human', id: userId });
}

export function initPersonalLearningLabStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_learning_lab_skills(
      user_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      family_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      evaluation_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,candidate_id),
      UNIQUE(user_id,skill_id,version),
      CHECK(skill_id='personal-briefing.v1'),
      CHECK(is_active IN (0,1))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS personal_learning_lab_one_active
      ON personal_learning_lab_skills(user_id,skill_id) WHERE is_active=1;
    CREATE INDEX IF NOT EXISTS personal_learning_lab_user
      ON personal_learning_lab_skills(user_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS personal_learning_lab_executions(
      user_id TEXT NOT NULL,
      execution_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      output_hash TEXT NOT NULL,
      event_count INTEGER NOT NULL,
      source_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,execution_id),
      CHECK(skill_id='personal-briefing.v1')
    );
    CREATE INDEX IF NOT EXISTS personal_learning_lab_execution_user
      ON personal_learning_lab_executions(user_id,created_at DESC);
  `);
}

export function createPersonalBriefingDraft(db, input = {}) {
  exactKeys(input, DRAFT_KEYS, 'LEARNING_DRAFT_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  if (input.skillId !== undefined && input.skillId !== PERSONAL_BRIEFING_SKILL_ID) {
    throw labError('Skill ist nicht freigegeben', 'LEARNING_SKILL_NOT_ALLOWED', 403);
  }
  const sourceRunId = cleanId(input.sourceRunId, 'sourceRunId');
  const candidateId = cleanId(input.candidateId || randomUUID(), 'candidateId');
  return transaction(db, () => {
    const latestRow = db.prepare(`SELECT user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,
      evaluation_json,is_active,created_at,updated_at FROM personal_learning_lab_skills
      WHERE user_id=? AND skill_id=? ORDER BY version DESC LIMIT 1`).get(userId, PERSONAL_BRIEFING_SKILL_ID);
    const fixed = {
      id: candidateId,
      sourceRunId,
      name: SKILL_NAME,
      description: SKILL_DESCRIPTION,
      procedure: SKILL_PROCEDURE,
      allowedTools: PERSONAL_BRIEFING_READ_TOOLS,
      evidence: [`run:${sourceRunId}:skill:${PERSONAL_BRIEFING_SKILL_ID}`],
      createdBy: { kind: 'system', id: 'learning-draft-worker' },
    };
    const candidate = latestRow
      ? createSkillRevision(candidateFromRow(latestRow, userId), fixed)
      : createSkillCandidate({ ...fixed, userId, familyId: PERSONAL_BRIEFING_SKILL_ID, version: 1 });
    assertAllowedCandidate(candidate);
    insertCandidate(db, candidate);
    return publicSkill(candidateRow(db, userId, candidate.id), userId);
  });
}

export function evaluatePersonalBriefingDraft(db, input = {}) {
  exactKeys(input, EVALUATE_KEYS, 'LEARNING_EVALUATION_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  const candidateId = cleanId(input.candidateId, 'candidateId');
  return transaction(db, () => {
    const candidate = loadCandidate(db, userId, candidateId);
    const evaluation = evaluateCandidate(candidate);
    const tested = markSkillTested(candidate, {
      actor: RELEASE_WORKER,
      report: {
        passed: evaluation.passed,
        sandboxed: evaluation.sandboxed,
        total: evaluation.total,
        successful: evaluation.successful,
        fixtureHash: evaluation.fixtureHash,
      },
    });
    persistTransition(db, candidate, tested, { evaluation });
    return publicSkill(candidateRow(db, userId, candidateId), userId);
  });
}

export function approvePersonalBriefingDraft(db, input = {}) {
  exactKeys(input, APPROVE_KEYS, 'LEARNING_APPROVAL_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  const candidateId = cleanId(input.candidateId, 'candidateId');
  const actor = requireHumanPrincipal(input.principal, userId);
  return transaction(db, () => {
    const candidate = loadCandidate(db, userId, candidateId);
    const approved = approveSkillCandidate(candidate, { actor, contentHash: String(input.contentHash ?? '') });
    persistTransition(db, candidate, approved);
    return publicSkill(candidateRow(db, userId, candidateId), userId);
  });
}

export function activatePersonalBriefingSkill(db, input = {}) {
  exactKeys(input, ACTIVATE_KEYS, 'LEARNING_ACTIVATION_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  const candidateId = cleanId(input.candidateId, 'candidateId');
  requireHumanPrincipal(input.principal, userId);
  return transaction(db, () => {
    const candidate = loadCandidate(db, userId, candidateId);
    if (candidate.approval?.actor?.kind !== 'human' || candidate.approval.actor.id !== userId || candidate.approval.contentHash !== candidate.contentHash) {
      throw labError('Aktivierung benötigt die persönliche Exact-Hash-Freigabe', 'LEARNING_ACTIVATION_DENIED', 409);
    }
    const active = activateSkillCandidate(candidate, { actor: RELEASE_WORKER });
    db.prepare('UPDATE personal_learning_lab_skills SET is_active=0 WHERE user_id=? AND skill_id=?').run(userId, PERSONAL_BRIEFING_SKILL_ID);
    persistTransition(db, candidate, active, { active: true });
    return publicSkill(candidateRow(db, userId, candidateId), userId);
  });
}

export function executePersonalBriefingSkill(db, input = {}) {
  exactKeys(input, EXECUTE_KEYS, 'LEARNING_EXECUTION_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  const executionId = cleanId(input.executionId || randomUUID(), 'executionId');
  const events = normalizeEvents(input.input ?? {});
  return transaction(db, () => {
    const row = db.prepare(`SELECT user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,
      evaluation_json,is_active,created_at,updated_at FROM personal_learning_lab_skills
      WHERE user_id=? AND skill_id=? AND is_active=1`).get(userId, PERSONAL_BRIEFING_SKILL_ID);
    const candidate = candidateFromRow(row, userId);
    if (candidate.status !== 'ACTIVE') throw labError('Aktiver Skill ist inkonsistent', 'LEARNING_STORE_CORRUPT', 500);
    const result = executeDeterministic(candidate, events);
    const createdAt = new Date().toISOString();
    db.prepare(`INSERT INTO personal_learning_lab_executions(
      user_id,execution_id,candidate_id,skill_id,version,content_hash,input_hash,output_hash,event_count,source_count,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      userId,
      executionId,
      candidate.id,
      PERSONAL_BRIEFING_SKILL_ID,
      candidate.version,
      candidate.contentHash,
      result.inputHash,
      result.outputHash,
      events.length,
      new Set(events.map((event) => event.source)).size,
      createdAt,
    );
    return Object.freeze({ executionId, createdAt, ...result });
  });
}

export function rollbackPersonalBriefingSkill(db, input = {}) {
  exactKeys(input, ROLLBACK_KEYS, 'LEARNING_ROLLBACK_INPUT_DENIED');
  const userId = cleanId(input.userId, 'userId');
  const candidateId = cleanId(input.candidateId, 'candidateId');
  const actor = requireHumanPrincipal(input.principal, userId);
  const targetVersion = Number(input.targetVersion);
  return transaction(db, () => {
    const current = loadCandidate(db, userId, candidateId);
    const currentRow = candidateRow(db, userId, candidateId);
    if (Number(currentRow.is_active) !== 1) throw labError('Nur die aktive Revision kann zurückgerollt werden', 'LEARNING_TRANSITION_DENIED', 409);
    const targetRow = db.prepare(`SELECT user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,
      evaluation_json,is_active,created_at,updated_at FROM personal_learning_lab_skills
      WHERE user_id=? AND skill_id=? AND version=? AND status='ACTIVE'`).get(userId, PERSONAL_BRIEFING_SKILL_ID, targetVersion);
    const target = candidateFromRow(targetRow, userId);
    if (target.version >= current.version) throw labError('Rollback-Ziel muss eine ältere aktive Revision sein', 'LEARNING_INVALID_VERSION');
    const rolledBack = rollbackSkillCandidate(current, { actor, reason: input.reason, targetVersion: target.version });
    db.prepare('UPDATE personal_learning_lab_skills SET is_active=0 WHERE user_id=? AND skill_id=?').run(userId, PERSONAL_BRIEFING_SKILL_ID);
    persistTransition(db, current, rolledBack, { active: false });
    const restored = db.prepare(`UPDATE personal_learning_lab_skills SET is_active=1,updated_at=?
      WHERE user_id=? AND candidate_id=? AND status='ACTIVE' AND content_hash=?`).run(
      new Date().toISOString(), userId, target.id, target.contentHash,
    );
    if (restored.changes !== 1) throw labError('Rollback-Ziel wurde parallel verändert', 'LEARNING_CONCURRENT_CHANGE', 409);
    return Object.freeze({
      rolledBack: publicSkill(candidateRow(db, userId, current.id), userId),
      active: publicSkill(candidateRow(db, userId, target.id), userId),
    });
  });
}

export function listPersonalBriefingSkills(db, { userId } = {}) {
  const safeUserId = cleanId(userId, 'userId');
  return Object.freeze(db.prepare(`SELECT user_id,candidate_id,skill_id,family_id,version,status,content_hash,candidate_json,
    evaluation_json,is_active,created_at,updated_at FROM personal_learning_lab_skills
    WHERE user_id=? AND skill_id=? ORDER BY version DESC`).all(safeUserId, PERSONAL_BRIEFING_SKILL_ID)
    .map((row) => publicSkill(row, safeUserId)));
}

export function listPersonalBriefingExecutions(db, { userId, limit = 50 } = {}) {
  const safeUserId = cleanId(userId, 'userId');
  const safeLimit = Math.max(1, Math.min(100, Number.isSafeInteger(Number(limit)) ? Number(limit) : 50));
  return Object.freeze(db.prepare(`SELECT execution_id,candidate_id,skill_id,version,content_hash,input_hash,output_hash,
    event_count,source_count,created_at FROM personal_learning_lab_executions
    WHERE user_id=? ORDER BY created_at DESC LIMIT ?`).all(safeUserId, safeLimit).map((row) => Object.freeze({
      executionId: row.execution_id,
      candidateId: row.candidate_id,
      skillId: row.skill_id,
      version: Number(row.version),
      contentHash: row.content_hash,
      inputHash: row.input_hash,
      outputHash: row.output_hash,
      eventCount: Number(row.event_count),
      sourceCount: Number(row.source_count),
      createdAt: row.created_at,
    })));
}

