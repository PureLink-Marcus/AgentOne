import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export const learningLabStates = Object.freeze([
  'STAGED',
  'TESTED',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'ROLLED_BACK',
]);

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 600;
const MAX_PROCEDURE_STEPS = 40;
const MAX_STEP_LENGTH = 800;
const MAX_EVIDENCE_ITEMS = 50;
const MAX_TOOL_COUNT = 30;

const blockedToolNames = new Set([
  'admin.unrestricted',
  'credentials.export',
  'secrets.read',
  'shell.unrestricted',
  'terminal.unrestricted',
]);

const guardRules = Object.freeze([
  { code: 'SECRET_PRIVATE_KEY', severity: 'BLOCK', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { code: 'SECRET_AUTHORIZATION', severity: 'BLOCK', expression: /\bauthorization\s*:\s*bearer\s+[a-z0-9._~+/=-]{12,}/i },
  { code: 'SECRET_ASSIGNMENT', severity: 'BLOCK', expression: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd)\s*[=:]\s*['"]?[^\s'"]{8,}/i },
  { code: 'SECRET_KNOWN_PREFIX', severity: 'BLOCK', expression: /\b(?:sk-[a-z0-9_-]{16,}|gh[opusr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{16,})\b/i },
  { code: 'SHELL_DESTRUCTIVE_UNIX', severity: 'BLOCK', expression: /(?:^|[;&|]\s*)rm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i },
  { code: 'SHELL_DESTRUCTIVE_WINDOWS', severity: 'BLOCK', expression: /\b(?:remove-item\b[^\r\n]*-(?:recurse|force)|format(?:-volume)?\b|diskpart\b[^\r\n]*\bclean\b)/i },
  { code: 'SHELL_PIPE_TO_EXECUTION', severity: 'BLOCK', expression: /\b(?:curl|wget|invoke-webrequest)\b[^\r\n|]*\|\s*(?:sh|bash|zsh|powershell|pwsh)\b/i },
  { code: 'DYNAMIC_CODE_EXECUTION', severity: 'BLOCK', expression: /\b(?:eval|exec|invoke-expression)\s*\(/i },
  { code: 'CREDENTIAL_STORE_ACCESS', severity: 'BLOCK', expression: /(?:\.ssh\/(?:id_|authorized_keys)|\.aws\/credentials|windows credential manager|keychain.*password)/i },
  { code: 'SECURITY_BYPASS', severity: 'BLOCK', expression: /\b(?:disable|bypass|skip|ignore)\b[^.\r\n]{0,80}\b(?:approval|audit|authentication|authorization|permission|policy|sandbox|safety|security|tls)\b/i },
  { code: 'AUTONOMOUS_APPROVAL', severity: 'BLOCK', expression: /\b(?:self[- ]?approve|approve (?:my|its|own)|mark (?:the )?(?:gate|review) (?:as )?passed)\b/i },
]);

function cleanText(value, maxLength) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!text) return '';
  return text.slice(0, maxLength);
}

function cleanId(value, field) {
  const id = cleanText(value, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) throw learningError(`${field} ist ungültig`, 'LEARNING_INVALID_ID');
  return id;
}

function uniqueStrings(values, maxItems, maxLength) {
  return [...new Set((values ?? []).map((value) => cleanText(value, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function safeHashEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left)) || !/^[a-f0-9]{64}$/i.test(String(right))) return false;
  return timingSafeEqual(Buffer.from(String(left), 'hex'), Buffer.from(String(right), 'hex'));
}

function immutableContent(candidate) {
  return {
    familyId: candidate.familyId,
    version: candidate.version,
    userId: candidate.userId,
    sourceRunId: candidate.sourceRunId,
    parentHash: candidate.parentHash ?? null,
    name: candidate.name,
    description: candidate.description,
    procedure: candidate.procedure,
    allowedTools: candidate.allowedTools,
    evidence: candidate.evidence,
  };
}

function assertCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') throw learningError('Skill-Kandidat fehlt', 'LEARNING_CANDIDATE_REQUIRED');
  if (!learningLabStates.includes(candidate.status)) throw learningError('Unbekannter Skill-Status', 'LEARNING_INVALID_STATE');
  const expected = digest(immutableContent(candidate));
  if (!safeHashEqual(candidate.contentHash, expected)) throw learningError('Skill-Inhalt oder Hash wurde verändert', 'LEARNING_HASH_MISMATCH');
  return candidate;
}

function learningError(message, code = 'LEARNING_INVALID_OPERATION', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function requireHuman(actor, action) {
  if (!actor || actor.kind !== 'human' || !cleanText(actor.id, 128)) {
    throw learningError(`${action} benötigt eine menschliche Freigabe`, 'LEARNING_HUMAN_GATE_REQUIRED', 403);
  }
  return { kind: 'human', id: cleanId(actor.id, 'actor.id') };
}

function transition(candidate, status, event) {
  assertCandidate(candidate);
  return Object.freeze({
    ...candidate,
    status,
    updatedAt: event.at,
    history: Object.freeze([...(candidate.history ?? []), Object.freeze(event)]),
  });
}

function historyEvent(type, actor, detail = {}) {
  return Object.freeze({
    id: randomUUID(),
    type,
    at: new Date().toISOString(),
    actor: Object.freeze({ kind: actor.kind, id: cleanText(actor.id, 128) }),
    detail: Object.freeze(detail),
  });
}

export function createSkillCandidate(input = {}) {
  const userId = cleanId(input.userId, 'userId');
  const sourceRunId = cleanId(input.sourceRunId, 'sourceRunId');
  const familyId = cleanId(input.familyId || `skill-${randomUUID()}`, 'familyId');
  const version = Number(input.version ?? 1);
  if (!Number.isSafeInteger(version) || version < 1) throw learningError('Skill-Version ist ungültig', 'LEARNING_INVALID_VERSION');
  const name = cleanText(input.name, MAX_NAME_LENGTH);
  const description = cleanText(input.description, MAX_DESCRIPTION_LENGTH);
  const procedure = uniqueStrings(input.procedure, MAX_PROCEDURE_STEPS, MAX_STEP_LENGTH);
  const allowedTools = uniqueStrings(input.allowedTools, MAX_TOOL_COUNT, 120).sort();
  const evidence = uniqueStrings(input.evidence, MAX_EVIDENCE_ITEMS, 240);
  if (!name || !description || procedure.length === 0 || evidence.length === 0) {
    throw learningError('Name, Beschreibung, Verfahren und Herkunftsnachweis sind erforderlich', 'LEARNING_FIELDS_REQUIRED');
  }
  const createdAt = new Date().toISOString();
  const candidate = {
    id: cleanId(input.id || randomUUID(), 'id'),
    familyId,
    version,
    userId,
    sourceRunId,
    parentHash: input.parentHash ? cleanText(input.parentHash, 64) : null,
    name,
    description,
    procedure: Object.freeze(procedure),
    allowedTools: Object.freeze(allowedTools),
    evidence: Object.freeze(evidence),
    status: 'STAGED',
    locked: false,
    createdAt,
    updatedAt: createdAt,
    guardReport: null,
    testReport: null,
    approval: null,
    history: Object.freeze([]),
  };
  candidate.contentHash = digest(immutableContent(candidate));
  candidate.history = Object.freeze([
    historyEvent('candidate.staged', { kind: cleanText(input.createdBy?.kind, 20) || 'agent', id: cleanText(input.createdBy?.id, 128) || 'unknown' }, { contentHash: candidate.contentHash }),
  ]);
  return Object.freeze(candidate);
}

export function guardSkillCandidate(candidate) {
  assertCandidate(candidate);
  const findings = [];
  for (const tool of candidate.allowedTools) {
    if (blockedToolNames.has(tool.toLowerCase())) findings.push({ code: 'TOOL_NOT_ALLOWED', severity: 'BLOCK', field: 'allowedTools', valueHash: digest(tool) });
  }
  const fields = [
    ['name', candidate.name],
    ['description', candidate.description],
    ...candidate.procedure.map((value, index) => [`procedure.${index}`, value]),
    ...candidate.evidence.map((value, index) => [`evidence.${index}`, value]),
  ];
  for (const [field, value] of fields) {
    for (const rule of guardRules) if (rule.expression.test(value)) findings.push({ code: rule.code, severity: rule.severity, field, valueHash: digest(value) });
  }
  const checkedAt = new Date().toISOString();
  return Object.freeze({
    schema: 'agentone.learning-guard/v1',
    contentHash: candidate.contentHash,
    checkedAt,
    passed: findings.every((finding) => finding.severity !== 'BLOCK'),
    findings: Object.freeze(findings.map(Object.freeze)),
  });
}

export function markSkillTested(candidate, { actor = { kind: 'system', id: 'learning-test-runner' }, report } = {}) {
  assertCandidate(candidate);
  if (candidate.status !== 'STAGED') throw learningError('Nur ein STAGED-Kandidat kann getestet werden', 'LEARNING_TRANSITION_DENIED', 409);
  const guardReport = guardSkillCandidate(candidate);
  if (!guardReport.passed) throw learningError('Skill-Kandidat hat die Sicherheitsprüfung nicht bestanden', 'LEARNING_GUARD_FAILED', 422);
  const passed = report?.passed === true;
  const sandboxed = report?.sandboxed === true;
  const total = Number(report?.total ?? 0);
  const successful = Number(report?.successful ?? 0);
  if (!passed || !sandboxed || !Number.isSafeInteger(total) || total < 1 || successful !== total) {
    throw learningError('Ein vollständiger isolierter Testlauf ist erforderlich', 'LEARNING_TEST_FAILED', 422);
  }
  const testReport = Object.freeze({
    schema: 'agentone.learning-test/v1',
    passed: true,
    sandboxed: true,
    total,
    successful,
    fixtureHash: /^[a-f0-9]{64}$/i.test(String(report.fixtureHash ?? '')) ? String(report.fixtureHash).toLowerCase() : digest(report.fixtureId ?? 'isolated-fixture'),
    testedAt: new Date().toISOString(),
  });
  return transition(Object.freeze({ ...candidate, guardReport, testReport }), 'TESTED', historyEvent('candidate.tested', actor, { testReportHash: digest(testReport) }));
}

export function approveSkillCandidate(candidate, { actor, contentHash } = {}) {
  assertCandidate(candidate);
  if (candidate.status !== 'TESTED') throw learningError('Nur ein getesteter Kandidat kann freigegeben werden', 'LEARNING_TRANSITION_DENIED', 409);
  const human = requireHuman(actor, 'Skill-Freigabe');
  if (!safeHashEqual(contentHash, candidate.contentHash)) throw learningError('Freigabe bezieht sich nicht auf den aktuellen Skill-Inhalt', 'LEARNING_APPROVAL_HASH_MISMATCH', 409);
  const approvedAt = new Date().toISOString();
  const approval = Object.freeze({ actor: human, contentHash: candidate.contentHash, approvedAt });
  return transition(Object.freeze({ ...candidate, approval }), 'APPROVED', historyEvent('candidate.approved', human, { contentHash: candidate.contentHash }));
}

export function activateSkillCandidate(candidate, { actor = { kind: 'system', id: 'learning-release-worker' } } = {}) {
  assertCandidate(candidate);
  if (candidate.status !== 'APPROVED' || !candidate.approval || !safeHashEqual(candidate.approval.contentHash, candidate.contentHash)) {
    throw learningError('Aktivierung benötigt die Freigabe des unveränderten Inhalts', 'LEARNING_ACTIVATION_DENIED', 409);
  }
  return transition(candidate, 'ACTIVE', historyEvent('candidate.activated', actor, { contentHash: candidate.contentHash }));
}

export function rejectSkillCandidate(candidate, { actor, reason } = {}) {
  assertCandidate(candidate);
  if (!['STAGED', 'TESTED', 'APPROVED'].includes(candidate.status)) throw learningError('Dieser Kandidat kann nicht abgelehnt werden', 'LEARNING_TRANSITION_DENIED', 409);
  const human = requireHuman(actor, 'Skill-Ablehnung');
  const safeReason = cleanText(reason, 300);
  if (!safeReason) throw learningError('Ablehnungsgrund fehlt', 'LEARNING_REASON_REQUIRED');
  return transition(candidate, 'REJECTED', historyEvent('candidate.rejected', human, { reason: safeReason }));
}

export function lockSkillCandidate(candidate, { actor, reason = 'Kuratiertes Verfahren' } = {}) {
  assertCandidate(candidate);
  if (!['APPROVED', 'ACTIVE'].includes(candidate.status)) throw learningError('Nur freigegebene Skills können gesperrt werden', 'LEARNING_TRANSITION_DENIED', 409);
  const human = requireHuman(actor, 'Skill-Sperre');
  if (candidate.locked) return candidate;
  return Object.freeze({
    ...candidate,
    locked: true,
    updatedAt: new Date().toISOString(),
    history: Object.freeze([...candidate.history, historyEvent('candidate.locked', human, { reason: cleanText(reason, 300) })]),
  });
}

export function createSkillRevision(candidate, input = {}) {
  assertCandidate(candidate);
  if (candidate.locked) throw learningError('Gesperrter Skill kann nicht verändert werden', 'LEARNING_SKILL_LOCKED', 423);
  if (!['ACTIVE', 'ROLLED_BACK', 'REJECTED'].includes(candidate.status)) throw learningError('Neue Version benötigt einen abgeschlossenen Vorgänger', 'LEARNING_TRANSITION_DENIED', 409);
  return createSkillCandidate({
    ...input,
    familyId: candidate.familyId,
    version: candidate.version + 1,
    userId: candidate.userId,
    sourceRunId: input.sourceRunId,
    parentHash: candidate.contentHash,
  });
}

export function rollbackSkillCandidate(candidate, { actor, reason, targetVersion } = {}) {
  assertCandidate(candidate);
  if (candidate.status !== 'ACTIVE') throw learningError('Nur ein aktiver Skill kann zurückgerollt werden', 'LEARNING_TRANSITION_DENIED', 409);
  const human = requireHuman(actor, 'Skill-Rollback');
  const safeReason = cleanText(reason, 300);
  if (!safeReason) throw learningError('Rollback-Grund fehlt', 'LEARNING_REASON_REQUIRED');
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 1 || targetVersion >= candidate.version) {
    throw learningError('Rollback-Ziel muss eine ältere positive Version sein', 'LEARNING_INVALID_VERSION');
  }
  return transition(candidate, 'ROLLED_BACK', historyEvent('candidate.rolled_back', human, { reason: safeReason, targetVersion }));
}

export function auditSafeSkillCandidate(candidate) {
  assertCandidate(candidate);
  return Object.freeze({
    schema: 'agentone.learning-audit/v1',
    id: candidate.id,
    familyId: candidate.familyId,
    version: candidate.version,
    userId: candidate.userId,
    sourceRunId: candidate.sourceRunId,
    parentHash: candidate.parentHash,
    contentHash: candidate.contentHash,
    status: candidate.status,
    locked: candidate.locked,
    allowedTools: Object.freeze([...candidate.allowedTools]),
    guard: candidate.guardReport ? {
      passed: candidate.guardReport.passed,
      findingCodes: Object.freeze(candidate.guardReport.findings.map((finding) => finding.code)),
      checkedAt: candidate.guardReport.checkedAt,
    } : null,
    test: candidate.testReport ? {
      passed: candidate.testReport.passed,
      sandboxed: candidate.testReport.sandboxed,
      total: candidate.testReport.total,
      testedAt: candidate.testReport.testedAt,
    } : null,
    approval: candidate.approval ? { actorId: candidate.approval.actor.id, approvedAt: candidate.approval.approvedAt, contentHash: candidate.approval.contentHash } : null,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    history: Object.freeze(candidate.history.map((event) => ({ id: event.id, type: event.type, at: event.at, actor: event.actor }))),
  });
}

export const learningLabInternals = Object.freeze({ canonical, digest, immutableContent });
