import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const fixture = JSON.parse(readFileSync(new URL('./mock_scoreboard.json', import.meta.url), 'utf8'));
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(hidden = false) {
  const nodes = new Map(), listeners = new Map(), requests = [], timers = new Map();
  let timerId = 0;
  function node() {
    const classes = new Set(['hidden']);
    return { innerHTML: '', textContent: '', value: '', classList: {
      add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value)
    }, addEventListener() {}, appendChild() {} };
  }
  const document = { hidden, body: node(), title: '', createElement: node,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
    addEventListener(name, handler) { listeners.set(name, handler); }
  };
  const context = vm.createContext({ document, URLSearchParams, AbortController,
    location: { search: '' }, window: {}, localStorage: { getItem() { return null; } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, {fn, ms, interval: false}); return id; },
    setInterval(fn, ms) { const id = ++timerId; timers.set(id, {fn, ms, interval: true}); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    // Deliberately ignore cancellation: queued responses must still be fenced.
    fetch(url, options) { return new Promise((resolve, reject) => requests.push({url, options,
      resolve(data = fixture) { resolve({ok: true, json: () => Promise.resolve(structuredClone(data))}); }, reject })); }
  });
  vm.runInContext(source, context, {filename: 'index.html'});
  return { nodes, requests, timers, document,
    visibility(value) { document.hidden = value; listeners.get('visibilitychange')(); },
    poll() { const entry = [...timers].find(([, timer]) => !timer.interval); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); }
  };
}

test('a late response cannot restart polling while the scoreboard is hidden', async () => {
  const h = harness();
  h.visibility(true);
  h.requests[0].resolve(); await settle();
  assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.get('board')?.innerHTML || '', '');
  assert.equal(h.requests[0].options.signal.aborted, true);
});

test('new foreground result wins over a stale success after returning', async () => {
  const h = harness();
  h.visibility(true); h.visibility(false);
  h.requests[1].resolve(); await settle();
  const current = h.nodes.get('board').innerHTML;
  assert.match(current, /class='card'/);
  const timers = [...h.timers.keys()];
  h.requests[0].resolve({events: []}); await settle();
  assert.equal(h.nodes.get('board').innerHTML, current);
  assert.deepEqual([...h.timers.keys()], timers);
});

test('a stale failure cannot replace a successful foreground status', async () => {
  const h = harness();
  h.visibility(true); h.visibility(false);
  h.requests[1].resolve(); await settle();
  const timers = [...h.timers.keys()];
  h.requests[0].reject(new Error('old request failed')); await settle();
  assert.equal(h.nodes.get('errorBox').classList.contains('hidden'), true);
  assert.deepEqual([...h.timers.keys()], timers);
});

test('a stale success cannot clear a current error or its retry', async () => {
  const h = harness();
  h.visibility(true); h.visibility(false);
  h.requests[1].reject(new Error('current failure')); await settle();
  const timers = [...h.timers.keys()];
  h.requests[0].resolve(); await settle();
  assert.equal(h.nodes.get('errorBox').classList.contains('hidden'), false);
  assert.match(h.nodes.get('errorBox').innerHTML, /current failure/);
  assert.deepEqual([...h.timers.keys()], timers);
});

test('hidden initial load waits for visibility, then polling resumes once', async () => {
  const h = harness(true);
  assert.equal(h.requests.length, 0);
  h.visibility(false);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(); await settle();
  assert.equal(h.timers.size, 2);
  assert.equal([...h.timers.values()].find(t => !t.interval).ms, 20000);
  h.poll();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({events: []}); await settle();
  assert.equal(h.timers.size, 2);
  assert.equal([...h.timers.values()].find(t => !t.interval).ms, 120000);
  h.visibility(true);
  assert.equal(h.timers.size, 0);
});

test('current failures retry and successful recovery hides the error', async () => {
  const h = harness();
  h.requests[0].reject(new Error('offline')); await settle();
  assert.equal([...h.timers.values()].find(t => !t.interval).ms, 30000);
  assert.equal(h.nodes.get('errorBox').classList.contains('hidden'), false);
  h.poll(); h.requests[1].resolve(); await settle();
  assert.equal(h.nodes.get('errorBox').classList.contains('hidden'), true);
  assert.equal([...h.timers.values()].find(t => !t.interval).ms, 20000);
});
