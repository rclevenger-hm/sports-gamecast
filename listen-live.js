(function (root) {
  "use strict";

  var SCOPE_ORDER = { home: 0, away: 1, national: 2, neutral: 3 };
  var LANGUAGE_NAMES = { en: "English", es: "Spanish", fr: "French" };

  function safeHttps(value) {
    if (!value) return null;
    try {
      var url = new URL(value, location.href);
      return url.protocol === "https:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function injectStyles() {
    if (document.getElementById("listenLiveStyles")) return;
    var style = document.createElement("style");
    style.id = "listenLiveStyles";
    style.textContent = [
      ".listen-live{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:10px 0}",
      ".listen-live-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}",
      ".listen-live-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px}",
      ".listen-live-sub{font-size:11px;color:var(--muted)}",
      ".listen-live-empty{font-size:12px;color:var(--muted);line-height:1.45}",
      ".listen-source{padding:10px 0;border-top:1px solid var(--border)}",
      ".listen-source:first-of-type{border-top:0}",
      ".listen-source-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".listen-source-name{font-weight:800;font-size:13px;margin-right:auto}",
      ".listen-badge{font-size:10px;border:1px solid var(--border);border-radius:999px;padding:3px 7px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}",
      ".listen-note{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.4}",
      ".listen-actions{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}",
      ".listen-link{display:inline-flex;align-items:center;text-decoration:none;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 9px;font-size:11px;font-weight:700}",
      ".listen-link:hover{border-color:var(--accent);color:var(--accent)}",
      ".listen-audio{width:min(100%,420px);height:34px}",
      ".listen-warning{font-size:10px;color:var(--muted)}"
    ].join("");
    document.head.appendChild(style);
  }

  function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function languageLabel(code) {
    return LANGUAGE_NAMES[code] || (code ? code.toUpperCase() : "Language n/a");
  }

  function accessLabel(source) {
    if (source.access === "subscription") return "Subscription required";
    if (source.access === "geo-restricted") return "Geographic restrictions may apply";
    if (source.access === "unknown") return "Access requirements unverified";
    return source.access === "free" ? "Free access" : "";
  }

  function sourceNote(source) {
    var parts = [];
    var access = accessLabel(source);
    if (access) parts.push(access);
    if (Array.isArray(source.regions) && source.regions.length) parts.push("Regions: " + source.regions.join(", "));
    if (source.notes) parts.push(source.notes);
    return parts.join(" · ");
  }

  function resolveSources(eventId, registry, mappings) {
    var game = mappings && mappings.games ? mappings.games[String(eventId)] : null;
    var refs = game && Array.isArray(game.sources) ? game.sources : [];
    var byId = new Map((registry && Array.isArray(registry.sources) ? registry.sources : []).map(function (source) {
      return [source.id, source];
    }));
    return refs.map(function (id) { return byId.get(id); }).filter(Boolean).sort(function (a, b) {
      var sa = Object.prototype.hasOwnProperty.call(SCOPE_ORDER, a.scope) ? SCOPE_ORDER[a.scope] : 9;
      var sb = Object.prototype.hasOwnProperty.call(SCOPE_ORDER, b.scope) ? SCOPE_ORDER[b.scope] : 9;
      if (sa !== sb) return sa - sb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function renderSource(source) {
    var item = make("div", "listen-source");
    var row = make("div", "listen-source-row");
    row.appendChild(make("div", "listen-source-name", source.name || source.provider || "Audio provider"));
    row.appendChild(make("span", "listen-badge", source.scope || "audio"));
    row.appendChild(make("span", "listen-badge", languageLabel(source.language)));
    item.appendChild(row);

    var note = sourceNote(source);
    if (note) item.appendChild(make("div", "listen-note", note));

    var actions = make("div", "listen-actions");
    var streamUrl = source.directPlaybackAllowed === true ? safeHttps(source.streamUrl) : null;
    var providerUrl = safeHttps(source.providerUrl);

    if (streamUrl) {
      var audio = document.createElement("audio");
      audio.className = "listen-audio";
      audio.controls = true;
      audio.preload = "none";
      audio.src = streamUrl;
      audio.setAttribute("aria-label", "Listen to " + (source.name || "broadcast"));
      actions.appendChild(audio);
    }

    if (providerUrl) {
      var link = make("a", "listen-link", streamUrl ? "Open provider" : "Listen at provider");
      link.href = providerUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.appendChild(link);
    }

    if (!streamUrl && !providerUrl) {
      actions.appendChild(make("span", "listen-warning", "No usable authorized listening link is currently available."));
    }
    item.appendChild(actions);
    return item;
  }

  function render(options) {
    options = options || {};
    injectStyles();
    var host = options.container || document.getElementById("listenLiveBox");
    if (!host) return null;
    host.innerHTML = "";
    host.className = "listen-live";
    host.setAttribute("aria-live", "polite");

    var head = make("div", "listen-live-head");
    head.appendChild(make("div", "listen-live-title", "Listen Live"));
    head.appendChild(make("div", "listen-live-sub", "Authorized audio sources"));
    host.appendChild(head);

    var sources = resolveSources(options.eventId, options.registry || {}, options.mappings || {});
    if (!sources.length) {
      host.appendChild(make("div", "listen-live-empty", "No authorized audio source is mapped to this game yet. Gamecast will continue updating normally."));
      return { sources: 0 };
    }
    sources.forEach(function (source) { host.appendChild(renderSource(source)); });
    return { sources: sources.length };
  }

  async function loadJson(path) {
    var response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status + " loading " + path);
    return response.json();
  }

  async function mount() {
    var gameUi = document.getElementById("gameUI");
    var situation = document.getElementById("situationBox");
    if (!gameUi || !situation) return;
    var qs = new URLSearchParams(location.search);
    var eventId = qs.get("event");
    if (!eventId) return;

    var box = document.getElementById("listenLiveBox");
    if (!box) {
      box = document.createElement("section");
      box.id = "listenLiveBox";
      situation.insertAdjacentElement("afterend", box);
    }
    box.className = "listen-live";
    box.textContent = "Loading authorized audio sources…";

    try {
      var values = await Promise.all([loadJson("data/broadcast-registry.json"), loadJson("data/broadcasts.json")]);
      render({ container: box, eventId: eventId, registry: values[0], mappings: values[1] });
    } catch (err) {
      injectStyles();
      box.innerHTML = "";
      var head = make("div", "listen-live-head");
      head.appendChild(make("div", "listen-live-title", "Listen Live"));
      host = box;
      host.appendChild(head);
      host.appendChild(make("div", "listen-live-empty", "Audio source data is temporarily unavailable. Gamecast is unaffected."));
    }
  }

  root.GamecastListenLive = { render: render, resolveSources: resolveSources, mount: mount };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
