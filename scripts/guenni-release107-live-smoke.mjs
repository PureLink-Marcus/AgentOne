import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadEnv } from '../server/state.mjs';

const release = '2026.11.07-107';
const env = loadEnv(path.resolve('.'));
const origin = String(env.AGENTONE_GUENNI_ORIGIN || '').replace(/\/$/, '');
const user = env.AGENTONE_GUENNI_USER;
const password = env.AGENTONE_GUENNI_PASSWORD;
if (!origin || !user || !password) throw new Error('Günni-Live-Konfiguration fehlt.');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'de-DE'
});
const errors = [];
page.on('pageerror', error => errors.push(`page:${error.message}`));
page.on('console', message => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    errors.push(`console:${message.text()}`);
  }
});

async function api(pathName) {
  return page.evaluate(async requestedPath => {
    const response = await fetch(requestedPath, {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, ok: response.ok, data };
  }, pathName);
}

try {
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.locator('#username').fill(user);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL(`${origin}/`),
    page.getByRole('button', { name: 'Sicher anmelden' }).click()
  ]);

  const releaseState = await api('/agentone/release.json?smoke=release107-live');
  if (releaseState.data.release !== release) {
    throw new Error(`Live-Release ist ${releaseState.data.release} statt ${release}`);
  }

  const push = await api('/agentone/push');
  if (!push.ok || push.data.configured !== true || !push.data.vapidPublicKey) {
    throw new Error(`Push ist nicht bereit: ${JSON.stringify(push)}`);
  }
  const projection = JSON.stringify(push.data);
  for (const forbidden of ['endpoint', 'p256dh', 'authSecret', 'privateKey', 'masterKey']) {
    if (projection.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`Unsichere Push-Projektion: ${forbidden}`);
    }
  }
  if (push.data.policy?.explicitOptIn !== true || push.data.policy?.sensitiveContent !== false) {
    throw new Error('Push-Policy ist unvollständig.');
  }

  const worker = await page.evaluate(async () => {
    const response = await fetch('/service-worker.js', { cache: 'no-store' });
    return { status: response.status, body: await response.text() };
  });
  if (worker.status !== 200 || !worker.body.includes("addEventListener('push'") || !worker.body.includes('agentone.personal-push/v1')) {
    throw new Error('Release-107-Service-Worker fehlt.');
  }

  await page.locator('[data-view="tasks"]').click();
  const center = page.locator('#pwa-push-center');
  await center.waitFor();
  await center.locator('#push-state').waitFor();
  const copy = await center.innerText();
  if (!copy.includes('EXPLIZITES OPT-IN') || !copy.includes('Details öffnen sich erst nach der Anmeldung')) {
    throw new Error('Push-Einstellungstexte fehlen.');
  }

  const layout = await center.evaluate(root => {
    const buttons = [...root.querySelectorAll('button')].filter(item => getComputedStyle(item).display !== 'none');
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      minTouchHeight: Math.min(...buttons.map(item => Math.round(item.getBoundingClientRect().height))),
      visibleButtons: buttons.length
    };
  });
  if (layout.scrollWidth > layout.width || layout.minTouchHeight < 44 || layout.visibleButtons < 2) {
    throw new Error(`Mobiles Push-Layout ungültig: ${JSON.stringify(layout)}`);
  }

  await mkdir(path.resolve('output/playwright'), { recursive: true });
  const screenshot = path.resolve('output/playwright/guenni-release107-pwa-push-live-mobile.png');
  await center.screenshot({ path: screenshot });
  if (errors.length) throw new Error(`Browserfehler: ${errors.join(' | ')}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    origin,
    release,
    configured: true,
    subscriptionCount: push.data.subscriptionCount,
    explicitOptIn: true,
    sensitiveContent: false,
    serviceWorkerPush: true,
    layout,
    screenshot,
    consoleErrors: 0,
    secretsExposed: false,
    mutations: 0
  })}\n`);
} finally {
  await browser.close();
}
