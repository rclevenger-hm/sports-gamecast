import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../listen-live.js', import.meta.url), 'utf8');
function harness(search = '', selectedEvent = null) {
  const listeners = new Map(), requests = [], elements = new Map();
  function make(tag) {
    const node = { tag, children: [], attributes: {}, className: '', textContent: '',
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); return child; },
      setAttribute(key, value) { this.attributes[key] = value; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      insertAdjacentElement(_, child) { elements.set(child.id, child); },
      set innerHTML(value) { this.children = []; this.textContent = value; }
    };
    return node;
  }
  elements.set('gameUI', make('div')); elements.set('situationBox', make('div'));
  if (selectedEvent) elements.get('gameUI').setAttribute('data-event-id', selectedEvent);
  const document = { readyState: 'complete', head: make('head'),
    getElementById(id) { return elements.get(id) || null; }, createElement: make,
    addEventListener(name, handler) { listeners.set(name, handler); }
  };
  const context = vm.createContext({ document, URL, URLSearchParams, location: { search, href: 'https://gamecast.example/gamecast.html' + search },
    fetch(path) { return new Promise(resolve => requests.push({ path, resolve })); },
    addEventListener(name, handler) { listeners.set(name, handler); }
  });
  vm.runInContext(source, context);
  function select(id) { elements.get('gameUI').setAttribute('data-event-id', id); listeners.get('gamecast:event-selected')?.(); }
  function reply(start, id, name) {
    requests[start].resolve({ ok: true, json: async () => ({ sources: [{ id: 'radio', name, providerUrl: 'https://radio.example' }] }) });
    requests[start + 1].resolve({ ok: true, json: async () => ({ games: { [id]: { sources: ['radio'] } } }) });
  }
  return { context, elements, requests, select, reply, text() {
    function all(node) { return node ? node.textContent + node.children.map(all).join(' ') : ''; }
    return all(elements.get('listenLiveBox'));
  } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('auto-selected game mounts audio without changing the URL', async () => {
  const h = harness('?sport=nhl');
  assert.equal(h.requests.length, 0);
  h.select('live-game');
  assert.equal(h.requests.length, 2);
  h.reply(0, 'live-game', 'Live Radio'); await flush();
  assert.match(h.text(), /Live Radio/);
  assert.equal(h.context.location.search, '?sport=nhl');
});
test('explicit event still mounts and repeated selection keeps its player', async () => {
  const h = harness('?event=chosen');
  assert.equal(h.requests.length, 2);
  h.reply(0, 'chosen', 'Chosen Radio'); await flush();
  const children = h.elements.get('listenLiveBox').children;
  h.select('chosen'); await h.context.GamecastListenLive.mount();
  assert.equal(h.requests.length, 2);
  assert.equal(h.elements.get('listenLiveBox').children, children);
});
test('late results cannot overwrite a newly selected game', async () => {
  const h = harness('?event=old');
  h.select('new');
  assert.equal(h.requests.length, 4);
  h.reply(2, 'new', 'New Radio'); await flush();
  h.reply(0, 'old', 'Old Radio'); await flush();
  assert.match(h.text(), /New Radio/); assert.doesNotMatch(h.text(), /Old Radio/);
});
test('failed audio request can be retried for the same selected game', async () => {
  const h = harness('?event=chosen');
  h.requests[0].resolve({ ok: false, status: 503 });
  h.requests[1].resolve({ ok: true, json: async () => ({}) }); await flush();
  assert.match(h.text(), /temporarily unavailable/);
  const retry = h.context.GamecastListenLive.mount();
  assert.equal(h.requests.length, 4);
  h.reply(2, 'chosen', 'Recovered Radio'); await retry;
  assert.match(h.text(), /Recovered Radio/);
});

test('late-loaded audio module reads the already selected event', async () => {
  const h = harness('?sport=nhl', 'selected-before-load');
  assert.equal(h.requests.length, 2);
  h.reply(0, 'selected-before-load', 'Ready Radio'); await flush();
  assert.match(h.text(), /Ready Radio/);
});
test('stale failure cannot replace or unlock the newer successful player', async () => {
  const h = harness('?event=old');
  h.select('new');
  h.reply(2, 'new', 'New Radio'); await flush();
  h.requests[0].resolve({ ok: false, status: 503 });
  h.requests[1].resolve({ ok: true, json: async () => ({}) }); await flush();
  assert.match(h.text(), /New Radio/); assert.doesNotMatch(h.text(), /temporarily unavailable/);
  await h.context.GamecastListenLive.mount();
  assert.equal(h.requests.length, 4);
});
