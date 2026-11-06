const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const output = path.resolve(__dirname, '..', '..', 'output', 'playwright');
  fs.mkdirSync(output, { recursive: true });
  const sourceInside = pathToFileURL(path.resolve(__dirname, '..', 'five-styles', 'index.html')).href;
  const sourceOutside = pathToFileURL(path.resolve(__dirname, 'overview.html')).href;
  const shots = [
    { url: `${sourceInside}?style=cosmos&brand=purelink`, file: 'agentone-cosmos-inside-world.png' },
    { url: `${sourceOutside}?style=cosmos`, file: 'agentone-cosmos-outside-worlds.png' },
    { url: `${sourceInside}?style=pixel&brand=purelink`, file: 'agentone-pixel-inside-world.png' },
    { url: `${sourceOutside}?style=pixel`, file: 'agentone-pixel-outside-worlds.png' },
  ];
  const issues = [];
  page.on('console', m => { if (m.type() === 'error') issues.push(m.text()); });
  page.on('pageerror', e => issues.push(e.message));
  for (const shot of shots) {
    await page.goto(shot.url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, barlow: document.fonts.check('16px Barlow') }));
    if (size.width > size.viewport) issues.push(`${shot.file}: overflow ${size.width - size.viewport}px`);
    if (!size.barlow) issues.push(`${shot.file}: Barlow not loaded`);
    await page.screenshot({ path: path.join(output, shot.file), fullPage: false });
  }
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
  process.stdout.write('Rendered four world-level comparison screens\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
