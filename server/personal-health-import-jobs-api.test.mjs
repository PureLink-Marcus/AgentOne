import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(url) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await delay(50); } throw new Error('server not ready'); }
async function stop(child) { if (child.exitCode != null) return; child.kill(); await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5_000)]); }
function headers(token, userId, extra = {}) { return { 'x-agentone-internal-token': token, 'x-agentone-user': userId, ...extra }; }

test('persistent import-job API streams, isolates, completes and projects only safe counters', { timeout: 60_000 }, async () => {
  const port = await freePort(), dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentone-health-jobs-api-'));
  const token = 'release-102-internal-token-for-tests', origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/demo-server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AGENTONE_DATA_DIR: dataDir, DATABASE_URL: '', AGENTONE_BASIC_AUTH_USER: '', AGENTONE_BASIC_AUTH_PASSWORD: '', AGENTONE_INTERNAL_API_TOKEN: token, AGENTONE_HEALTH_MASTER_KEY: 'release-102-health-master-key-for-api-tests-0001', AGENTONE_DEMO_MASTER_KEY: '' },
    stdio: 'ignore',
  });
  try {
    await waitFor(`${origin}/api/health`);
    const consentResponse = await fetch(`${origin}/api/internal/personal/health/consents`, { method: 'POST', headers: headers(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ scopes: ['activity'] }) });
    assert.equal(consentResponse.status, 201); const consentId = (await consentResponse.json()).consent.id;
    const xml = '<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="2026-11-07 07:00:00 +0100" endDate="2026-11-07 08:00:00 +0100" value="4200"/></HealthData>';
    const uploadHeaders = headers(token, 'alice', { 'content-type': 'application/xml', 'x-agentone-health-file-name': 'export.xml', 'x-agentone-health-consent-id': consentId, 'x-agentone-human-actor': 'alice', 'x-agentone-human-action': 'health-import-confirmed' });

    const denied = await fetch(`${origin}/api/internal/personal/health/import-jobs`, { method: 'POST', headers: headers(token, 'alice', { 'content-type': 'application/xml', 'x-agentone-health-file-name': 'export.xml', 'x-agentone-health-consent-id': consentId }), body: xml });
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'COMMAND_HUMAN_GATE_REQUIRED');
    const created = await fetch(`${origin}/api/internal/personal/health/import-jobs`, { method: 'POST', headers: uploadHeaders, body: xml });
    assert.equal(created.status, 202); const createdPayload = await created.json(), jobId = createdPayload.job.id;
    assert.equal(createdPayload.secretsExposed, false); assert.ok(['QUEUED', 'RUNNING', 'COMPLETED'].includes(createdPayload.job.state));

    let completed;
    for (let i = 0; i < 100; i += 1) {
      const response = await fetch(`${origin}/api/internal/personal/health/import-jobs/${jobId}`, { headers: headers(token, 'alice') });
      assert.equal(response.status, 200); completed = await response.json();
      if (completed.job.state === 'COMPLETED') break;
      await delay(50);
    }
    assert.equal(completed.job.state, 'COMPLETED'); assert.equal(completed.job.result.recordsSeen, 1); assert.equal(completed.job.result.metrics, 1);
    assert.equal(completed.job.result.inserted, 1); assert.equal(completed.job.canCancel, false); assert.equal(completed.secretsExposed, false);
    const serialized = JSON.stringify(completed);
    for (const forbidden of [consentId, '<HealthData>', '4200', 'cipherPath', 'sourceHash', 'cipherIv', 'cipherTag', 'commandRunId', 'userId']) assert.equal(serialized.includes(forbidden), false, forbidden);

    const listed = await fetch(`${origin}/api/internal/personal/health/import-jobs`, { headers: headers(token, 'alice') }).then((response) => response.json());
    assert.equal(listed.jobs[0].id, jobId); assert.equal(listed.secretsExposed, false);
    assert.equal((await fetch(`${origin}/api/internal/personal/health/import-jobs/${jobId}`, { headers: headers(token, 'bob') })).status, 404);
    assert.equal((await fetch(`${origin}/api/internal/personal/health/import-jobs?leak=value`, { headers: headers(token, 'alice') })).status, 400);

    const duplicate = await fetch(`${origin}/api/internal/personal/health/import-jobs`, { method: 'POST', headers: uploadHeaders, body: xml });
    assert.equal(duplicate.status, 202); assert.equal((await duplicate.json()).job.id, jobId);
    for (let i = 0; i < 50 && fs.readdirSync(path.join(dataDir, 'health-import-quarantine')).some((name) => name.endsWith('.a1h')); i += 1) await delay(25);
    assert.deepEqual(fs.readdirSync(path.join(dataDir, 'health-import-quarantine')).filter((name) => name.endsWith('.a1h')), []);

    const terminalDelete = await fetch(`${origin}/api/internal/personal/health/import-jobs/${jobId}`, { method: 'DELETE', headers: headers(token, 'alice') });
    assert.equal(terminalDelete.status, 200); assert.equal((await terminalDelete.json()).job.state, 'COMPLETED');
    const tooLarge = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/internal/personal/health/import-jobs', headers: { ...uploadHeaders, 'content-length': String(512 * 1024 * 1024 + 1) } }, (response) => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      request.once('error', reject); request.end();
    });
    assert.equal(tooLarge, 413);
  } finally { await stop(child); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }); }
});
