const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const output = path.resolve(__dirname, '..', '..', 'output', 'playwright', 'agentone-purelink-hybrid.png');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const issues = [];
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
  page.on('pageerror', error => issues.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, 'index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const check = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, barlow: document.fonts.check('16px Barlow') }));
  if (check.width > check.viewport) issues.push(`horizontal overflow: ${check.width - check.viewport}px`);
  await page.screenshot({ path: output, fullPage: false });
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
  process.stdout.write(`Rendered ${output}; Barlow loaded: ${check.barlow}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
