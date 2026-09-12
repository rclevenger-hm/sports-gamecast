import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../push-subscriptions.js', import.meta.url), 'utf8');

function harness({ subscribeStatus = 204 } = {}) {
  const calls = [];
  let localUnsubscribeCount = 0;
  let subscription = null;

  const pushManager = {
    async getSubscription() { return subscription; },
    async subscribe(options) {
      calls.push({ type: 'pushManager.subscribe', options });
      subscription = {
        toJSON() { return { endpoint: 'https://push.example/subscription-1', keys: { p256dh: 'key', auth: 'auth' } }; },
        async unsubscribe() { localUnsubscribeCount += 1; subscription = null; return true; },
      };
      return subscription;
    },
  };

  const window = {
    SPORTS_GAMECAST_PUSH_CONFIG: {
      publicKey: 'AQAB',
      subscribeUrl: 'https://alerts.example/subscriptions',
      unsubscribeUrl: 'https://alerts.example/subscriptions/remove',
    },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager }) } },
    PushManager: function PushManager() {},
    Notification: {
      permission: 'default',
      async requestPermission() { calls.push({ type: 'permission' }); return 'granted'; },
    },
    atob,
    async fetch(url, options) {
      calls.push({ type: 'fetch', url, options });
      return { ok: subscribeStatus >= 200 && subscribeStatus < 300, status: subscribeStatus };
    },
  };

  vm.runInNewContext(source, { window, Uint8Array, Set, Array, Error, JSON });
  return { api: window.SportsGamecastPush, calls, getLocalUnsubscribeCount: () => localUnsubscribeCount };
}

{
  const { api, calls } = harness();
  assert.equal(api.supported(), true);
  assert.equal(api.configured(), true);

  const result = await api.subscribe(['nfl:chargers', ' nfl:chargers ', '', 'nfl:chiefs']);
  assert.equal(result.toJSON().endpoint, 'https://push.example/subscription-1');

  const subscribeCall = calls.find((call) => call.type === 'pushManager.subscribe');
  assert.equal(subscribeCall.options.userVisibleOnly, true);
  assert.ok(subscribeCall.options.applicationServerKey instanceof Uint8Array);

  const registration = calls.find((call) => call.type === 'fetch');
  assert.equal(registration.url, 'https://alerts.example/subscriptions');
  assert.equal(registration.options.credentials, 'omit');
  assert.equal(registration.options.cache, 'no-store');
  assert.deepEqual(JSON.parse(registration.options.body).teamKeys, ['nfl:chargers', 'nfl:chiefs']);
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

console.log('Push subscription lifecycle checks passed.');
