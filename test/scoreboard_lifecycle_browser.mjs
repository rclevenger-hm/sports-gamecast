import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = JSON.parse(readFileSync(new URL('./mock_scoreboard.json', import.meta.url), 'utf8'));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**a.espncdn.com/**', route => route.abort());
  await page.addInitScript(() => {
    window.pendingScoreboards = [];
    // Model responses already queued past abort, plus controlled visibility.
    window.fetch = (url, options) => new Promise((resolve, reject) => {
      window.pendingScoreboards.push({ options, succeed: data => resolve({ok: true, json: async () => data}), fail: () => reject(new Error('stale offline response')) });
    });
    let hidden = false;
    Object.defineProperty(document, 'hidden', {get: () => hidden});
    window.setHidden = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  });
  await page.goto('file://' + fileURLToPath(new URL('../index.html', import.meta.url)));
  await page.waitForFunction(() => window.pendingScoreboards.length === 1);
  await page.evaluate(() => { setHidden(true); setHidden(false); });
  await page.waitForFunction(() => window.pendingScoreboards.length === 2);
  await page.evaluate(data => pendingScoreboards[1].succeed(data), fixture);
  await page.waitForSelector('a.card');
  const current = await page.locator('#board').innerHTML();
  await page.evaluate(async () => { pendingScoreboards[0].succeed({events: []}); await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(await page.locator('#board').innerHTML(), current, 'old result must not replace current cards');
  assert.equal(await page.evaluate(() => pendingScoreboards[0].options.signal.aborted), true);

  await page.evaluate(() => { setHidden(true); setHidden(false); setHidden(true); setHidden(false); });
  await page.evaluate(data => pendingScoreboards[3].succeed(data), fixture);
  await page.evaluate(async () => { pendingScoreboards[2].fail(); await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(await page.locator('#errorBox').isVisible(), false, 'old error must remain hidden');
  await page.evaluate(() => { setHidden(true); setHidden(false); setHidden(true); });
  await page.evaluate(async data => { pendingScoreboards[4].succeed(data); await new Promise(resolve => setTimeout(resolve, 0)); }, fixture);
  assert.equal(await page.locator('#refreshPill').textContent(), 'updates paused');
  assert.deepEqual(errors, []);
  console.log('Scoreboard visibility and stale-response browser checks passed.');
} finally {
  await browser.close();
}
