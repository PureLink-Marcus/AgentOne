import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

async function waitFor(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Demo-Server wurde nicht bereit');
}

function internalHeaders(token, userId, extra = {}) {
  return { 'x-agentone-internal-token': token, 'x-agentone-user': userId, ...extra };
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill();
  });
}

test('personal health API persists user-isolated scoped imports and requires confirmations', async () => {
  const port = await freePort(), dataDir = mkdtempSync(path.join(os.tmpdir(), 'agentone-health-api-'));
  const token = 'health-internal-test-token-with-enough-length', origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/demo-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1', PORT: String(port), AGENTONE_DATA_DIR: dataDir, DATABASE_URL: '',
      AGENTONE_BASIC_AUTH_USER: '', AGENTONE_BASIC_AUTH_PASSWORD: '', AGENTONE_INTERNAL_API_TOKEN: token,
      AGENTONE_HEALTH_MASTER_KEY: 'health-test-master-key-that-is-never-committed', AGENTONE_DEMO_MASTER_KEY: '',
    },
    stdio: 'ignore',
  });
  try {
    await waitFor(`${origin}/api/health`);
    const forbidden = await fetch(`${origin}/api/internal/personal/health`, { headers: internalHeaders('wrong-token', 'alice') });
    assert.equal(forbidden.status, 403);
    for(const path of ['/api/internal/personal/health/digest','/api/internal/personal/health/comparison'])assert.equal((await fetch(origin+path,{headers:internalHeaders('wrong-token','alice')})).status,403,path);

    const statusResponse = await fetch(`${origin}/api/internal/personal/health`, { headers: internalHeaders(token, 'alice') }); assert.match(statusResponse.headers.get('cache-control'), /no-store/); const status = await statusResponse.json();
    assert.equal(status.encryptionReady, true); assert.equal(status.importJobsReady, true); assert.equal(status.policy.persistentImportJobs, true); assert.equal(status.policy.medicalDiagnosis, false); assert.equal(status.policy.secretsExposed, false);
    const invalidStatusQuery=await fetch(`${origin}/api/internal/personal/health?extra=private-value`,{headers:internalHeaders(token,'alice')});assert.equal(invalidStatusQuery.status,400);assert.match(invalidStatusQuery.headers.get('cache-control'),/no-store/);const invalidStatusPayload=await invalidStatusQuery.json();assert.equal(invalidStatusPayload.error,'HEALTH_QUERY_INVALID');assert.equal(JSON.stringify(invalidStatusPayload).includes('private-value'),false);

    const created = await fetch(`${origin}/api/internal/personal/health/consents`, {
      method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ scopes: ['sleep'] }),
    });
    assert.equal(created.status, 201); const consentId = (await created.json()).consent.id;

    const bobConsents = await fetch(`${origin}/api/internal/personal/health/consents`, { headers: internalHeaders(token, 'bob') }).then((response) => response.json());
    assert.deepEqual(bobConsents.consents, []);

    const metricDay=new Date(Date.now()-2*86_400_000).toISOString().slice(0,10),previousDay=new Date(Date.now()-3*86_400_000).toISOString().slice(0,10);
    const xml = `<?xml version="1.0"?><HealthData>
      <Record type="HKQuantityTypeIdentifierStepCount" unit="count" startDate="${metricDay} 07:00:00 +0100" endDate="${metricDay} 08:00:00 +0100" value="4200"/>
      <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="${previousDay} 23:00:00 +0100" endDate="${metricDay} 00:30:00 +0100"/>
      <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" startDate="${metricDay} 08:00:00 +0100" endDate="${metricDay} 08:01:00 +0100" value="70"/>
      <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="${metricDay} 08:00:00 +0100" endDate="${metricDay} 08:00:00 +0100" value="80"/>
      <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="45" startDate="${metricDay} 18:00:00 +0100" endDate="${metricDay} 18:45:00 +0100"/>
    </HealthData>`;
    const uploadHeaders = internalHeaders(token, 'alice', { 'content-type': 'application/xml', 'x-agentone-health-consent-id': consentId, 'x-agentone-human-actor': 'alice', 'x-agentone-human-action': 'health-import-confirmed' });
    const deniedImport = await fetch(`${origin}/api/internal/personal/health/apple-import`, { method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/xml', 'x-agentone-health-consent-id': consentId }), body: xml });
    assert.equal(deniedImport.status, 403); const deniedPayload = await deniedImport.json(); assert.equal(deniedPayload.error, 'COMMAND_HUMAN_GATE_REQUIRED'); assert.equal(deniedPayload.commandStream.run.status, 'FAILED');
    const imported = await fetch(`${origin}/api/internal/personal/health/apple-import`, { method: 'POST', headers: uploadHeaders, body: xml });
    assert.equal(imported.status, 201); const importedPayload = await imported.json();
    assert.equal(importedPayload.import.normalizedMetrics, 1); assert.equal(importedPayload.import.excludedByConsent.count, 4);
    assert.deepEqual(importedPayload.import.excludedByConsent.metricTypes, ['body_mass_kg', 'heart_rate_bpm', 'steps', 'workout_minutes']);
    assert.equal(importedPayload.policy.medicalDiagnosis, false); assert.equal(importedPayload.policy.sourceArchiveRetained, false);
    assert.equal(importedPayload.commandStream.run.status, 'COMPLETED'); assert.deepEqual(importedPayload.commandStream.steps.map((step) => step.type), ['OBSERVE', 'TOOL', 'APPROVAL', 'RESULT']);
    const publicTimeline = JSON.stringify(importedPayload.commandStream); assert.equal(publicTimeline.includes('4200'), false); assert.equal(publicTimeline.includes('<HealthData>'), false); assert.equal(publicTimeline.includes('payloadHash'), false);
    const commandListResponse = await fetch(`${origin}/api/internal/personal/commands?limit=5`, { headers: internalHeaders(token, 'alice') }); assert.equal(commandListResponse.status, 200); const commandList = await commandListResponse.json(); assert.equal(commandList.runs[0].label, 'Apple Health sicher importieren'); assert.equal(JSON.stringify(commandList).includes('4200'), false);
    const commandTimelineResponse = await fetch(`${origin}/api/internal/personal/commands/${importedPayload.commandStream.run.id}`, { headers: internalHeaders(token, 'alice') }); assert.equal(commandTimelineResponse.status, 200); assert.equal((await commandTimelineResponse.json()).run.status, 'COMPLETED');
    const foreignTimeline = await fetch(`${origin}/api/internal/personal/commands/${importedPayload.commandStream.run.id}`, { headers: internalHeaders(token, 'bob') }); assert.equal(foreignTimeline.status, 404);

    const duplicate = await fetch(`${origin}/api/internal/personal/health/apple-import`, { method: 'POST', headers: uploadHeaders, body: xml });
    assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).import.alreadyImported, true);

    const aliceStatusAfterImport=await fetch(`${origin}/api/internal/personal/health`,{headers:internalHeaders(token,'alice')}).then(response=>response.json()),bobStatusAfterImport=await fetch(`${origin}/api/internal/personal/health`,{headers:internalHeaders(token,'bob')}).then(response=>response.json());assert.equal(aliceStatusAfterImport.store.metrics,1);assert.equal(bobStatusAfterImport.store.metrics,0);

    const aliceDigestResponse = await fetch(`${origin}/api/internal/personal/health/digest`, { headers: internalHeaders(token, 'alice') });assert.match(aliceDigestResponse.headers.get('cache-control'),/no-store/);const aliceDigest=await aliceDigestResponse.json();
    const bobDigestResponse = await fetch(`${origin}/api/internal/personal/health/digest`, { headers: internalHeaders(token, 'bob') });assert.match(bobDigestResponse.headers.get('cache-control'),/no-store/);const bobDigest=await bobDigestResponse.json();
    assert.equal(aliceDigest.metricCount, 1); assert.equal(bobDigest.metricCount, 0); assert.match(aliceDigest.digest.disclaimer, /Keine Diagnose/);
    for(const query of ['extra=1','source=apple_health&source=whoop','source=other','from=2026-02-30']){const invalid=await fetch(`${origin}/api/internal/personal/health/digest?${query}`,{headers:internalHeaders(token,'alice')});assert.equal(invalid.status,400,query);assert.equal((await invalid.json()).error,'HEALTH_QUERY_INVALID');}

    const comparisonResponse=await fetch(`${origin}/api/internal/personal/health/comparison?periodDays=7&minimumCoverageDays=1&timeZone=Europe%2FBerlin`,{headers:internalHeaders(token,'alice')});
    assert.equal(comparisonResponse.status,200);assert.match(comparisonResponse.headers.get('cache-control'),/no-store/);const comparison=await comparisonResponse.json();
    assert.equal(comparison.schema,'agentone.personal-health-comparison/v1');assert.equal(comparison.sources.apple_health.coverageDays,1);assert.equal(comparison.sources.whoop.status,'missing');assert.deepEqual(comparison.comparisons,[]);assert.equal(comparison.policy.medicalDiagnosis,false);assert.equal(comparison.policy.secretsExposed,false);
    const serializedComparison=JSON.stringify(comparison);assert.equal(serializedComparison.includes(consentId),false);assert.equal(serializedComparison.includes('sourceRecordId'),false);assert.equal(serializedComparison.includes('<HealthData>'),false);assert.equal(serializedComparison.includes('4200'),false);
    const bobComparison=await fetch(`${origin}/api/internal/personal/health/comparison?periodDays=7&minimumCoverageDays=1&timeZone=UTC`,{headers:internalHeaders(token,'bob')}).then(response=>response.json());assert.equal(bobComparison.sources.apple_health.coverageDays,0);
    for(const query of ['extra=1','periodDays=7&periodDays=8','periodDays=0','periodDays=91','periodDays=seven','periodDays=2&minimumCoverageDays=3','timeZone=America%2FNew_York']){
      const invalid=await fetch(`${origin}/api/internal/personal/health/comparison?${query}`,{headers:internalHeaders(token,'alice')});assert.equal(invalid.status,400,query);const payload=await invalid.json();assert.equal(payload.error,'HEALTH_COMPARISON_QUERY_INVALID');assert.equal(payload.secretsExposed,false);
    }

    const unconfirmedExport = await fetch(`${origin}/api/internal/personal/health/export`, { method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: '{}' });
    assert.equal(unconfirmedExport.status, 409);
    const exported = await fetch(`${origin}/api/internal/personal/health/export`, { method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ confirm: 'EXPORT_MY_HEALTH_DATA' }) });
    assert.equal(exported.status, 200); assert.match(exported.headers.get('content-disposition'), /agentone-health-export/); const exportPayload = await exported.json(); assert.equal(exportPayload.metrics.length, 1); assert.equal(exportPayload.warning, 'SENSITIVE_PLAINTEXT_EXPORT');

    const unconfirmedDelete = await fetch(`${origin}/api/internal/personal/health/data`, { method: 'DELETE', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: '{}' });
    assert.equal(unconfirmedDelete.status, 409);
    const deleted = await fetch(`${origin}/api/internal/personal/health/data`, { method: 'DELETE', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ confirm: 'DELETE_MY_HEALTH_DATA', includeConsents: true }) });
    assert.equal(deleted.status, 200); assert.equal((await deleted.json()).irreversible, true);
    const emptyDigest = await fetch(`${origin}/api/internal/personal/health/digest`, { headers: internalHeaders(token, 'alice') }).then((response) => response.json());
    assert.equal(emptyDigest.metricCount, 0);

    const replacementConsent = await fetch(`${origin}/api/internal/personal/health/consents`, { method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ scopes: ['activity'] }) }).then((response) => response.json());
    const tooLarge = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, path: '/api/internal/personal/health/apple-import', method: 'POST', headers: { ...internalHeaders(token, 'alice', { 'content-type': 'application/zip', 'x-agentone-health-consent-id': replacementConsent.consent.id }), 'content-length': String(32 * 1024 * 1024 + 1) } }, (response) => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      request.once('error', reject); request.end();
    });
    assert.equal(tooLarge, 413);
  } finally {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});

test('Graph client secret never enables health encryption', async () => {
  const port = await freePort(), dataDir = mkdtempSync(path.join(os.tmpdir(), 'agentone-health-key-'));
  const token = 'health-internal-test-token-with-enough-length', origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/demo-server.mjs'], {
    cwd: process.cwd(), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), AGENTONE_DATA_DIR: dataDir, DATABASE_URL: '', AGENTONE_BASIC_AUTH_USER: '', AGENTONE_BASIC_AUTH_PASSWORD: '', AGENTONE_INTERNAL_API_TOKEN: token, AGENTONE_HEALTH_MASTER_KEY: '', AGENTONE_DEMO_MASTER_KEY: '', GRAPH_CLIENT_SECRET: 'must-not-be-a-health-key' }, stdio: 'ignore',
  });
  try {
    await waitFor(`${origin}/api/health`);
    const status = await fetch(`${origin}/api/internal/personal/health`, { headers: internalHeaders(token, 'alice') }).then((response) => response.json());
    assert.equal(status.encryptionReady, false); assert.equal(status.importJobsReady, false); assert.equal(status.policy.persistentImportJobs, false); assert.deepEqual(status.consents, []);
    const comparison = await fetch(`${origin}/api/internal/personal/health/comparison`, { headers: internalHeaders(token, 'alice') });
    assert.equal(comparison.status, 503); assert.match(comparison.headers.get('cache-control'), /no-store/); assert.equal((await comparison.json()).error, 'HEALTH_ENCRYPTION_NOT_CONFIGURED');
    const create = await fetch(`${origin}/api/internal/personal/health/consents`, { method: 'POST', headers: internalHeaders(token, 'alice', { 'content-type': 'application/json' }), body: JSON.stringify({ scopes: ['activity'] }) });
    assert.equal(create.status, 503); assert.equal((await create.json()).error, 'HEALTH_ENCRYPTION_NOT_CONFIGURED');
  } finally {
    await stopChild(child);
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
});
