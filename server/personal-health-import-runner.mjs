import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  HEALTH_IMPORT_JOB_MAX_BYTES,
} from './personal-health-import-jobs.mjs';

const DEFAULT_WORKER = fileURLToPath(new URL('./personal-health-import-worker.mjs', import.meta.url));

function runnerError(code, message, status = 500) {
  return Object.assign(new Error(message), { code, status });
}

export async function runHealthImportWorker(job, {
  consent,
  masterSecret,
  databasePath,
  workerPath = DEFAULT_WORKER,
  timeoutMs = 15 * 60_000,
  maxBytes = HEALTH_IMPORT_JOB_MAX_BYTES,
  maxRecords = 300_000,
  signal,
  onPhase,
} = {}) {
  if (!job?.id || !job?.userId || !job?.cipherPath || !job?.cipherIv || !job?.cipherTag || !job?.sourceHash) {
    throw runnerError('HEALTH_IMPORT_SOURCE_MISSING', 'Importquelle fehlt', 422);
  }
  const child = spawn(process.execPath, ['--max-old-space-size=1536', workerPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { AGENTONE_HEALTH_MASTER_KEY: String(masterSecret || '') },
  });
  let stdout = '', stderrBytes = 0, settled = false, timer;
  const terminate = () => { if (!child.killed) child.kill(); };
  const abort = () => terminate();
  if (signal?.aborted) terminate(); else signal?.addEventListener?.('abort', abort, { once: true });
  child.stdout.setEncoding('utf8');
  child.stdin.on('error', () => {});
  child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 128 * 1024) terminate(); });
  child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; if (stderrBytes > 64 * 1024) terminate(); });
  const manifest = {
    jobId: job.id,
    userId: job.userId,
    consentId: job.consentId,
    inputPath: job.cipherPath,
    databasePath,
    iv: job.cipherIv,
    tag: job.cipherTag,
    sourceHash: job.sourceHash,
    consent,
    receivedAt: job.createdAt,
    maxBytes,
    maxRecords,
  };
  child.stdin.end(JSON.stringify(manifest));
  onPhase?.('PROCESSING', 35, child);
  try {
    const exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, exitSignal) => { settled = true; resolve({ code, signal: exitSignal }); });
      timer = setTimeout(() => { terminate(); reject(runnerError('HEALTH_IMPORT_WORKER_TIMEOUT', 'Worker-Zeitlimit überschritten', 504)); }, Math.max(1_000, Number(timeoutMs) || 15 * 60_000));
      timer.unref?.();
    });
    if (signal?.aborted) throw runnerError('HEALTH_IMPORT_CANCELLED', 'Import abgebrochen', 409);
    let response;
    try { response = JSON.parse(stdout); } catch { throw runnerError('HEALTH_IMPORT_WORKER_FAILED', 'Worker-Antwort ungültig'); }
    if (exit.code !== 0 || !response?.ok) throw runnerError(String(response?.error?.code || 'HEALTH_IMPORT_WORKER_FAILED'), 'Worker-Verarbeitung fehlgeschlagen', 422);
    onPhase?.('STORING', 85, child);
    if (!response.result?.importId) throw runnerError('HEALTH_IMPORT_WORKER_FAILED', 'Worker-Ergebnis fehlt');
    return response.result;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
    if (!settled) terminate();
  }
}

export const healthImportRunnerInternals = Object.freeze({ DEFAULT_WORKER });
