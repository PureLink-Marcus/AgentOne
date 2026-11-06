const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const source = path.resolve(__dirname, 'index.html');
  const output = path.resolve(__dirname, '..', '..', 'output', 'playwright');
  const issues = [];

  page.on('console', (message) => { if (message.type() === 'error') issues.push(message.text()); });
  page.on('pageerror', (error) => issues.push(error.message));

  for (const concept of ['orbit', 'garden']) {
    await page.goto(`${pathToFileURL(source).href}?concept=${concept}`, { waitUntil: 'load' });
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    if (layout.width > layout.viewport) issues.push(`${concept}: overflow ${layout.width - layout.viewport}px`);
    await page.screenshot({ path: path.join(output, `agentone-${concept}.png`), fullPage: true });
  }
  await browser.close();
  if (issues.length) throw new Error(issues.join('\n'));
})();
