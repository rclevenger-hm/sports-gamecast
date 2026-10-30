import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const scriptPath = fileURLToPath(new URL('../listen-live.js', import.meta.url));
const failures = [];
function assert(name, cond, extra) {
  if (cond) console.log('  ok:', name);
  else { console.error('  FAIL:', name, extra ?? ''); failures.push(name); }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
await page.setContent('<!doctype html><html><head></head><body><section id="listenLiveBox"></section></body></html>');
await page.addScriptTag({ path: scriptPath });

const result = await page.evaluate(() => {
  const registry = {
    schemaVersion: 1,
    sources: [
      { id: 'home-radio', sport: 'nfl', scope: 'home', language: 'en', name: 'Home Radio', provider: 'Official Station', access: 'free', providerUrl: 'https://radio.example/listen', streamUrl: 'https://radio.example/live.mp3', directPlaybackAllowed: true },
      { id: 'national-pass', sport: 'nfl', scope: 'national', language: 'es', name: 'National Audio', provider: 'League Audio', access: 'subscription', providerUrl: 'https://league.example/audio', directPlaybackAllowed: false, notes: 'Authentication handled by provider.' },
      { id: 'unsafe-stream', sport: 'nfl', scope: 'away', language: 'en', name: 'Unsafe Direct', access: 'free', providerUrl: 'https://away.example', streamUrl: 'https://away.example/live.mp3', directPlaybackAllowed: false }
    ]
  };
  const mappings = { schemaVersion: 1, games: { 'game-1': { sources: [{ id: 'home-radio', scope: 'away' }, 'national-pass', { id: 'unsafe-stream', scope: 'home' }] } } };
  const rendered = window.GamecastListenLive.render({ container: document.getElementById('listenLiveBox'), eventId: 'game-1', registry, mappings });
  const box = document.getElementById('listenLiveBox');
  return {
    count: rendered.sources,
    names: Array.from(box.querySelectorAll('.listen-source-name')).map(n => n.textContent),
    badges: Array.from(box.querySelectorAll('.listen-source')).map(node => node.querySelector('.listen-badge')?.textContent || ''),
    audioCount: box.querySelectorAll('audio').length,
    audioSrc: box.querySelector('audio')?.getAttribute('src') || '',
    links: Array.from(box.querySelectorAll('a.listen-link')).map(a => ({ href: a.href, rel: a.rel })),
    text: box.textContent
  };
});

assert('renders all mapped known sources', result.count === 3, result);
assert('uses generated effective scope for ordering', result.names[0] === 'Unsafe Direct' && result.names[1] === 'Home Radio', result.names);
assert('uses generated effective scope for labels', result.badges[0] === 'home' && result.badges[1] === 'away', result.badges);
assert('only explicitly permitted direct stream gets audio control', result.audioCount === 1, result.audioCount);
assert('audio uses mapped HTTPS stream', result.audioSrc === 'https://radio.example/live.mp3', result.audioSrc);
assert('provider links use safe external-link attributes', result.links.length === 3 && result.links.every(l => l.rel.includes('noopener')), result.links);
assert('subscription restriction is surfaced', result.text.includes('Subscription required'), result.text);
assert('provider note is surfaced', result.text.includes('Authentication handled by provider.'), result.text);

const empty = await page.evaluate(() => {
  window.GamecastListenLive.render({ container: document.getElementById('listenLiveBox'), eventId: 'missing', registry: { schemaVersion: 1, sources: [] }, mappings: { schemaVersion: 1, games: {} } });
  return document.getElementById('listenLiveBox').textContent;
});
assert('unmapped games fail gracefully', empty.includes('No authorized audio source is mapped'), empty);

// Load the actual Gamecast page with the Listen Live script staged as production does.
// The scoreboard response is gated to exercise both script-before-selection and
// script-after-selection ordering without relying on timing or a live provider.
const gamecast = readFileSync(new URL('../gamecast.html', import.meta.url), 'utf8');
const summary = readFileSync(new URL('./mock_summary.json', import.meta.url), 'utf8');
const scoreboard = readFileSync(new URL('./mock_scoreboard.json', import.meta.url), 'utf8');
const registry = { sources: [{ id: 'radio', name: 'Selected Game Radio', providerUrl: 'https://radio.example/listen', streamUrl: 'https://radio.example/live.mp3', directPlaybackAllowed: true }] };
const mappings = { games: { '401873285': { sources: ['radio'] } } };
for (const scenario of [
  { name: 'auto-selected NHL game', query: '?sport=nhl', delayed: true },
  { name: 'auto-selected game before audio script loads', query: '?sport=nhl', lateScript: true },
  { name: 'explicit event', query: '?event=401873285' },
  { name: 'default NFL event', query: '' }
]) {
  const integration = await browser.newPage();
  const errors = [];
  integration.on('pageerror', error => errors.push(error.message));
  let releaseScoreboard, audioRequests = 0;
  const scoreboardGate = new Promise(resolve => { releaseScoreboard = resolve; });
  await integration.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'site.api.espn.com') {
      if (scenario.delayed && url.pathname.endsWith('/scoreboard')) await scoreboardGate;
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: url.pathname.endsWith('/summary') ? summary : scoreboard });
    }
    if (url.hostname !== 'gamecast.example') return route.abort();
    if (url.pathname.endsWith('/gamecast.html')) return route.fulfill({ contentType: 'text/html', body: gamecast });
    if (url.pathname.endsWith('/broadcast-registry.json') || url.pathname.endsWith('/broadcasts.json')) {
      audioRequests += 1;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/broadcast-registry.json') ? registry : mappings) });
    }
    return route.abort();
  });
  await integration.goto('https://gamecast.example/gamecast.html' + scenario.query);
  if (scenario.lateScript) await integration.waitForFunction(() => document.getElementById('gameUI').getAttribute('data-event-id') === '401873285');
  await integration.addScriptTag({ path: scriptPath });
  releaseScoreboard();
  await integration.locator('#listenLiveBox .listen-source-name').waitFor();
  assert(scenario.name + ' resolves the selected audio source', await integration.locator('#listenLiveBox').textContent().then(text => text.includes('Selected Game Radio')));
  assert(scenario.name + ' does not rewrite navigation', new URL(integration.url()).search === scenario.query);
  const samePlayer = await integration.evaluate(async () => {
    const audio = document.querySelector('#listenLiveBox audio');
    window.dispatchEvent(new Event('gamecast:event-selected'));
    await window.GamecastListenLive.mount();
    return audio === document.querySelector('#listenLiveBox audio');
  });
  assert(scenario.name + ' preserves player on repeated mount', samePlayer && audioRequests === 2, audioRequests);
  assert(scenario.name + ' has no JavaScript errors', errors.length === 0, errors);
  await integration.close();
}

await browser.close();
if (failures.length) process.exit(1);
console.log('Listen Live tests passed.');
