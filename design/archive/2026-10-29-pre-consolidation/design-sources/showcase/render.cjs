const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const out = path.resolve(__dirname, '..', '..', 'output', 'playwright', 'agentone-interactive-showcase.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const issues = [];
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
  page.on('pageerror', error => issues.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, 'index.html')).href, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, ready: document.getElementById('screen').classList.contains('ready') }));
  if (size.width > size.viewport) issues.push(`overflow ${size.width - size.viewport}`);
  if (!size.ready) issues.push('iframe not ready');
  await page.screenshot({ path: out, fullPage: false });
  await page.click('[data-style="pixel"]');
  await page.waitForTimeout(350);
  await page.frameLocator('#screen').locator('.world-card').nth(2).click();
  await page.waitForTimeout(350);
  const interaction = await page.evaluate(() => ({ breadcrumb: document.getElementById('breadcrumb').textContent, levelActive: document.querySelector('[data-level="inside"]').classList.contains('active'), frameSrc: document.getElementById('screen').src }));
  if (!interaction.levelActive || !interaction.breadcrumb.includes('PUBLISH') || !interaction.frameSrc.includes('style=pixel') || !interaction.frameSrc.includes('world=publish')) issues.push(`interaction failed ${JSON.stringify(interaction)}`);
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
  process.stdout.write(`Rendered and verified ${out}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
