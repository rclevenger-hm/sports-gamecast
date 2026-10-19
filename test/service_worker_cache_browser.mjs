import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const assets = new Set(['index.html', 'gamecast.html', 'ticker.html', 'gamebar.html',
  'favorites.js', 'notifications.js', 'sport-visuals.js', 'listen-live.js',
  'manifest.webmanifest', 'app-icon.svg', 'sw.js']);
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/sports-gamecast/test-shell.html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Cache isolation test</title>');
    return;
  }
  const name = path === '/sports-gamecast/' ? 'index.html' : path.slice('/sports-gamecast/'.length);
  if (!path.startsWith('/sports-gamecast/') || !assets.has(name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL(name, root));
    response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : 'text/html' });
    response.end(body);
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

let browser;
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const appUrl = `${origin}/sports-gamecast/`;
  const current = `gamecast-shell:${appUrl}:v1`;
  const obsolete = `gamecast-shell:${appUrl}:v0`;
  const retained = ['portfolio-v3', 'gamecast-shell-v1', `gamecast-shell:${origin}/preview/:v1`];
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${appUrl}test-shell.html`);
  await page.evaluate(async ({ retained, obsolete, appUrl, origin }) => {
    for (const name of [...retained, obsolete]) {
      const cache = await caches.open(name);
      await cache.put(`${appUrl}index.html`, new Response(`foreign:${name}`));
      await cache.put(`${appUrl}favorites.js`, new Response(`foreign:${name}`));
      await cache.put(`${origin}/portfolio/data.json`, new Response('foreign data'));
    }
    await navigator.serviceWorker.register('./sw.js');
  }, { retained, obsolete, appUrl, origin });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  assert.deepEqual((await page.evaluate(() => caches.keys())).sort(), [...retained, current].sort(),
    'activation must remove only the obsolete owned cache');
  assert.deepEqual(await page.evaluate(async ({ retained, appUrl }) => Promise.all(retained.map(async name =>
    (await (await caches.open(name)).match(`${appUrl}index.html`)).text())), { retained, appUrl }),
  retained.map(name => `foreign:${name}`), 'unrelated cached data must remain intact');

  await context.setOffline(true);
  const offline = await page.evaluate(async origin => ({
    asset: await (await fetch('./favorites.js')).text(),
    fallback: await (await fetch('./gamecast.html?event=uncached')).text(),
    siblingRejected: await fetch(`${origin}/portfolio/data.json`).then(() => false, () => true),
  }), origin);
  assert.equal(offline.asset, await readFile(new URL('favorites.js', root), 'utf8'));
  assert.equal(offline.fallback, await readFile(new URL('index.html', root), 'utf8'));
  assert.equal(offline.siblingRejected, true, 'offline sibling requests must bypass this worker');
  console.log('Service-worker cache isolation passed in Chromium.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
