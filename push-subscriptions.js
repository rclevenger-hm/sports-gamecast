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

  async function sync(teamKeys, preferences) {
    var value = config();
    if (!configured()) return false;
    var subscription = await getSubscription();
    if (!subscription) return false;
    await postJson(value.subscribeUrl, registrationBody(subscription, teamKeys, preferences));
    return true;
  }

  async function subscribe(teamKeys, preferences) {
    var value = config();
    if (!configured()) throw new Error("Background push is not configured for this deployment");

    var permission = global.Notification.permission;
    if (permission === "default") permission = await global.Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted");

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

  async function unsubscribe() {
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
