(function (global) {
  "use strict";

  var ALERT_PREFERENCE_KEYS = ["gameStart", "scoreChanges", "leadChanges", "lateGame", "final"];
  var DEFAULT_REQUEST_TIMEOUT_MS = 10000;

  function config() {
    var value = global.SPORTS_GAMECAST_PUSH_CONFIG || {};
    var configuredTimeout = Number(value.requestTimeoutMs);
    return {
      publicKey: typeof value.publicKey === "string" ? value.publicKey.trim() : "",
      subscribeUrl: typeof value.subscribeUrl === "string" ? value.subscribeUrl.trim() : "",
      unsubscribeUrl: typeof value.unsubscribeUrl === "string" ? value.unsubscribeUrl.trim() : "",
      requestTimeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 && configuredTimeout <= 60000
        ? configuredTimeout
        : DEFAULT_REQUEST_TIMEOUT_MS
    };
  }

  function supported() {
    return Boolean(
      global.navigator &&
      global.navigator.serviceWorker &&
      global.PushManager &&
      global.Notification &&
      typeof global.fetch === "function"
    );
  }

  function configured() {
    var value = config();
    return supported() && Boolean(value.publicKey && value.subscribeUrl);
  }

  function applicationServerKey(value) {
    var padding = "=".repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = global.atob(base64);
    var bytes = new Uint8Array(raw.length);
    for (var index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
  }

  function normalizeTeamKeys(teamKeys) {
    if (!Array.isArray(teamKeys)) return [];
    return Array.from(new Set(teamKeys.filter(function (value) {
      return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
    }).map(function (value) { return value.trim(); }))).sort();
  }

  function normalizePreferences(preferences) {
    var value = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    var normalized = {};
    ALERT_PREFERENCE_KEYS.forEach(function (key) {
      if (typeof value[key] === "boolean") normalized[key] = value[key];
    });
    return normalized;
  }

  async function postJson(url, body) {
    var value = config();
    var controller = typeof global.AbortController === "function" ? new global.AbortController() : null;
    var timer = controller && typeof global.setTimeout === "function"
      ? global.setTimeout(function () { controller.abort(); }, value.requestTimeoutMs)
      : null;

    try {
      var response = await global.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("Push subscription endpoint returned HTTP " + response.status);
    } catch (error) {
      if (controller && controller.signal.aborted) {
        throw new Error("Push subscription endpoint timed out after " + value.requestTimeoutMs + "ms");
      }
      throw error;
    } finally {
      if (timer !== null && typeof global.clearTimeout === "function") global.clearTimeout(timer);
    }
  }

  async function registration() {
    if (!supported()) throw new Error("Background push is not supported by this browser");
    return global.navigator.serviceWorker.ready;
  }

  async function getSubscription() {
    var ready = await registration();
    return ready.pushManager.getSubscription();
  }

  function registrationBody(subscription, teamKeys, preferences) {
    return {
      subscription: subscription.toJSON ? subscription.toJSON() : subscription,
      teamKeys: normalizeTeamKeys(teamKeys),
      preferences: normalizePreferences(preferences)
    };
  }

  // Order acknowledged writes from this page. This cannot order other tabs or
  // a server write that completes after a client-side timeout.
  var pendingMutation = Promise.resolve();
  function enqueueMutation(operation) {
    var result = pendingMutation.then(operation);
    pendingMutation = result.catch(function () {});
    return result;
  }

  function sync(teamKeys, preferences) {
    var teams = normalizeTeamKeys(teamKeys);
    var settings = normalizePreferences(preferences);
    return enqueueMutation(function () { return syncNow(teams, settings); });
  }

  async function syncNow(teamKeys, preferences) {
    var value = config();
    if (!configured()) return false;
    var subscription = await getSubscription();
    if (!subscription) return false;
    await postJson(value.subscribeUrl, registrationBody(subscription, teamKeys, preferences));
    return true;
  }

  async function subscribe(teamKeys, preferences) {
    if (!configured()) return Promise.reject(new Error("Background push is not configured for this deployment"));
    var teams = normalizeTeamKeys(teamKeys);
    var settings = normalizePreferences(preferences);
    // Request permission during the click gesture, not after queued network work.
    var permission = global.Notification.permission === "default"
      ? global.Notification.requestPermission()
      : Promise.resolve(global.Notification.permission);
    // Attach the rejection handler immediately even if earlier work is pending.
    var allowed = Promise.resolve(permission).then(function (value) {
      return { permission: value };
    }, function (error) { return { error: error }; });
    return enqueueMutation(async function () {
      var result = await allowed;
      if (result.error) throw result.error;
      if (result.permission !== "granted") throw new Error("Notification permission was not granted");
      return subscribeNow(teams, settings);
    });
  }

  async function subscribeNow(teamKeys, preferences) {
    var value = config();
    if (!configured()) throw new Error("Background push is not configured for this deployment");

    var ready = await registration();
    var subscription = await ready.pushManager.getSubscription();
    var created = false;
    if (!subscription) {
      subscription = await ready.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(value.publicKey)
      });
      created = true;
    }

    try {
      await postJson(value.subscribeUrl, registrationBody(subscription, teamKeys, preferences));
    } catch (error) {
      if (created && subscription && typeof subscription.unsubscribe === "function") {
        try { await subscription.unsubscribe(); } catch (_rollbackError) {}
      }
      throw error;
    }

    return subscription;
  }

  function unsubscribe() {
    return enqueueMutation(unsubscribeNow);
  }

  async function unsubscribeNow() {
    var value = config();
    var subscription = await getSubscription();
    if (!subscription) return false;

    var snapshot = subscription.toJSON ? subscription.toJSON() : subscription;
    var removed = await subscription.unsubscribe();
    if (value.unsubscribeUrl) await postJson(value.unsubscribeUrl, { subscription: snapshot });
    return removed;
  }

  global.SportsGamecastPush = {
    configured: configured,
    supported: supported,
    getSubscription: getSubscription,
    sync: sync,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };

  if (typeof global.dispatchEvent === "function" && typeof global.CustomEvent === "function") {
    global.dispatchEvent(new global.CustomEvent("sports-gamecast:push-ready"));
  }
})(window);
