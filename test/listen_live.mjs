import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

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

await browser.close();
if (failures.length) process.exit(1);
console.log('Listen Live tests passed.');
