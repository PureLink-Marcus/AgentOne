import crypto from 'node:crypto';

const terminalStates = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export class EngineError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.status = status;
  }
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function payloadHash(payload) {
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  return JSON.parse(value);
}

function assertIdentifier(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,79}$/.test(String(value || ''))) {
    throw new EngineError('INVALID_IDENTIFIER', `${label} ist ungültig`, 400);
  }
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new EngineError('INVALID_TEMPLATE', 'Mindestens ein Schritt ist erforderlich', 400);
  const ids = new Set();
  return steps.map((step, index) => {
    assertIdentifier(step.id, `Schritt ${index + 1}`);
    if (ids.has(step.id)) throw new EngineError('INVALID_TEMPLATE', `Doppelter Schritt ${step.id}`, 400);
    ids.add(step.id);
    const risk = step.risk || (step.write ? 'WRITE' : 'READ');
    if (!['READ', 'WRITE', 'DEPLOY'].includes(risk)) throw new EngineError('INVALID_TEMPLATE', `Unbekannte Risikoklasse ${risk}`, 400);
    return {
      id: step.id,
      name: String(step.name || step.id),
      risk,
      requiresApproval: Boolean(step.requiresApproval || risk !== 'READ'),
      checkpoint: step.checkpoint !== false,
    };
  });
}

export function createPlatformEngine(db, options = {}) {
  if (!db?.prepare || !db?.exec) throw new TypeError('Eine SQLite-kompatible Datenbank ist erforderlich');
  const now = options.now || (() => new Date().toISOString());
  const idFactory = options.idFactory || ((prefix) => `${prefix}-${crypto.randomUUID()}`);

  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS engine_workflow_templates (
      id TEXT NOT NULL,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      definition_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(id, version)
    );
    CREATE TABLE IF NOT EXISTS engine_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      workflow_version INTEGER NOT NULL,
      world_id TEXT NOT NULL,
      status TEXT NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 0,
      budget_limit REAL NOT NULL,
      budget_used REAL NOT NULL DEFAULT 0,
      input_json TEXT NOT NULL,
      checkpoint_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(workflow_id, workflow_version) REFERENCES engine_workflow_templates(id, version)
    );
    CREATE TABLE IF NOT EXISTS engine_run_steps (
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_hash TEXT,
      output_json TEXT,
      cost REAL NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      PRIMARY KEY(run_id, step_index),
      FOREIGN KEY(run_id) REFERENCES engine_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS engine_gates (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      decided_by TEXT,
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      UNIQUE(run_id, step_index, payload_hash),
      FOREIGN KEY(run_id) REFERENCES engine_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS engine_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES engine_runs(id) ON DELETE CASCADE
    );
  `);

  const event = (runId, type, detail = {}) => {
    db.prepare('INSERT INTO engine_events(run_id,type,detail_json,created_at) VALUES(?,?,?,?)')
      .run(runId, type, stableStringify(detail), now());
  };

  const transaction = (operation) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  const template = (id, version) => {
    const row = db.prepare('SELECT * FROM engine_workflow_templates WHERE id=? AND version=?').get(id, version);
    if (!row) throw new EngineError('TEMPLATE_NOT_FOUND', 'Workflow-Vorlage nicht gefunden', 404);
    return { id: row.id, version: row.version, name: row.name, ...parseJson(row.definition_json) };
  };

  const rawRun = (runId) => {
    const row = db.prepare('SELECT * FROM engine_runs WHERE id=?').get(runId);
    if (!row) throw new EngineError('RUN_NOT_FOUND', 'Lauf nicht gefunden', 404);
    return row;
  };

  const mapRun = (row) => {
    const definition = template(row.workflow_id, row.workflow_version);
    const steps = db.prepare('SELECT * FROM engine_run_steps WHERE run_id=? ORDER BY step_index').all(row.id);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      worldId: row.world_id,
      status: row.status,
      currentStep: row.current_step,
      budgetLimit: row.budget_limit,
      budgetUsed: row.budget_used,
      input: parseJson(row.input_json, {}),
      checkpoint: parseJson(row.checkpoint_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: steps.map((step) => ({
        id: step.step_id,
        ...definition.steps[step.step_index],
        index: step.step_index,
        status: step.status,
        payloadHash: step.payload_hash,
        output: parseJson(step.output_json),
        cost: step.cost,
      })),
    };
  };

  const getRun = (runId) => mapRun(rawRun(runId));

  const defineWorkflow = ({ id, version = 1, name = id, steps }) => {
    assertIdentifier(id, 'Workflow-ID');
    if (!Number.isInteger(version) || version < 1) throw new EngineError('INVALID_TEMPLATE', 'Version muss eine positive Ganzzahl sein', 400);
    const definition = { steps: normalizeSteps(steps) };
    const hash = payloadHash(definition);
    const existing = db.prepare('SELECT definition_hash FROM engine_workflow_templates WHERE id=? AND version=?').get(id, version);
    if (existing && existing.definition_hash !== hash) throw new EngineError('IMMUTABLE_TEMPLATE', 'Eine veröffentlichte Vorlagenversion ist unveränderlich');
    db.prepare('INSERT INTO engine_workflow_templates(id,version,name,definition_json,definition_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id,version) DO NOTHING')
      .run(id, version, String(name), stableStringify(definition), hash, now());
    return template(id, version);
  };

  const createRun = ({ id = idFactory('RUN'), workflowId, workflowVersion = 1, worldId, budgetLimit, input = {} }) => transaction(() => {
    assertIdentifier(id, 'Run-ID');
    assertIdentifier(worldId, 'World-ID');
    const definition = template(workflowId, workflowVersion);
    const limit = Number(budgetLimit);
    if (!Number.isFinite(limit) || limit <= 0) throw new EngineError('INVALID_BUDGET', 'Budget muss größer als null sein', 400);
    const timestamp = now();
    db.prepare('INSERT INTO engine_runs(id,workflow_id,workflow_version,world_id,status,current_step,budget_limit,budget_used,input_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, workflowId, workflowVersion, worldId, 'READY', 0, limit, 0, stableStringify(input), timestamp, timestamp);
    const insert = db.prepare('INSERT INTO engine_run_steps(run_id,step_index,step_id,status) VALUES(?,?,?,?)');
    definition.steps.forEach((step, index) => insert.run(id, index, step.id, 'PENDING'));
    event(id, 'RUN_CREATED', { workflowId, workflowVersion, budgetLimit: limit });
    return getRun(id);
  });

  const start = (runId) => transaction(() => {
    const run = rawRun(runId);
    if (terminalStates.has(run.status)) throw new EngineError('RUN_TERMINAL', 'Abgeschlossener Lauf kann nicht gestartet werden');
    if (run.status === 'PAUSED_BUDGET') throw new EngineError('BUDGET_REQUIRED', 'Budget muss vor dem Fortsetzen erhöht werden');
    db.prepare('UPDATE engine_runs SET status=?,updated_at=? WHERE id=?').run('RUNNING', now(), runId);
    event(runId, 'RUN_STARTED', { currentStep: run.current_step });
    return getRun(runId);
  });

  const pause = (runId, actor = 'system') => transaction(() => {
    const run = rawRun(runId);
    if (terminalStates.has(run.status)) throw new EngineError('RUN_TERMINAL', 'Abgeschlossener Lauf kann nicht pausiert werden');
    db.prepare('UPDATE engine_runs SET status=?,updated_at=? WHERE id=?').run('PAUSED', now(), runId);
    event(runId, 'RUN_PAUSED', { actor, currentStep: run.current_step });
    return getRun(runId);
  });

  const increaseBudget = (runId, newLimit, actor) => transaction(() => {
    const run = rawRun(runId);
    const limit = Number(newLimit);
    if (!Number.isFinite(limit) || limit <= run.budget_limit || limit < run.budget_used) {
      throw new EngineError('INVALID_BUDGET', 'Das neue Budget muss über dem bisherigen Limit liegen', 400);
    }
    db.prepare('UPDATE engine_runs SET budget_limit=?,status=?,updated_at=? WHERE id=?')
      .run(limit, run.status === 'PAUSED_BUDGET' ? 'PAUSED' : run.status, now(), runId);
    event(runId, 'BUDGET_INCREASED', { actor, previous: run.budget_limit, next: limit });
    return getRun(runId);
  });

  const requestGate = (runId, payload, actor) => transaction(() => {
    const run = rawRun(runId);
    if (terminalStates.has(run.status)) throw new EngineError('RUN_TERMINAL', 'Für einen abgeschlossenen Lauf kann keine Freigabe angefordert werden');
    const definition = template(run.workflow_id, run.workflow_version);
    const step = definition.steps[run.current_step];
    if (!step?.requiresApproval) throw new EngineError('GATE_NOT_REQUIRED', 'Der aktuelle Schritt benötigt keine Freigabe', 400);
    const hash = payloadHash(payload);
    const existing = db.prepare('SELECT id FROM engine_gates WHERE run_id=? AND step_index=? AND payload_hash=?').get(runId, run.current_step, hash);
    const id = existing?.id || idFactory('GATE');
    if (!existing) db.prepare('INSERT INTO engine_gates(id,run_id,step_index,payload_hash,status,requested_by,requested_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, runId, run.current_step, hash, 'PENDING', actor, now());
    db.prepare('UPDATE engine_runs SET status=?,updated_at=? WHERE id=?').run('WAITING_GATE', now(), runId);
    event(runId, 'GATE_REQUESTED', { gateId: id, stepId: step.id, payloadHash: hash, actor });
    return { id, runId, stepId: step.id, payloadHash: hash, status: 'PENDING' };
  });

  const decideGate = (gateId, { decision, actor }) => transaction(() => {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new EngineError('INVALID_DECISION', 'Entscheidung muss APPROVED oder REJECTED sein', 400);
    const gate = db.prepare('SELECT * FROM engine_gates WHERE id=?').get(gateId);
    if (!gate) throw new EngineError('GATE_NOT_FOUND', 'Freigabe nicht gefunden', 404);
    if (gate.status !== 'PENDING') throw new EngineError('GATE_DECIDED', 'Freigabe wurde bereits entschieden');
    db.prepare('UPDATE engine_gates SET status=?,decided_by=?,decided_at=? WHERE id=?').run(decision, actor, now(), gateId);
    db.prepare('UPDATE engine_runs SET status=?,updated_at=? WHERE id=?').run(decision === 'APPROVED' ? 'PAUSED' : 'PAUSED_GATE_REJECTED', now(), gate.run_id);
    event(gate.run_id, `GATE_${decision}`, { gateId, actor, payloadHash: gate.payload_hash });
    return { id: gateId, runId: gate.run_id, payloadHash: gate.payload_hash, status: decision, decidedBy: actor };
  });

  const executeCurrentStep = (runId, { payload = {}, output = {}, cost = 0, actor = 'worker' } = {}) => transaction(() => {
    const run = rawRun(runId);
    if (run.status !== 'RUNNING') throw new EngineError('RUN_NOT_RUNNING', 'Lauf muss vor der Ausführung gestartet oder fortgesetzt werden');
    const definition = template(run.workflow_id, run.workflow_version);
    const step = definition.steps[run.current_step];
    if (!step) throw new EngineError('STEP_NOT_FOUND', 'Aktueller Schritt existiert nicht');
    const numericCost = Number(cost);
    if (!Number.isFinite(numericCost) || numericCost < 0) throw new EngineError('INVALID_COST', 'Kosten müssen eine nichtnegative Zahl sein', 400);
    if (run.budget_used + numericCost > run.budget_limit) {
      db.prepare('UPDATE engine_runs SET status=?,updated_at=? WHERE id=?').run('PAUSED_BUDGET', now(), runId);
      event(runId, 'BUDGET_STOP', { attemptedCost: numericCost, used: run.budget_used, limit: run.budget_limit });
      return getRun(runId);
    }
    const hash = payloadHash(payload);
    if (step.requiresApproval) {
      const gate = db.prepare("SELECT id FROM engine_gates WHERE run_id=? AND step_index=? AND payload_hash=? AND status='APPROVED'")
        .get(runId, run.current_step, hash);
      if (!gate) throw new EngineError('GATE_REQUIRED', 'Schreibender Schritt benötigt eine Freigabe für exakt diesen Payload-Hash', 403);
    }
    const timestamp = now();
    db.prepare('UPDATE engine_run_steps SET status=?,payload_hash=?,output_json=?,cost=?,started_at=COALESCE(started_at,?),completed_at=? WHERE run_id=? AND step_index=?')
      .run('COMPLETED', hash, stableStringify(output), numericCost, timestamp, timestamp, runId, run.current_step);
    const nextStep = run.current_step + 1;
    const complete = nextStep >= definition.steps.length;
    const checkpoint = step.checkpoint ? { stepIndex: run.current_step, stepId: step.id, output, payloadHash: hash, at: timestamp } : parseJson(run.checkpoint_json);
    db.prepare('UPDATE engine_runs SET status=?,current_step=?,budget_used=?,checkpoint_json=?,updated_at=? WHERE id=?')
      .run(complete ? 'COMPLETED' : 'RUNNING', nextStep, run.budget_used + numericCost, checkpoint ? stableStringify(checkpoint) : null, timestamp, runId);
    event(runId, 'STEP_COMPLETED', { actor, stepId: step.id, stepIndex: run.current_step, payloadHash: hash, cost: numericCost });
    if (complete) event(runId, 'RUN_COMPLETED', { budgetUsed: run.budget_used + numericCost });
    return getRun(runId);
  });

  const events = (runId) => {
    rawRun(runId);
    return db.prepare('SELECT id,type,detail_json,created_at FROM engine_events WHERE run_id=? ORDER BY id').all(runId)
      .map((row) => ({ id: row.id, type: row.type, detail: parseJson(row.detail_json, {}), createdAt: row.created_at }));
  };

  const listWorkflows = () => db.prepare('SELECT id,version,name,definition_hash,created_at FROM engine_workflow_templates ORDER BY id,version DESC').all()
    .map((row) => ({ id: row.id, version: row.version, name: row.name, definitionHash: row.definition_hash, createdAt: row.created_at }));

  const listRuns = ({ worldId } = {}) => {
    const rows = worldId
      ? db.prepare('SELECT * FROM engine_runs WHERE world_id=? ORDER BY created_at DESC').all(worldId)
      : db.prepare('SELECT * FROM engine_runs ORDER BY created_at DESC').all();
    return rows.map(mapRun);
  };

  const listGates = ({ runId, status } = {}) => {
    const clauses = [];
    const values = [];
    if (runId) { clauses.push('run_id=?'); values.push(runId); }
    if (status) { clauses.push('status=?'); values.push(status); }
    const sql = `SELECT * FROM engine_gates${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY requested_at DESC`;
    return db.prepare(sql).all(...values).map((row) => ({
      id: row.id,
      runId: row.run_id,
      stepIndex: row.step_index,
      payloadHash: row.payload_hash,
      status: row.status,
      requestedBy: row.requested_by,
      decidedBy: row.decided_by,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
    }));
  };

  return { defineWorkflow, createRun, getRun, listRuns, listWorkflows, listGates, start, pause, increaseBudget, requestGate, decideGate, executeCurrentStep, events };
}
