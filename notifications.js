(function () {
  "use strict";

  var FAVORITES_KEY = "sports-gamecast-favorites-v1";
  var PREFS_KEY = "sports-gamecast-notification-prefs-v1";
  var SNAPSHOT_KEY = "sports-gamecast-notification-state-v1";
  var board = document.getElementById("board");
  if (!board) return;

  var defaults = {
    enabled: false,
    gameStart: true,
    scoreChanges: true,
    leadChanges: true,
    lateGame: true,
    final: true
  };

  function safeParse(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function readFavorites() {
    var parsed = safeParse(FAVORITES_KEY, []);
    return Array.isArray(parsed) ? parsed.filter(function (item) { return typeof item === "string"; }) : [];
  }

  function readPrefs() {
    var parsed = safeParse(PREFS_KEY, {});
    var prefs = {};
    Object.keys(defaults).forEach(function (key) {
      prefs[key] = typeof parsed[key] === "boolean" ? parsed[key] : defaults[key];
    });
    return prefs;
  }

  function sportKey() {
    return (new URLSearchParams(location.search).get("sport") || "nfl").toLowerCase();
  }

  function cleanTeamName(row) {
    var nm = row.querySelector(".nm");
    if (!nm) return "";
    var clone = nm.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll(".rec,.poss,.favorite-row-toggle"), function (node) { node.remove(); });
    return clone.textContent.trim();
  }

  function teamKey(name) {
    return sportKey() + ":" + String(name || "").trim().toLowerCase();
  }

  function scoreValue(row) {
    var text = row.querySelector(".sc") ? row.querySelector(".sc").textContent.trim() : "";
    var value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function gameId(card) {
    try { return new URL(card.href, location.href).searchParams.get("event") || card.getAttribute("href") || ""; }
    catch (e) { return card.getAttribute("href") || ""; }
  }

  function gameState(card) {
    if (card.querySelector(".game-status .live")) return "in";
    if (card.querySelector(".game-status .final")) return "post";
    return "pre";
  }

  function isLateGame(statusText) {
    var text = String(statusText || "").toLowerCase();
    var sport = sportKey();
    if (sport === "nfl") return /\b4th\b|\bot\b/.test(text);
    if (sport === "mlb") return /\b(7th|8th|9th|10th|11th|12th|extra)\b/.test(text);
    if (sport === "nhl") return /\b3rd\b|\bot\b|shootout/.test(text);
    if (sport === "mls" || sport === "epl") {
      var minute = text.match(/\b(\d{2,3})(?:\+\d+)?['’]?\b/);
      return minute ? Number(minute[1]) >= 75 : /stoppage|extra time/.test(text);
    }
    return false;
  }

  function snapshotCard(card) {
    var rows = card.querySelectorAll(".row");
    var away = rows[0], home = rows[1];
    if (!away || !home) return null;
    var awayName = cleanTeamName(away), homeName = cleanTeamName(home);
    var status = card.querySelector(".game-status") ? card.querySelector(".game-status").textContent.trim() : "";
    var awayScore = scoreValue(away), homeScore = scoreValue(home);
    var leader = null;
    if (awayScore != null && homeScore != null && awayScore !== homeScore) leader = awayScore > homeScore ? teamKey(awayName) : teamKey(homeName);
    return {
      id: gameId(card),
      href: card.getAttribute("href") || "",
      awayName: awayName,
      homeName: homeName,
      awayKey: teamKey(awayName),
      homeKey: teamKey(homeName),
      awayScore: awayScore,
      homeScore: homeScore,
      state: gameState(card),
      status: status,
      late: isLateGame(status),
      leader: leader
    };
  }

  function permissionState() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission || "default";
  }

  function canNotify(prefs) {
    return prefs.enabled && permissionState() === "granted";
  }

  function notify(title, body, game, kind) {
    var n;
    try {
      n = new Notification(title, {
        body: body,
        tag: "sports-gamecast-" + kind + "-" + game.id,
        renotify: true
      });
      n.onclick = function () {
        try { window.focus(); } catch (e) {}
        if (game.href) location.href = game.href;
        try { n.close(); } catch (e) {}
      };
    } catch (e) {}
  }

  function scoreLine(game) {
    var away = game.awayScore == null ? "–" : game.awayScore;
    var home = game.homeScore == null ? "–" : game.homeScore;
    return game.awayName + " " + away + " · " + game.homeName + " " + home;
  }

  function favoriteGame(game, favorites) {
    return favorites.indexOf(game.awayKey) !== -1 || favorites.indexOf(game.homeKey) !== -1;
  }

  function compare(previous, current, prefs, favorites) {
    if (!previous || !favoriteGame(current, favorites) || !canNotify(prefs)) return;

    if (prefs.gameStart && previous.state === "pre" && current.state === "in") {
      notify("Game started", current.awayName + " at " + current.homeName, current, "start");
    }

    var scoreChanged = previous.awayScore !== current.awayScore || previous.homeScore !== current.homeScore;
    var leadChanged = scoreChanged && previous.leader !== current.leader && current.leader !== null;
    if (leadChanged && prefs.leadChanges) {
      var leaderName = current.leader === current.awayKey ? current.awayName : current.homeName;
      notify("Lead change", leaderName + " leads · " + scoreLine(current), current, "lead");
    } else if (scoreChanged && prefs.scoreChanges && current.state === "in") {
      notify("Score update", scoreLine(current), current, "score");
    }

    if (prefs.lateGame && !previous.late && current.late && current.state === "in") {
      notify("Late-game alert", scoreLine(current) + (current.status ? " · " + current.status : ""), current, "late");
    }

    if (prefs.final && previous.state !== "post" && current.state === "post") {
      notify("Final", scoreLine(current), current, "final");
    }
  }

  var prefs = readPrefs();
  var previousByGame = safeParse(SNAPSHOT_KEY, {});
  if (!previousByGame || typeof previousByGame !== "object" || Array.isArray(previousByGame)) previousByGame = {};
  var processing = false;

  function processBoard() {
    if (processing) return;
    processing = true;
    var favorites = readFavorites();
    var next = {};
    Array.prototype.forEach.call(board.querySelectorAll("a.card"), function (card) {
      var current = snapshotCard(card);
      if (!current || !current.id) return;
      var storageId = sportKey() + ":" + current.id;
      compare(previousByGame[storageId], current, prefs, favorites);
      next[storageId] = current;
    });
    Object.keys(previousByGame).forEach(function (key) {
      if (!next[key] && key.indexOf(sportKey() + ":") !== 0) next[key] = previousByGame[key];
    });
    previousByGame = next;
    safeWrite(SNAPSHOT_KEY, previousByGame);
    processing = false;
  }

  var style = document.createElement("style");
  style.textContent = [
    ".alerts-panel{margin:10px 0 2px;padding:10px 12px;background:var(--panel);border:1px solid var(--border);border-radius:10px}",
    ".alerts-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".alerts-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--muted)}",
    ".alerts-enable{background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:999px;padding:5px 9px;font-size:11px;cursor:pointer}",
    ".alerts-enable.active{border-color:var(--accent);color:var(--accent)}",
    ".alerts-status{font-size:10px;color:var(--muted)}",
    ".alerts-options{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--muted)}",
    ".alerts-options label{display:inline-flex;gap:5px;align-items:center;cursor:pointer}",
    ".alerts-options input{accent-color:var(--accent)}"
  ].join("");
  document.head.appendChild(style);

  var panel = document.createElement("div");
  panel.className = "alerts-panel";
  panel.setAttribute("aria-label", "Favorite team notification preferences");
  board.parentNode.insertBefore(panel, board);

  function statusText() {
    var permission = permissionState();
    if (permission === "unsupported") return "Browser notifications are not supported here.";
    if (permission === "denied") return "Notifications are blocked in browser settings.";
    if (permission === "granted" && prefs.enabled) return "Alerts active for favorite teams on this browser.";
    if (permission === "granted") return "Permission granted; alerts are paused.";
    return "Permission is requested only when you enable alerts.";
  }

  function savePrefs() {
    safeWrite(PREFS_KEY, prefs);
    renderPanel();
  }

  function option(label, key) {
    var wrapper = document.createElement("label");
    var input = document.createElement("input");
    input.type = "checkbox";
    input.checked = prefs[key];
    input.disabled = !prefs.enabled;
    input.addEventListener("change", function () { prefs[key] = input.checked; savePrefs(); });
    wrapper.appendChild(input);
    wrapper.appendChild(document.createTextNode(label));
    return wrapper;
  }

  function renderPanel() {
    panel.innerHTML = "";
    var head = document.createElement("div");
    head.className = "alerts-head";
    var title = document.createElement("span");
    title.className = "alerts-title";
    title.textContent = "Favorite Team Alerts";
    head.appendChild(title);

    var enable = document.createElement("button");
    enable.type = "button";
    enable.className = "alerts-enable" + (prefs.enabled ? " active" : "");
    enable.textContent = prefs.enabled ? "Pause alerts" : "Enable alerts";
    enable.setAttribute("aria-pressed", prefs.enabled ? "true" : "false");
    enable.disabled = permissionState() === "unsupported" || permissionState() === "denied";
    enable.addEventListener("click", function () {
      if (prefs.enabled) {
        prefs.enabled = false;
        savePrefs();
        return;
      }
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        prefs.enabled = true;
        savePrefs();
        return;
      }
      Notification.requestPermission().then(function (permission) {
        prefs.enabled = permission === "granted";
        savePrefs();
      });
    });
    head.appendChild(enable);

    var status = document.createElement("span");
    status.className = "alerts-status";
    status.setAttribute("role", "status");
    status.textContent = statusText();
    head.appendChild(status);
    panel.appendChild(head);

    var options = document.createElement("div");
    options.className = "alerts-options";
    options.appendChild(option("Game start", "gameStart"));
    options.appendChild(option("Score", "scoreChanges"));
    options.appendChild(option("Lead change", "leadChanges"));
    options.appendChild(option("Late game", "lateGame"));
    options.appendChild(option("Final", "final"));
    panel.appendChild(options);
  }

  var observer = new MutationObserver(function () { processBoard(); });
  observer.observe(board, { childList: true, subtree: true, characterData: true });
  renderPanel();
  processBoard();
})();
