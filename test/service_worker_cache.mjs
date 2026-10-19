import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const appUrl = 'https://example.test/sports-gamecast/';
const currentCache = `gamecast-shell:${appUrl}:v1`;

function worker({ baseUrl = appUrl, stores = new Map(), network } = {}) {
  const handlers = new Map();
  const deleted = [];
  const opened = [];
  const installed = [];
  let claimed = 0;
  let skipped = 0;
  const requestUrl = request => new URL(typeof request === 'string' ? request : request.url, baseUrl).href;
  const cache = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async addAll(requests) {
        for (const request of requests) {
          installed.push(requestUrl(request));
          entries.set(requestUrl(request), new Response(`shell:${request}`));
        }
      },
      async put(request, response) { entries.set(requestUrl(request), response.clone()); },
      async match(request) { return entries.get(requestUrl(request))?.clone(); },
    };
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async open(name) { opened.push(name); return cache(name); },
    async delete(name) { deleted.push(name); return stores.delete(name); },
    async match(request) {
      for (const name of stores.keys()) {
        const hit = await cache(name).match(request);
        if (hit) return hit;
      }
    },
  };
  const self = {
    location: new URL('sw.js', baseUrl),
    addEventListener(type, handler) { handlers.set(type, handler); },
    async skipWaiting() { skipped += 1; },
    clients: { async claim() { claimed += 1; } },
  };
  vm.runInNewContext(source, {
    self, caches, URL,
    fetch: network || (async () => { throw new Error('offline'); }),
  }, { filename: 'sw.js' });
  return {
    stores, deleted, opened, installed,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    async lifecycle(type) {
      const pending = [];
      handlers.get(type)({ waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
    },
    request(url, method = 'GET') {
      let response;
      handlers.get('fetch')({
        request: new Request(new URL(url, baseUrl), { method }),
        respondWith(promise) { response = promise; },
      });
      return response;
    },
  };
}

test('activation removes only obsolete caches belonging to this deployment', async () => {
  const retained = [currentCache, 'portfolio-v3', 'gamecast-shell-v1',
    'gamecast-shell:https://example.test/preview/:v1',
    'gamecast-shell:https://example.test/sports-gamecast/preview/:v1'];
  const obsolete = `gamecast-shell:${appUrl}:v0`;
  const instance = worker({ stores: new Map([...retained, obsolete].map(name => [name, new Map()])) });
  await instance.lifecycle('activate');
  assert.deepEqual(instance.deleted, [obsolete]);
  assert.deepEqual([...instance.stores.keys()], retained);
  assert.equal(instance.claimed, 1);
  await instance.lifecycle('activate');
  assert.deepEqual(instance.deleted, [obsolete], 'activation is repeatable without deleting retained caches');
});

test('install uses a deployment-specific cache and preserves another installation', async () => {
  const first = worker();
  await first.lifecycle('install');
  const second = worker({ baseUrl: 'https://example.test/preview/', stores: first.stores });
  await second.lifecycle('install');
  await second.lifecycle('activate');
  assert.deepEqual([...first.stores.keys()], [currentCache, 'gamecast-shell:https://example.test/preview/:v1']);
  assert.ok(first.installed.includes(`${appUrl}index.html`));
  assert.ok(second.installed.every(url => url.startsWith('https://example.test/preview/')));
  assert.equal(first.skipped, 1);
  assert.equal(second.skipped, 1);
});

test('offline reads ignore responses in unrelated and legacy caches', async () => {
  const url = `${appUrl}favorites.js`;
  const instance = worker({ stores: new Map([
    ['portfolio-v3', new Map([[url, new Response('unrelated')]])],
    ['gamecast-shell-v1', new Map([[url, new Response('legacy')]])],
    [currentCache, new Map([[url, new Response('current')]])],
  ]) });
  assert.equal(await (await instance.request(url)).text(), 'current');
});

test('offline shell fallback comes only from the current deployment cache', async () => {
  const url = `${appUrl}index.html`;
  const instance = worker({ stores: new Map([
    ['portfolio-v3', new Map([[url, new Response('unrelated shell')]])],
    [currentCache, new Map([[url, new Response('current shell')]])],
  ]) });
  assert.equal(await (await instance.request('gamecast.html?event=42')).text(), 'current shell');
});

test('an empty current cache never falls back to another app cache', async () => {
  const instance = worker({ stores: new Map([
    ['portfolio-v3', new Map([[`${appUrl}index.html`, new Response('unrelated shell')]])],
  ]) });
  assert.equal(await instance.request('gamecast.html?event=42'), undefined);
});

test('online responses still populate the current cache for offline use', async () => {
  const instance = worker({ network: async () => new Response('fresh response') });
  assert.equal(await (await instance.request('favorites.js')).text(), 'fresh response');
  const offline = worker({ stores: instance.stores });
  assert.equal(await (await offline.request('favorites.js')).text(), 'fresh response');
  assert.deepEqual([...instance.stores.keys()], [currentCache]);
});

for (const [url, method] of [
  ['https://api.example.test/scoreboard', 'GET'],
  ['https://example.test/portfolio/index.html', 'GET'],
  ['https://example.test/sports-gamecast-preview/index.html', 'GET'],
  ['https://example.test/sports-gamecast', 'GET'],
  ['favorites.js', 'POST'],
]) {
  test(`does not intercept ${method} ${url}`, () => {
    const instance = worker();
    assert.equal(instance.request(url, method), undefined);
    assert.deepEqual(instance.opened, []);
  });
}

test('root deployments still serve their own offline shell', async () => {
  const instance = worker({ baseUrl: 'https://example.test/' });
  await instance.lifecycle('install');
  assert.equal(await (await instance.request('gamecast.html?event=42')).text(), 'shell:./index.html');
  assert.deepEqual([...instance.stores.keys()], ['gamecast-shell:https://example.test/:v1']);
});
