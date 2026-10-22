import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../push-subscriptions.js', import.meta.url), 'utf8');

function harness({ subscribeStatus = 204, timeoutOnFetch = false, requestTimeoutMs, fetchResponse } = {}) {
  const calls = [];
  let localUnsubscribeCount = 0;
  let subscription = null;

  function makeSubscription() {
    return {
      toJSON() { return { endpoint: 'https://push.example/subscription-1', keys: { p256dh: 'key', auth: 'auth' } }; },
      async unsubscribe() { localUnsubscribeCount += 1; subscription = null; return true; },
    };
  }

  const pushManager = {
    async getSubscription() { return subscription; },
    async subscribe(options) {
      calls.push({ type: 'pushManager.subscribe', options });
      subscription = makeSubscription();
      return subscription;
    },
  };

  const pushConfig = {
    publicKey: 'AQAB',
    subscribeUrl: 'https://alerts.example/subscriptions',
    unsubscribeUrl: 'https://alerts.example/subscriptions/remove',
  };
  if (requestTimeoutMs !== undefined) pushConfig.requestTimeoutMs = requestTimeoutMs;

  const window = {
    SPORTS_GAMECAST_PUSH_CONFIG: pushConfig,
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    PushManager: function PushManager() {},
    Notification: {
      permission: 'default',
      async requestPermission() { calls.push({ type: 'permission' }); return 'granted'; },
    },
    CustomEvent: class CustomEvent { constructor(type) { this.type = type; } },
    dispatchEvent(event) { calls.push({ type: 'event', event: event.type }); },
    atob,
    async fetch(url, options) {
      calls.push({ type: 'fetch', url, options });
      if (fetchResponse) return fetchResponse(url, options);
      if (timeoutOnFetch) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted by test timeout')), { once: true });
        });
      }
      return { ok: subscribeStatus >= 200 && subscribeStatus < 300, status: subscribeStatus };
    },
  };

  if (timeoutOnFetch) {
    window.AbortController = AbortController;
    window.setTimeout = (callback, delay) => {
      calls.push({ type: 'timeout', delay });
      Promise.resolve().then(callback);
      return 1;
    };
    window.clearTimeout = (timer) => calls.push({ type: 'clearTimeout', timer });
  }

  vm.runInNewContext(source, { window, Uint8Array, Set, Array, Error, JSON });
  return {
    api: window.SportsGamecastPush,
    calls,
    getLocalUnsubscribeCount: () => localUnsubscribeCount,
    seedSubscription() { subscription = makeSubscription(); return subscription; },
  };
}

{
  const { api, calls } = harness();
  assert.equal(api.supported(), true);
  assert.equal(api.configured(), true);
  assert.ok(calls.some((call) => call.type === 'event' && call.event === 'sports-gamecast:push-ready'));

  const result = await api.subscribe(
    ['nfl:chargers', ' nfl:chargers ', '', 'nfl:chiefs'],
    { gameStart: true, scoreChanges: false, leadChanges: true, lateGame: false, final: true, unknown: true }
  );
  assert.equal(result.toJSON().endpoint, 'https://push.example/subscription-1');

  const subscribeCall = calls.find((call) => call.type === 'pushManager.subscribe');
  assert.equal(subscribeCall.options.userVisibleOnly, true);
  assert.ok(subscribeCall.options.applicationServerKey instanceof Uint8Array);

  const registration = calls.find((call) => call.type === 'fetch');
  assert.equal(registration.url, 'https://alerts.example/subscriptions');
  assert.equal(registration.options.credentials, 'omit');
  assert.equal(registration.options.cache, 'no-store');
  const body = JSON.parse(registration.options.body);
  assert.deepEqual(body.teamKeys, ['nfl:chargers', 'nfl:chiefs']);
  assert.deepEqual(body.preferences, {
    gameStart: true,
    scoreChanges: false,
    leadChanges: true,
    lateGame: false,
    final: true,
  });
  assert.equal(Object.hasOwn(body.preferences, 'unknown'), false, 'unknown preference keys must not cross the subscription boundary');
}

{
  const { api, calls } = harness();
  await api.subscribe(['nfl:chargers'], null);
  const registration = calls.find((call) => call.type === 'fetch');
  assert.deepEqual(JSON.parse(registration.options.body).preferences, {});
}

{
  const { api, calls } = harness();
  const synced = await api.sync(['nfl:chargers'], { final: true });
  assert.equal(synced, false, 'sync should not create a browser subscription');
  assert.equal(calls.filter((call) => call.type === 'fetch').length, 0);
  assert.equal(calls.filter((call) => call.type === 'pushManager.subscribe').length, 0);
}

{
  const { api, calls, seedSubscription } = harness();
  seedSubscription();
  const synced = await api.sync(
    ['nfl:chiefs', ' nfl:chargers ', 'nfl:chiefs'],
    { gameStart: false, scoreChanges: true, final: true, unknown: true }
  );
  assert.equal(synced, true);
  assert.equal(calls.filter((call) => call.type === 'pushManager.subscribe').length, 0, 'sync must reuse an existing browser subscription');
  const registration = calls.find((call) => call.type === 'fetch');
  assert.deepEqual(JSON.parse(registration.options.body).teamKeys, ['nfl:chargers', 'nfl:chiefs']);
  assert.deepEqual(JSON.parse(registration.options.body).preferences, {
    gameStart: false,
    scoreChanges: true,
    final: true,
  });
}

{
  const { api, calls, getLocalUnsubscribeCount } = harness();
  await api.subscribe(['nfl:chargers']);
  const removed = await api.unsubscribe();
  assert.equal(removed, true);
  assert.equal(getLocalUnsubscribeCount(), 1);
  assert.equal(calls.filter((call) => call.type === 'fetch').at(-1).url, 'https://alerts.example/subscriptions/remove');
}

{
  const { api, getLocalUnsubscribeCount } = harness({ subscribeStatus: 503 });
  await assert.rejects(api.subscribe(['nfl:chargers']), /HTTP 503/);
  assert.equal(getLocalUnsubscribeCount(), 1, 'new browser subscription should roll back if server registration fails');
}

{
  const { api, calls, getLocalUnsubscribeCount } = harness({ timeoutOnFetch: true, requestTimeoutMs: 1250 });
  await assert.rejects(api.subscribe(['nfl:chargers']), /timed out after 1250ms/);
  assert.equal(getLocalUnsubscribeCount(), 1, 'new browser subscription should roll back if registration times out');
  assert.ok(calls.some((call) => call.type === 'timeout' && call.delay === 1250), 'configured request timeout should bound endpoint calls');
  assert.ok(calls.some((call) => call.type === 'clearTimeout'), 'request timer should always be cleared');
}

// Hold endpoint responses explicitly: no clock-based race assumptions.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

{
  const requests = [];
  const { api, seedSubscription } = harness({ fetchResponse(url, options) {
    const response = deferred();
    requests.push({ url, body: JSON.parse(options.body), ...response });
    return response.promise;
  } });
  seedSubscription();
  const old = api.sync(['nfl:chargers'], { final: true });
  await flush();
  const teams = ['nfl:chiefs'];
  const preferences = { final: false };
  const latest = api.sync(teams, preferences);
  teams.push('nfl:raiders');
  preferences.final = true;
  await flush();
  assert.equal(requests.length, 1, 'new preference write must wait for the previous response');
  requests[0].resolve({ ok: true });
  await old;
  await flush();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].body.teamKeys, ['nfl:chiefs'], 'queued teams are captured at invocation');
  assert.deepEqual(requests[1].body.preferences, { final: false }, 'queued preferences are captured at invocation');
  requests[1].resolve({ ok: true });
  await latest;
}

{
  const requests = [];
  const { api, calls, seedSubscription, getLocalUnsubscribeCount } = harness({ fetchResponse(url, options) {
    const response = deferred();
    requests.push({ url, ...response });
    return response.promise;
  } });
  seedSubscription();
  const syncing = api.sync(['nfl:chargers'], { final: true });
  await flush();
  const removing = api.unsubscribe();
  const afterRemoval = api.sync(['nfl:chiefs'], { final: false });
  await flush();
  assert.equal(getLocalUnsubscribeCount(), 0, 'disable waits for any registration write to finish');
  assert.equal(requests.length, 1);
  requests[0].resolve({ ok: true });
  await syncing;
  await flush();
  assert.equal(requests[1].url, 'https://alerts.example/subscriptions/remove');
  requests[1].resolve({ ok: true });
  assert.equal(await removing, true);
  assert.equal(await afterRemoval, false, 'later sync must not resurrect a removed subscription');
  assert.equal(calls.filter(call => call.type === 'fetch').length, 2);
}

{
  const requests = [];
  const { api, getLocalUnsubscribeCount } = harness({ fetchResponse() {
    const response = deferred();
    requests.push(response);
    return response.promise;
  } });
  const enabling = api.subscribe(['nfl:chargers'], { final: true });
  await flush();
  const disabling = api.unsubscribe();
  await flush();
  assert.equal(getLocalUnsubscribeCount(), 0, 'disable must not race a pending enable');
  requests[0].resolve({ ok: true });
  await enabling;
  await flush();
  assert.equal(getLocalUnsubscribeCount(), 1);
  requests[1].resolve({ ok: true });
  assert.equal(await disabling, true);
}

{
  let attempts = 0;
  const { api, seedSubscription } = harness({ fetchResponse() {
    attempts += 1;
    return { ok: attempts > 1, status: attempts > 1 ? 204 : 503 };
  } });
  seedSubscription();
  const failed = api.sync(['nfl:chargers'], { final: true });
  const retry = api.sync(['nfl:chiefs'], { final: false });
  await assert.rejects(failed, /HTTP 503/);
  assert.equal(await retry, true, 'a rejected operation must not poison subsequent queued work');
  assert.equal(attempts, 2);
}

{
  const response = deferred();
  let attempts = 0;
  const { api, calls, seedSubscription } = harness({ fetchResponse() {
    attempts += 1;
    return attempts === 1 ? response.promise : { ok: true };
  } });
  seedSubscription();
  const syncing = api.sync(['nfl:chargers'], { final: true });
  await flush();
  const enabling = api.subscribe(['nfl:chiefs'], { final: false });
  assert.equal(calls.filter(call => call.type === 'permission').length, 1,
    'permission prompt must run synchronously during the caller gesture, even while writes are queued');
  assert.equal(attempts, 1);
  response.resolve({ ok: true });
  await syncing;
  await enabling;
  assert.equal(attempts, 2);
}

console.log('Push subscription lifecycle checks passed.');
