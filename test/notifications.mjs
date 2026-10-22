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
const favoriteCardSelector = 'a.card[href*="401873285"]';

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
  window.__pushCalls = [];
  window.__holdSubscribe = true;
  window.__subscribed = false;
  window.SportsGamecastPush = {
    configured() { return true; },
    async getSubscription() { return window.__subscribed ? { endpoint: 'mock' } : null; },
    async sync(teamKeys, preferences) {
      window.__pushCalls.push({ type: 'sync', teamKeys: [...teamKeys], preferences: { ...preferences } });
      if (window.__holdSync) {
        window.__holdSync = false;
        await new Promise(resolve => { window.__finishSync = resolve; });
      }
      return window.__subscribed;
    },
    async subscribe(teamKeys, preferences) {
      window.__pushCalls.push({ type: 'subscribe', teamKeys: [...teamKeys], preferences: { ...preferences } });
      if (window.__holdSubscribe) await new Promise(resolve => { window.__finishSubscribe = resolve; });
      window.__subscribed = true;
      return { endpoint: 'mock' };
    },
    async unsubscribe() {
      window.__pushCalls.push({ type: 'unsubscribe' });
      if (window.__holdUnsubscribe) await new Promise(resolve => { window.__finishUnsubscribe = resolve; });
      window.__subscribed = false;
      return true;
    }
  };

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
  background: document.querySelector('.alerts-background')?.textContent,
  backgroundPressed: document.querySelector('.alerts-background')?.getAttribute('aria-pressed'),
  initialNotifications: window.__notifications.length
}));
assert('renders notification preferences', panel.exists, panel);
assert('restores enabled preference', panel.active === 'true', panel.active);
assert('renders five configurable alert categories', panel.options === 5, panel.options);
assert('shows explicit background alert opt-in when configured', panel.background === 'Enable background alerts', panel.background);
assert('background alerts start disabled without a subscription', panel.backgroundPressed === 'false', panel.backgroundPressed);
assert('baseline render does not notify', panel.initialNotifications === 0, panel.initialNotifications);
assert('favorite fixture renders', await page.locator(favoriteCardSelector).count() === 1);

await page.locator('.alerts-background').click();
await page.waitForFunction(() => typeof window.__finishSubscribe === 'function');
// Re-render the panel while enable is pending. Its replacement button must
// remain locked and the changed preference must be sent after enable completes.
await page.locator('.alerts-options input').last().uncheck();
assert('background enable remains disabled after a preference re-render', await page.locator('.alerts-background').isDisabled());
await page.evaluate(() => {
  document.querySelector('.alerts-background').click();
  window.__finishSubscribe();
});
await page.waitForFunction(() => window.__pushCalls.some(call => call.type === 'sync' && call.preferences.final === false));
assert('pending enable cannot be submitted twice', await page.evaluate(() => window.__pushCalls.filter(call => call.type === 'subscribe').length === 1));
assert('preference edited during enable is synchronized', await page.evaluate(() => window.__pushCalls.at(-1).preferences.final === false));
await page.locator('.alerts-options input').last().check();
await page.waitForFunction(() => window.__pushCalls.at(-1).preferences.final === true);
const pushState = await page.evaluate(() => ({
  calls: window.__pushCalls.slice(),
  text: document.querySelector('.alerts-background')?.textContent,
  pressed: document.querySelector('.alerts-background')?.getAttribute('aria-pressed')
}));
assert('background opt-in registers favorite-team preferences', pushState.calls.some(call => call.type === 'subscribe' && call.teamKeys.includes('nfl:lac') && call.preferences.final === true), pushState.calls);
assert('background opt-in reflects active state', pushState.text === 'Disable background alerts' && pushState.pressed === 'true', pushState);

// Return to the last acknowledged favorite set while an intermediate sync is
// pending. Completion must converge to the current favorites, not stale B.
await page.evaluate(selector => {
  window.__holdSync = true;
  localStorage.setItem('sports-gamecast-favorites-v1', JSON.stringify(['nfl:kc']));
  const score = document.querySelector(selector).querySelector('.sc');
  score.textContent = score.textContent;
}, favoriteCardSelector);
await page.waitForFunction(() => typeof window.__finishSync === 'function');
await page.evaluate(selector => {
  localStorage.setItem('sports-gamecast-favorites-v1', JSON.stringify(['nfl:lac']));
  const score = document.querySelector(selector).querySelector('.sc');
  score.textContent = score.textContent;
}, favoriteCardSelector);
await page.evaluate(() => window.__finishSync());
await page.waitForFunction(() => window.__pushCalls.at(-1).type === 'sync' && window.__pushCalls.at(-1).teamKeys.includes('nfl:lac'));
assert('favorite A to B to A converges after pending B completes', await page.evaluate(() => window.__pushCalls.at(-1).teamKeys.join(',') === 'nfl:lac'));

await page.evaluate(selector => {
  const card = document.querySelector(selector);
  card.querySelector('.game-status').innerHTML = '<span class="live"><span class="live-dot"></span>15:00 - 1st</span>';
}, favoriteCardSelector);
await page.waitForTimeout(80);

await page.evaluate(selector => {
  const rows = document.querySelector(selector).querySelectorAll('.row');
  rows[1].querySelector('.sc').textContent = '3';
}, favoriteCardSelector);
await page.waitForTimeout(80);

await page.evaluate(selector => {
  const rows = document.querySelector(selector).querySelectorAll('.row');
  rows[1].querySelector('.sc').textContent = '6';
}, favoriteCardSelector);
await page.waitForTimeout(80);

await page.evaluate(selector => {
  document.querySelector(selector).querySelector('.game-status .live').textContent = '2:30 - 4th';
}, favoriteCardSelector);
await page.waitForTimeout(80);

await page.evaluate(selector => {
  document.querySelector(selector).querySelector('.game-status').innerHTML = '<span class="final">Final</span>';
}, favoriteCardSelector);
await page.waitForTimeout(80);

const notifications = await page.evaluate(() => window.__notifications.slice());
const titles = notifications.map(n => n.title);
assert('notifies at game start', titles.includes('Game started'), titles);
assert('notifies on lead change', titles.includes('Lead change'), titles);
assert('notifies on score update', titles.includes('Score update'), titles);
assert('notifies on late-game transition', titles.includes('Late-game alert'), titles);
assert('notifies on final', titles.includes('Final'), titles);
assert('favorite score appears in alert body', notifications.some(n => String(n.body).includes('LAC 6')), notifications);

await page.evaluate(() => { window.__holdUnsubscribe = true; });
await page.locator('.alerts-background').click();
await page.waitForFunction(() => typeof window.__finishUnsubscribe === 'function');
await page.locator('.alerts-options input').last().uncheck();
assert('background disable remains locked after a preference re-render', await page.locator('.alerts-background').isDisabled());
await page.evaluate(() => {
  document.querySelector('.alerts-background').click();
  window.__finishUnsubscribe();
});
await page.waitForFunction(() => document.querySelector('.alerts-background').textContent === 'Enable background alerts');
assert('pending disable cannot be submitted twice', await page.evaluate(() => window.__pushCalls.filter(call => call.type === 'unsubscribe').length === 1));
assert('disable remains inactive after the pending preference edit', await page.locator('.alerts-background').getAttribute('aria-pressed') === 'false');

await browser.close();
if (failures.length) {
  console.error('\n' + failures.length + ' notification assertion(s) failed');
  process.exit(1);
}
console.log('\nFavorite-team notification tests passed.');
