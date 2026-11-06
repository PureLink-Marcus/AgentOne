const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const source = pathToFileURL(path.resolve(__dirname, 'index.html')).href;
  const output = path.resolve(__dirname, '..', '..', 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true });
  const issues = [];
  page.on('console', message => { if (message.type() === 'error') issues.push(message.text()); });
  page.on('pageerror', error => issues.push(error.message));
  for (const style of ['cosmos', 'pixel']) {
    await page.goto(`${source}?style=${style}&brand=purelink`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const check = await page.evaluate(expected => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      branded: document.body.classList.contains('purelink-brand'),
      selected: !document.querySelector(`[data-style="${expected}"]`).hidden,
      barlow: document.fonts.check('16px Barlow'),
      plex: document.fonts.check('12px IBM Plex Mono'),
    }), style);
    if (check.width > check.viewport) issues.push(`${style}: horizontal overflow ${check.width - check.viewport}px`);
    if (!check.branded || !check.selected || !check.barlow || !check.plex) issues.push(`${style}: branding/font check failed ${JSON.stringify(check)}`);
    await page.screenshot({ path: path.join(output, `agentone-style-${style}-purelink.png`), fullPage: false });
  }
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
  process.stdout.write('Rendered PureLink cosmos and pixel variants\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
