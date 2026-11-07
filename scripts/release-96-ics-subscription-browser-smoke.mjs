import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const waitFor = async (url) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server nicht bereit: ${url}`);
};

const stop = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const policy = Object.freeze({
  readOnly: true,
  feedUrlEncrypted: true,
  feedUrlReturned: false,
  syncIntervalMinutes: 15,
  maxUploadBytes: 4 * 1024 * 1024,
  descriptionStored: false,
  locationStored: false,
  attendeesStored: false,
  userIsolated: true,
  secretsExposed: false,
});

function feedStatus({ endpointHash, eventCount, lastSuccessAt, nextSyncAt }) {
  return {
    schema: 'agentone.ics-calendar-status/v2',
    sourceType: 'FEED',
    endpointHash,
    eventCount,
    importedAt: lastSuccessAt,
    lastAttemptAt: lastSuccessAt,
    lastSuccessAt,
    failureCount: 0,
    lastErrorCode: null,
    nextAttemptAt: nextSyncAt,
    feedConnected: true,
    status: 'LIVE',
    cryptoReady: true,
    nextSyncAt,
    source: { type: 'https-ics', endpointHash },
    policy,
    stats: { parsed: eventCount, accepted: eventCount, deduplicated: 0, expired: 0 },
    ledger: { inserted: eventCount, updated: 0, deleted: 0, total: eventCount },
  };
}

const appPort = await freePort();
const proxyPort = await freePort();
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'agentone-ics-subscription-browser-'));
const internalToken = 'ics-subscription-browser-internal-token-with-enough-length';
const icsMasterKey = 'ics-subscription-browser-master-key-with-enough-length';
const origin = `http://127.0.0.1:${proxyPort}`;
const user = 'ics-browser-user';
const password = 'ics-browser-password-with-enough-length';
const authenticatedUser = 'ics-browser@local';
const webcalSecret = 'webcal://calendar.example.test/private.ics?token=release96-webcal-super-secret';
const httpsSecret = 'https://calendar.example.test/private.ics?token=release96-https-super-secret';
const secrets = [webcalSecret, httpsSecret];
const webcalHash = 'a'.repeat(64);
const httpsHash = 'b'.repeat(64);
const feedResponses = [
  feedStatus({ endpointHash: webcalHash, eventCount: 2, lastSuccessAt: '2026-11-07T08:15:00.000Z', nextSyncAt: '2026-11-07T08:30:00.000Z' }),
  feedStatus({ endpointHash: httpsHash, eventCount: 3, lastSuccessAt: '2026-11-07T09:15:00.000Z', nextSyncAt: '2026-11-07T09:30:00.000Z' }),
];
const syncResponse = feedStatus({ endpointHash: httpsHash, eventCount: 4, lastSuccessAt: '2026-11-07T09:20:00.000Z', nextSyncAt: '2026-11-07T09:35:00.000Z' });

const app = spawn(process.execPath, ['server/demo-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(appPort),
    AGENTONE_DATA_DIR: dataDir,
    DATABASE_URL: '',
    AGENTONE_BASIC_AUTH_USER: '',
    AGENTONE_BASIC_AUTH_PASSWORD: '',
    AGENTONE_INTERNAL_API_TOKEN: internalToken,
    AGENTONE_SECRET_KEY: 'ics-subscription-companion-pepper-with-at-least-32-bytes',
    AGENTONE_ICS_MASTER_KEY: icsMasterKey,
    AGENTONE_DEMO_MASTER_KEY: '',
    AGENTONE_HEALTH_MASTER_KEY: 'ics-subscription-health-key-with-enough-length',
    OPENAI_API_KEY: '',
  },
  stdio: 'ignore',
});

let proxy;
let browser;
let releaseFirstFeed;
try {
  await waitFor(`http://127.0.0.1:${appPort}/api/health`);
  proxy = spawn(process.execPath, ['server/basic-proxy.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(proxyPort),
      UPSTREAM_URL: `http://127.0.0.1:${appPort}`,
      PERSONAL_API_URL: `http://127.0.0.1:${appPort}`,
      PERSONAL_API_TOKEN: internalToken,
      BASIC_AUTH_USER: user,
      BASIC_AUTH_PASSWORD: password,
      AUTHENTICATED_USER: authenticatedUser,
      AGENTONE_DISPLAY_NAME: 'Günni',
      AGENTONE_INSTANCE_TYPE: 'personal',
      AGENTONE_RELEASE: '2026.11.07-96',
      ACCESS_SESSION_SECRET: 'ics-subscription-session-secret-with-enough-length',
      PUBLIC_ORIGIN: origin,
      OPENAI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  await waitFor(`${origin}/proxy-health`);

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  const requestUrls = [];
  const feedCalls = [];
  const syncCalls = [];
  const realStatusResponses = [];
  const firstFeedGate = new Promise((resolve) => { releaseFirstFeed = resolve; });

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requestUrls.push(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
    const parsed = new URL(response.url());
    if (response.request().method() === 'GET' && parsed.pathname === '/agentone/calendar/ics') {
      realStatusResponses.push(response.status());
    }
  });

  await page.route('**/agentone/calendar/ics/feed', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    const input = request.postDataJSON();
    const index = feedCalls.length;
    feedCalls.push(input);
    if (index === 0) await firstFeedGate;
    const body = feedResponses[index];
    assert.ok(body, `Unerwarteter Feed-Aufruf ${index + 1}`);
    for (const secret of secrets) assert.equal(JSON.stringify(body).includes(secret), false);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/agentone/calendar/ics/sync', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    syncCalls.push(request.postDataJSON());
    for (const secret of secrets) assert.equal(JSON.stringify(syncResponse).includes(secret), false);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(syncResponse) });
  });

  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Benutzername').fill(user);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: /Sicher anmelden/ }).click();
  await page.waitForURL(`${origin}/`);
  await page.locator('[data-view="tools"]').click();

  const card = page.locator('.ics-calendar-card');
  const feedInput = card.locator('#ics-calendar-feed-url');
  await card.waitFor({ timeout: 15_000 }).catch(async (error) => {
    const diagnostics = await page.evaluate(() => ({
      url: location.href,
      profile: document.documentElement.dataset.instanceProfile,
      activeView: document.querySelector('.view.active')?.id || null,
      toolsButtons: [...document.querySelectorAll('[data-view="tools"]')].map((node) => ({ text: node.textContent, hidden: node.hidden })),
      calendarCards: document.querySelectorAll('.ics-calendar-card').length,
      bodyText: document.body.innerText.slice(0, 500),
    }));
    throw new Error(`${error.message}\n${JSON.stringify({ diagnostics, pageErrors, consoleErrors })}`);
  });
  await page.waitForFunction(() => document.querySelector('#ics-calendar-state')?.textContent === 'NOT_CONNECTED');
  const initialStatus = await page.evaluate(async () => {
    const response = await fetch('/agentone/calendar/ics', { headers: { accept: 'application/json' }, cache: 'no-store' });
    return { status: response.status, data: await response.json() };
  });
  assert.equal(initialStatus.status, 200);
  assert.equal(initialStatus.data.schema, 'agentone.ics-calendar-status/v2');
  assert.equal(initialStatus.data.status, 'NOT_CONNECTED');
  assert.equal(initialStatus.data.cryptoReady, true);
  assert.equal(initialStatus.data.feedConnected, false);
  assert.equal(initialStatus.data.policy.secretsExposed, false);
  assert.ok(realStatusResponses.includes(200), JSON.stringify(realStatusResponses));

  const firstRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/agentone/calendar/ics/feed');
  await feedInput.fill(webcalSecret);
  await card.getByRole('button', { name: 'Link sicher verbinden' }).click();
  await firstRequest;
  assert.equal(await feedInput.inputValue(), '', 'Feed-Link muss vor der Serverantwort aus dem Feld entfernt sein');
  assert.match(await card.locator('#ics-calendar-status').innerText(), /wird geprüft, verschlüsselt und synchronisiert/i);
  assert.equal((await page.content()).includes(webcalSecret), false);
  releaseFirstFeed();
  await page.waitForFunction(() => document.querySelector('#ics-calendar-count')?.textContent === '2');
  assert.deepEqual(feedCalls[0], { url: webcalSecret });
  assert.equal(await card.locator('#ics-calendar-state').innerText(), 'LIVE');
  assert.equal(await card.locator('#ics-calendar-source').innerText(), `ABO · ${webcalHash.slice(0, 12)}`);

  await feedInput.fill(httpsSecret);
  await card.getByRole('button', { name: 'Link sicher verbinden' }).click();
  await page.waitForFunction(() => document.querySelector('#ics-calendar-count')?.textContent === '3');
  assert.deepEqual(feedCalls[1], { url: httpsSecret });
  assert.equal(await feedInput.inputValue(), '');
  assert.equal(await card.locator('#ics-calendar-state').innerText(), 'LIVE');
  assert.equal(await card.locator('#ics-calendar-source').innerText(), `ABO · ${httpsHash.slice(0, 12)}`);
  assert.equal(await card.locator('#ics-calendar-count').innerText(), '3');
  assert.notEqual(await card.locator('#ics-calendar-success').innerText(), '—');
  assert.notEqual(await card.locator('#ics-calendar-next').innerText(), '—');
  assert.match(await card.locator('#ics-calendar-status').innerText(), /LIVE · 3 Termin\(e\) · geheimer Link bleibt verschlüsselt/);

  const guide = card.locator('.ics-calendar-guide');
  await guide.locator('summary').click();
  assert.match(await guide.innerText(), /iCloud:/);
  assert.match(await guide.innerText(), /Google:/);
  assert.match(await guide.innerText(), /Outlook:/);
  assert.match(await guide.innerText(), /Privatadresse im iCal-Format/);

  const secretAudit = await page.evaluate(() => {
    const storageEntries = (storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index);
      return [key, storage.getItem(key)];
    }));
    const root = document.querySelector('.ics-calendar-card');
    const visibleValues = [...root.querySelectorAll('input,textarea,select')].map((field) => field.value);
    return {
      dom: document.documentElement.outerHTML,
      painted: `${root.innerText}\n${visibleValues.join('\n')}`,
      localStorage: storageEntries(localStorage),
      sessionStorage: storageEntries(sessionStorage),
    };
  });
  for (const secret of secrets) {
    assert.equal(secretAudit.dom.includes(secret), false, 'Secret darf nicht im DOM stehen');
    assert.equal(secretAudit.painted.includes(secret), false, 'Secret darf nicht gerendert werden');
    assert.equal(JSON.stringify(secretAudit.localStorage).includes(secret), false, 'Secret darf nicht in localStorage stehen');
    assert.equal(JSON.stringify(secretAudit.sessionStorage).includes(secret), false, 'Secret darf nicht in sessionStorage stehen');
  }

  const layout = await card.evaluate((root) => {
    const targets = [...root.querySelectorAll('button,summary,input')].map((node) => ({
      node,
      rect: node.getBoundingClientRect(),
    })).filter(({ node, rect }) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && !node.disabled && rect.width > 0 && rect.height > 0;
    });
    const rect = root.getBoundingClientRect();
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      rootLeft: Math.round(rect.left),
      rootRight: Math.round(rect.right),
      minTouchHeight: Math.min(...targets.map((target) => target.rect.height)),
      targetCount: targets.length,
    };
  });
  assert.equal(layout.width, 390);
  assert.equal(layout.scrollWidth, layout.width, JSON.stringify(layout));
  assert.ok(layout.rootLeft >= 0 && layout.rootRight <= layout.width, JSON.stringify(layout));
  assert.ok(layout.targetCount >= 6, JSON.stringify(layout));
  assert.ok(layout.minTouchHeight >= 44, JSON.stringify(layout));

  const screenshot = path.resolve('output/playwright/ics-subscription-release-96-mobile.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await card.screenshot({ path: screenshot });
  const screenshotBytes = await readFile(screenshot);
  for (const secret of secrets) {
    assert.equal(screenshotBytes.includes(Buffer.from(secret, 'utf8')), false, 'Secret darf nicht in der Screenshot-Datei stehen');
  }

  const syncedUi = page.evaluate(() => new Promise((resolve, reject) => {
    const root = document.querySelector('.ics-calendar-card');
    const snapshot = () => ({
      state: root.querySelector('#ics-calendar-state')?.textContent,
      source: root.querySelector('#ics-calendar-source')?.textContent,
      count: root.querySelector('#ics-calendar-count')?.textContent,
      last: root.querySelector('#ics-calendar-success')?.textContent,
      next: root.querySelector('#ics-calendar-next')?.textContent,
      status: root.querySelector('#ics-calendar-status')?.textContent,
    });
    const observer = new MutationObserver(() => {
      const current = snapshot();
      if (current.count === '4') {
        observer.disconnect();
        clearTimeout(timer);
        resolve(current);
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Manueller Sync wurde nicht gerendert: ${JSON.stringify(snapshot())}`));
    }, 5_000);
  }));
  const syncRequest = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/agentone/calendar/ics/sync');
  await card.locator('#ics-calendar-sync').click();
  await syncRequest;
  const syncUi = await syncedUi;
  assert.deepEqual(syncCalls, [{}]);
  assert.deepEqual(syncUi, {
    state: 'LIVE',
    source: `ABO · ${httpsHash.slice(0, 12)}`,
    count: '4',
    last: '07.11., 10:20',
    next: '07.11., 10:35',
    status: 'LIVE · 4 Termin(e) · geheimer Link bleibt verschlüsselt',
  });

  await page.waitForTimeout(250);
  assert.equal(feedCalls.length, 2);
  assert.equal(syncCalls.length, 1);
  assert.ok(requestUrls.some((url) => new URL(url).pathname === '/agentone/calendar/ics'));
  assert.ok(requestUrls.some((url) => new URL(url).pathname === '/agentone/calendar/ics/feed'));
  assert.ok(requestUrls.some((url) => new URL(url).pathname === '/agentone/calendar/ics/sync'));
  assert.deepEqual(pageErrors, []);
  const optionalFailures = /\/(?:agentone\/(?:home-assistant\/dashboard|local-models\/status)|api\/platform\/snapshot)$/;
  assert.deepEqual(failedResponses.filter((item) => !optionalFailures.test(new URL(item.url).pathname)), []);
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 503/.test(message));
  assert.deepEqual(unexpectedConsoleErrors, []);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    release: '2026.11.07-96',
    viewport: '390x844',
    protocols: ['webcal', 'https'],
    status: syncUi.state,
    endpointHash: httpsHash.slice(0, 12),
    eventCount: Number(syncUi.count),
    manualSync: true,
    providerGuide: ['iCloud', 'Google', 'Outlook'],
    realStatusGet: true,
    secretClearedBeforeResponse: true,
    secretAbsentFromDomStorageAndScreenshot: true,
    horizontalOverflow: false,
    minTouchHeight: layout.minTouchHeight,
    consoleErrors: unexpectedConsoleErrors.length,
    screenshot,
  })}\n`);
} finally {
  releaseFirstFeed?.();
  await browser?.close();
  await stop(proxy);
  await stop(app);
  await rm(dataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
