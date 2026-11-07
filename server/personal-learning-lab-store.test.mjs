import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  PERSONAL_BRIEFING_READ_TOOLS,
  PERSONAL_BRIEFING_SKILL_ID,
  activatePersonalBriefingSkill,
  approvePersonalBriefingDraft,
  createPersonalBriefingDraft,
  evaluatePersonalBriefingDraft,
  executePersonalBriefingSkill,
  initPersonalLearningLabStore,
  listPersonalBriefingExecutions,
  listPersonalBriefingSkills,
  rollbackPersonalBriefingSkill,
} from './personal-learning-lab-store.mjs';

function database() {
  const db = new DatabaseSync(':memory:');
  initPersonalLearningLabStore(db);
  return db;
}

function human(userId) {
  return { kind: 'human', authenticated: true, userId };
}

function activateVersion(db, userId, sourceRunId, candidateId) {
  const draft = createPersonalBriefingDraft(db, { userId, sourceRunId, candidateId });
  const tested = evaluatePersonalBriefingDraft(db, { userId, candidateId: draft.id });
  const approved = approvePersonalBriefingDraft(db, {
    userId,
    candidateId: draft.id,
    contentHash: tested.contentHash,
    principal: human(userId),
  });
  assert.equal(approved.status, 'APPROVED');
  return activatePersonalBriefingSkill(db, { userId, candidateId: draft.id, principal: human(userId) });
}

test('persists only the allowlisted personal briefing skill and exposes a content-free audit projection', () => {
  const db = database();
  const draft = createPersonalBriefingDraft(db, {
    userId: 'guenni',
    sourceRunId: 'run-100',
    candidateId: 'briefing-1',
    skillId: PERSONAL_BRIEFING_SKILL_ID,
  });
  assert.equal(draft.skillId, PERSONAL_BRIEFING_SKILL_ID);
  assert.equal(draft.status, 'STAGED');
  assert.deepEqual(draft.allowedTools, PERSONAL_BRIEFING_READ_TOOLS);
  for (const key of ['procedure', 'evidence', 'description', 'candidate_json']) assert.equal(Object.hasOwn(draft, key), false);
  assert.equal(listPersonalBriefingSkills(db, { userId: 'fressi' }).length, 0);
  assert.equal(listPersonalBriefingSkills(db, { userId: 'guenni' }).length, 1);
  assert.throws(() => createPersonalBriefingDraft(db, {
    userId: 'guenni', sourceRunId: 'run-101', procedure: ['shell.unrestricted'],
  }), { code: 'LEARNING_DRAFT_INPUT_DENIED' });
  assert.throws(() => createPersonalBriefingDraft(db, {
    userId: 'guenni', sourceRunId: 'run-101', skillId: 'arbitrary-skill.v1',
  }), { code: 'LEARNING_SKILL_NOT_ALLOWED' });
  db.close();
});

test('runs the deterministic isolated evaluation internally and never trusts a client report', () => {
  const db = database();
  const draft = createPersonalBriefingDraft(db, { userId: 'guenni', sourceRunId: 'run-eval', candidateId: 'eval-1' });
  assert.throws(() => evaluatePersonalBriefingDraft(db, {
    userId: 'guenni', candidateId: draft.id, report: { passed: true, sandboxed: true },
  }), { code: 'LEARNING_EVALUATION_INPUT_DENIED' });
  const tested = evaluatePersonalBriefingDraft(db, { userId: 'guenni', candidateId: draft.id });
  assert.equal(tested.status, 'TESTED');
  assert.deepEqual(tested.evaluation && {
    passed: tested.evaluation.passed,
    sandboxed: tested.evaluation.sandboxed,
    total: tested.evaluation.total,
    successful: tested.evaluation.successful,
  }, { passed: true, sandboxed: true, total: 4, successful: 4 });
  assert.match(tested.evaluation.fixtureHash, /^[a-f0-9]{64}$/);
  assert.match(tested.evaluation.outputHash, /^[a-f0-9]{64}$/);
  assert.throws(() => evaluatePersonalBriefingDraft(db, { userId: 'guenni', candidateId: draft.id }), {
    code: 'LEARNING_TRANSITION_DENIED',
  });
  db.close();
});

test('requires an authenticated same-user exact-hash approval and activates only through the release worker', () => {
  const db = database();
  const draft = createPersonalBriefingDraft(db, { userId: 'guenni', sourceRunId: 'run-gate', candidateId: 'gate-1' });
  const tested = evaluatePersonalBriefingDraft(db, { userId: 'guenni', candidateId: draft.id });
  assert.throws(() => approvePersonalBriefingDraft(db, {
    userId: 'guenni', candidateId: draft.id, contentHash: tested.contentHash,
    principal: { kind: 'agent', authenticated: true, userId: 'guenni' },
  }), { code: 'LEARNING_HUMAN_GATE_REQUIRED' });
  assert.throws(() => approvePersonalBriefingDraft(db, {
    userId: 'guenni', candidateId: draft.id, contentHash: tested.contentHash,
    principal: human('fressi'),
  }), { code: 'LEARNING_HUMAN_GATE_REQUIRED' });
  assert.throws(() => approvePersonalBriefingDraft(db, {
    userId: 'guenni', candidateId: draft.id, contentHash: '0'.repeat(64), principal: human('guenni'),
  }), { code: 'LEARNING_APPROVAL_HASH_MISMATCH' });
  const approved = approvePersonalBriefingDraft(db, {
    userId: 'guenni', candidateId: draft.id, contentHash: tested.contentHash, principal: human('guenni'),
  });
  assert.throws(() => activatePersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: draft.id, actor: { kind: 'agent', id: 'self' },
  }), { code: 'LEARNING_ACTIVATION_INPUT_DENIED' });
  assert.throws(() => activatePersonalBriefingSkill(db, { userId: 'guenni', candidateId: approved.id }), {
    code: 'LEARNING_HUMAN_GATE_REQUIRED',
  });
  assert.throws(() => activatePersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: approved.id,
    principal: { kind: 'agent', authenticated: true, userId: 'guenni' },
  }), { code: 'LEARNING_HUMAN_GATE_REQUIRED' });
  const active = activatePersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: approved.id, principal: human('guenni'),
  });
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.active, true);
  assert.equal(active.approval.actorId, 'guenni');
  assert.deepEqual(active.history.at(-1).actor, { kind: 'system', id: 'learning-release-worker' });
  db.close();
});

test('executes read-only deterministically, redacts secrets and retains only audit-safe hashes', () => {
  const db = database();
  activateVersion(db, 'guenni', 'run-live', 'live-1');
  const events = [
    { id: 'mail-1', source: 'mail', kind: 'message', occurredAt: '2026-11-07T09:00:00Z', title: 'password=very-secret-value', unread: true },
    { id: 'calendar-1', source: 'calendar', kind: 'appointment', occurredAt: '2026-11-07T10:00:00Z', title: 'Arzttermin', urgency: 'critical', actionRequired: true },
    { id: 'health-1', source: 'health', kind: 'recovery', occurredAt: '2026-11-07T08:00:00Z', title: 'Erholung niedrig', confidence: 0.8 },
  ];
  const first = executePersonalBriefingSkill(db, { userId: 'guenni', executionId: 'execution-1', input: { events } });
  const second = executePersonalBriefingSkill(db, { userId: 'guenni', executionId: 'execution-2', input: { events: [...events].reverse() } });
  assert.equal(first.outputHash, second.outputHash);
  assert.equal(first.readOnly, true);
  assert.deepEqual(first.mutations, []);
  assert.equal(first.items[0].eventId, 'calendar-1');
  assert.doesNotMatch(JSON.stringify(first), /very-secret-value/);
  assert.match(first.items.find((item) => item.eventId === 'mail-1').title, /REDACTED/);
  const audit = listPersonalBriefingExecutions(db, { userId: 'guenni' });
  assert.equal(audit.length, 2);
  assert.equal(JSON.stringify(audit).includes('Arzttermin'), false);
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM personal_learning_lab_executions').all()).includes('very-secret-value'), false);
  assert.equal(listPersonalBriefingExecutions(db, { userId: 'fressi' }).length, 0);
  assert.throws(() => executePersonalBriefingSkill(db, {
    userId: 'guenni', input: { events: [{ ...events[0], body: 'raw mail body' }] },
  }), { code: 'LEARNING_EXECUTION_INPUT_DENIED' });
  db.close();
});

test('rolls back only to a persisted older ACTIVE revision owned by the same user', () => {
  const db = database();
  const versionOne = activateVersion(db, 'guenni', 'run-v1', 'version-1');
  const versionTwo = activateVersion(db, 'guenni', 'run-v2', 'version-2');
  assert.equal(versionOne.version, 1);
  assert.equal(versionTwo.version, 2);
  assert.equal(listPersonalBriefingSkills(db, { userId: 'guenni' }).filter((skill) => skill.active).length, 1);
  assert.throws(() => rollbackPersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: versionTwo.id, targetVersion: 1, reason: 'Agent rollback',
    principal: { kind: 'agent', authenticated: true, userId: 'guenni' },
  }), { code: 'LEARNING_HUMAN_GATE_REQUIRED' });
  assert.throws(() => rollbackPersonalBriefingSkill(db, {
    userId: 'fressi', candidateId: versionTwo.id, targetVersion: 1, reason: 'Cross-user rollback', principal: human('fressi'),
  }), { code: 'LEARNING_CANDIDATE_NOT_FOUND' });
  assert.throws(() => rollbackPersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: versionTwo.id, targetVersion: 99, reason: 'Missing target', principal: human('guenni'),
  }), { code: 'LEARNING_CANDIDATE_NOT_FOUND' });
  const rolledBack = rollbackPersonalBriefingSkill(db, {
    userId: 'guenni', candidateId: versionTwo.id, targetVersion: 1,
    reason: 'Regression im deterministischen Replay', principal: human('guenni'),
  });
  assert.equal(rolledBack.rolledBack.status, 'ROLLED_BACK');
  assert.equal(rolledBack.rolledBack.active, false);
  assert.equal(rolledBack.active.version, 1);
  assert.equal(rolledBack.active.active, true);
  db.close();
});

test('detects stored immutable-content corruption before list, approval or execution', () => {
  const db = database();
  const draft = createPersonalBriefingDraft(db, { userId: 'guenni', sourceRunId: 'run-corrupt', candidateId: 'corrupt-1' });
  const raw = JSON.parse(db.prepare('SELECT candidate_json FROM personal_learning_lab_skills WHERE user_id=? AND candidate_id=?').get('guenni', draft.id).candidate_json);
  raw.allowedTools = ['shell.unrestricted'];
  db.prepare('UPDATE personal_learning_lab_skills SET candidate_json=? WHERE user_id=? AND candidate_id=?').run(JSON.stringify(raw), 'guenni', draft.id);
  assert.throws(() => listPersonalBriefingSkills(db, { userId: 'guenni' }), { code: 'LEARNING_HASH_MISMATCH' });
  db.close();
});

test('rejects forged lifecycle status and evaluation attestation even when row metadata matches', () => {
  const db = database();
  const draft = createPersonalBriefingDraft(db, { userId: 'guenni', sourceRunId: 'run-forged', candidateId: 'forged-1' });
  const raw = JSON.parse(db.prepare('SELECT candidate_json FROM personal_learning_lab_skills WHERE user_id=? AND candidate_id=?').get('guenni', draft.id).candidate_json);
  raw.status = 'ACTIVE';
  db.prepare(`UPDATE personal_learning_lab_skills SET candidate_json=?,status='ACTIVE',is_active=1
    WHERE user_id=? AND candidate_id=?`).run(JSON.stringify(raw), 'guenni', draft.id);
  assert.throws(() => executePersonalBriefingSkill(db, { userId: 'guenni', input: { events: [] } }), {
    code: 'LEARNING_ATTESTATION_INVALID',
  });
  db.close();

  const attestationDb = database();
  const attestationDraft = createPersonalBriefingDraft(attestationDb, { userId: 'guenni', sourceRunId: 'run-attestation', candidateId: 'attestation-1' });
  evaluatePersonalBriefingDraft(attestationDb, { userId: 'guenni', candidateId: attestationDraft.id });
  const row = attestationDb.prepare('SELECT evaluation_json FROM personal_learning_lab_skills WHERE user_id=? AND candidate_id=?').get('guenni', attestationDraft.id);
  const evaluation = JSON.parse(row.evaluation_json);
  evaluation.outputHash = '0'.repeat(64);
  attestationDb.prepare('UPDATE personal_learning_lab_skills SET evaluation_json=? WHERE user_id=? AND candidate_id=?')
    .run(JSON.stringify(evaluation), 'guenni', attestationDraft.id);
  assert.throws(() => listPersonalBriefingSkills(attestationDb, { userId: 'guenni' }), {
    code: 'LEARNING_ATTESTATION_INVALID',
  });
  attestationDb.close();
});
