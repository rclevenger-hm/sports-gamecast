import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const raw = JSON.parse(readFileSync(new URL('./mock_scoreboard.json', import.meta.url), 'utf8'));
const game = raw.events[0];
game.status.type.state = 'pre';
game.status.type.shortDetail = 'Thu 7:00 PM';
game.competitions[0].competitors.forEach(c => { c.score = '0'; });
const scoreboard = JSON.stringify(raw);
const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));

const failures = [];
function assert(name, condition, extra) {
  if (condition) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra ?? ''); failures.push(name); }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext();
const page = await context.newPage();

await page.addInitScript(() => {
  localStorage.setItem('sports-gamecast-favorites-v1', JSON.stringify(['nfl:lac']));
  localStorage.setItem('sports-gamecast-notification-prefs-v1', JSON.stringify({
    enabled: true,
    gameStart: true,
    scoreChanges: true,
    leadChanges: true,
    lateGame: true,
    final: true
  }));

  window.__notifications = [];
  class MockNotification {
    static permission = 'granted';
    static requestPermission() { return Promise.resolve('granted'); }
    constructor(title, options) {
      this.title = title;
      this.options = options || {};
      window.__notifications.push({ title, body: this.options.body, tag: this.options.tag });
    }
    close() {}
  }
  Object.defineProperty(window, 'Notification', { configurable: true, value: MockNotification });
});

await page.route('**site.api.espn.com/**', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: scoreboard,
  headers: { 'access-control-allow-origin': '*' }
}));
await page.route('**a.espncdn.com/**', route => route.abort());

console.log('favorite-team notifications');
await page.goto('file://' + indexPath);
await page.waitForTimeout(1200);

const panel = await page.evaluate(() => ({
  exists: Boolean(document.querySelector('.alerts-panel')),
  active: document.querySelector('.alerts-enable')?.getAttribute('aria-pressed'),
  options: document.querySelectorAll('.alerts-options input').length,
  initialNotifications: window.__notifications.length
}));
assert('renders notification preferences', panel.exists, panel);
assert('restores enabled preference', panel.active === 'true', panel.active);
assert('renders five configurable alert categories', panel.options === 5, panel.options);
assert('baseline render does not notify', panel.initialNotifications === 0, panel.initialNotifications);

// Simulate kickoff for the favorite team.
await page.evaluate(() => {
  const card = document.querySelector('a.card');
  card.querySelector('.game-status').innerHTML = '<span class="live"><span class="live-dot"></span>15:00 - 1st</span>';
});
await page.waitForTimeout(80);

// Simulate a favorite-team score and lead change.
await page.evaluate(() => {
  const rows = document.querySelectorAll('a.card .row');
  rows[1].querySelector('.sc').textContent = '3';
});
await page.waitForTimeout(80);

// Simulate a score that does not change the leader.
await page.evaluate(() => {
  const rows = document.querySelectorAll('a.card .row');
  rows[1].querySelector('.sc').textContent = '6';
});
await page.waitForTimeout(80);

// Enter the late-game window.
await page.evaluate(() => {
  document.querySelector('a.card .game-status .live').textContent = '2:30 - 4th';
});
await page.waitForTimeout(80);

// Finish the game.
await page.evaluate(() => {
  document.querySelector('a.card .game-status').innerHTML = '<span class="final">Final</span>';
});
await page.waitForTimeout(80);

const notifications = await page.evaluate(() => window.__notifications.slice());
const titles = notifications.map(n => n.title);
assert('notifies at game start', titles.includes('Game started'), titles);
assert('notifies on lead change', titles.includes('Lead change'), titles);
assert('notifies on score update', titles.includes('Score update'), titles);
assert('notifies on late-game transition', titles.includes('Late-game alert'), titles);
assert('notifies on final', titles.includes('Final'), titles);
assert('favorite score appears in alert body', notifications.some(n => String(n.body).includes('LAC 6')), notifications);

await browser.close();
if (failures.length) {
  console.error('\n' + failures.length + ' notification assertion(s) failed');
  process.exit(1);
}
console.log('\nFavorite-team notification tests passed.');
