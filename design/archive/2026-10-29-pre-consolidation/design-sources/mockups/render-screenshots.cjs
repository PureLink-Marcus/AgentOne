const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const source = path.resolve(__dirname, 'index.html');
  const output = path.resolve(__dirname, '..', '..', 'output', 'playwright');
  const screens = ['galaxy', 'connector', 'run', 'board'];
  const issues = [];

  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => issues.push(`page: ${error.message}`));

  for (const screen of screens) {
    const url = `${pathToFileURL(source).href}?screen=${screen}`;
    await page.goto(url, { waitUntil: 'load' });
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    if (layout.document > layout.viewport) {
      issues.push(`${screen}: horizontal overflow ${layout.document - layout.viewport}px`);
    }
    await page.screenshot({
      path: path.join(output, `agentone-${screen}.png`),
      fullPage: true,
    });
  }

  await browser.close();
  if (issues.length) {
    throw new Error(issues.join('\n'));
  }
})();
