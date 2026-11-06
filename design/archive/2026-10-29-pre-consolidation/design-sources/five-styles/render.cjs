const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const styles = ['cosmos', 'blueprint', 'pixel', 'mycelium', 'mission'];
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const source = path.resolve(__dirname, 'index.html');
const output = path.resolve(__dirname, '..', '..', 'output', 'playwright');

(async () => {
  fs.mkdirSync(output, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });

  const issues = [];
  let activeStyle = 'startup';

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push(`${activeStyle}: console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    issues.push(`${activeStyle}: page: ${error.message}`);
  });

  try {
    for (const style of styles) {
      activeStyle = style;
      const url = `${pathToFileURL(source).href}?style=${encodeURIComponent(style)}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts?.ready);

      const layout = await page.evaluate((expectedStyle) => {
        const selected = document.querySelector(`[data-style="${expectedStyle}"]`);
        return {
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
          selectedExists: Boolean(selected),
          selectedHidden: selected ? selected.hidden : true,
        };
      }, style);

      const renderedWidth = Math.max(layout.documentWidth, layout.bodyWidth);
      if (renderedWidth > layout.viewportWidth) {
        issues.push(`${style}: horizontal overflow ${renderedWidth - layout.viewportWidth}px`);
      }
      if (!layout.selectedExists || layout.selectedHidden) {
        issues.push(`${style}: selected concept is missing or hidden`);
      }

      await page.screenshot({
        path: path.join(output, `agentone-style-${style}.png`),
        fullPage: false,
      });
    }
  } finally {
    await browser.close();
  }

  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }

  process.stdout.write(`Rendered ${styles.length} styles to ${output}\n`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

