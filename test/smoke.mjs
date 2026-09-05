// Smoke tests for the NFL Gamecast site.
// Runs both pages against a mocked ESPN API and asserts core UI renders.
// Locally in this sandbox: CHROMIUM_PATH=/opt/pw-browsers/chromium node smoke.mjs
// In CI: npx playwright install chromium --with-deps && node smoke.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const summary = readFileSync(new URL('./mock_summary.json', import.meta.url), 'utf8');
const scoreboard = readFileSync(new URL('./mock_scoreboard.json', import.meta.url), 'utf8');
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));
const gamecastPath = fileURLToPath(new URL('../gamecast.html', import.meta.url));

const failures = [];
function assert(name, cond, extra) {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra ?? ''); failures.push(name); }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ colorScheme: 'dark' });
const page = await ctx.newPage();
const jsErrors = [];
page.on('pageerror', e => jsErrors.push(String(e.message)));
await page.route('**site.api.espn.com/**', route => {
  const body = route.request().url().includes('/summary') ? summary : scoreboard;
  route.fulfill({ status: 200, contentType: 'application/json', body,
    headers: { 'access-control-allow-origin': '*' } });
});
await page.route('**a.espncdn.com/**', route => route.abort());

// ---------- index.html ----------
console.log('index.html');
await page.goto('file://' + indexPath);
await page.waitForTimeout(1200);
const idx = await page.evaluate(() => ({
  cards: document.querySelectorAll('a.card').length,
  live: document.querySelectorAll('.game-status .live').length,
  href: document.querySelector('a.card')?.getAttribute('href') || '',
  days: document.querySelectorAll('.daylabel').length,
  errHidden: document.getElementById('errorBox').classList.contains('hidden'),
  favoriteButtons: document.querySelectorAll('.favorite-row-button').length
}));
assert('renders game cards', idx.cards >= 2, idx);
assert('shows a live badge', idx.live >= 1);
assert('cards link to gamecast', idx.href.startsWith('gamecast.html?event='), idx.href);
assert('groups by day', idx.days >= 1);
assert('no error banner', idx.errHidden);
assert('adds an inline favorite control for each team row', idx.favoriteButtons >= 4, idx.favoriteButtons);

const firstFavorite = page.locator('.favorite-row-button').first();
await firstFavorite.click();
assert('inline favorite becomes selected', await firstFavorite.getAttribute('aria-pressed') === 'true');
assert('favorite persists in local storage', await page.evaluate(() => {
  const items = JSON.parse(localStorage.getItem('sports-gamecast-favorites-v1') || '[]');
  return items.length === 1 && items[0].startsWith('nfl:');
}));
await page.click('.my-teams-toggle');
const filtered = await page.evaluate(() => ({
  visible: Array.from(document.querySelectorAll('a.card')).filter(card => !card.classList.contains('favorite-hidden')).length,
  pressed: document.querySelector('.my-teams-toggle')?.getAttribute('aria-pressed')
}));
assert('My Teams filter activates', filtered.pressed === 'true', filtered);
assert('My Teams filter narrows the slate', filtered.visible === 1, filtered);

await page.click('#themeToggle');
assert('day/night toggle flips', await page.evaluate(() => document.body.classList.contains('light')));

// ---------- gamecast.html (saved light theme should carry over) ----------
console.log('gamecast.html');
await page.goto('file://' + gamecastPath + '?event=401873285');
await page.waitForTimeout(1500);
const gc = await page.evaluate(() => ({
  light: document.body.classList.contains('light'),
  away: document.querySelector('#teamAway .score').textContent.trim(),
  home: document.querySelector('#teamHome .score').textContent.trim(),
  clock: document.getElementById('statusClock').textContent,
  dd: document.getElementById('downDistance').textContent,
  drives: document.querySelectorAll('.drive').length,
  plays: document.querySelectorAll('.play').length,
  linescore: document.querySelectorAll('#linescore td').length,
  ball: document.getElementById('ballMarker').style.left,
  back: document.querySelector('.brand a')?.getAttribute('href')
}));
assert('theme persisted across pages', gc.light);
assert('away score renders', gc.away.startsWith('13'), gc.away);
assert('home score renders', gc.home.startsWith('10'), gc.home);
assert('live clock renders', gc.clock.includes('Q2'), gc.clock);
assert('down & distance renders', gc.dd.includes('2nd & 4'), gc.dd);
assert('drive accordions render', gc.drives >= 3, gc.drives);
assert('plays render', gc.plays >= 4, gc.plays);
assert('linescore renders', gc.linescore >= 12, gc.linescore);
assert('field position marker set', gc.ball.endsWith('%'), gc.ball);
assert('back link to scoreboard', gc.back === 'index.html', gc.back);

// tabs
for (const pane of ['paneScoring', 'paneBox', 'paneLeaders']) {
  await page.click(`.tab[data-pane="${pane}"]`);
  assert('tab switches: ' + pane, await page.evaluate(p => document.getElementById(p).classList.contains('active'), pane));
}
const boxRows = await page.evaluate(() => document.querySelectorAll('#paneBox table tr').length);
assert('box score rows', boxRows >= 5, boxRows);
const leaders = await page.evaluate(() => document.querySelectorAll('.leader-card').length);
assert('leader cards', leaders >= 2, leaders);
const scoring = await page.evaluate(() => document.querySelectorAll('.scoreplay').length);
assert('scoring summary entries', scoring >= 3, scoring);

assert('no JS errors on either page', jsErrors.length === 0, jsErrors);

await browser.close();
if (failures.length) { console.error('\n' + failures.length + ' assertion(s) failed'); process.exit(1); }
console.log('\nAll smoke tests passed.');
