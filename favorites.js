(function () {
  "use strict";

  var STORAGE_KEY = "sports-gamecast-favorites-v1";
  var FILTER_KEY = "sports-gamecast-my-teams-filter";
  var board = document.getElementById("board");
  if (!board) return;

  function readFavorites() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter(function (item) { return typeof item === "string"; }) : [];
    } catch (e) {
      return [];
    }
  }

  function writeFavorites(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
  }

  function readFilter() {
    try { return localStorage.getItem(FILTER_KEY) === "1"; } catch (e) { return false; }
  }

  function writeFilter(enabled) {
    try { localStorage.setItem(FILTER_KEY, enabled ? "1" : "0"); } catch (e) {}
  }

  function teamKey(name) {
    var sport = new URLSearchParams(location.search).get("sport") || "nfl";
    return sport.toLowerCase() + ":" + name.trim().toLowerCase();
  }

  function teamName(row) {
    var nm = row.querySelector(".nm");
    if (!nm) return "";
    var clone = nm.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll(".rec,.poss"), function (node) { node.remove(); });
    return clone.textContent.trim();
  }

  function currentTeams() {
    var seen = new Map();
    Array.prototype.forEach.call(board.querySelectorAll(".game .row"), function (row) {
      var name = teamName(row);
      if (!name) return;
      var key = teamKey(name);
      if (!seen.has(key)) seen.set(key, name);
    });
    return Array.from(seen.entries()).map(function (entry) { return { key: entry[0], name: entry[1] }; });
  }

  var style = document.createElement("style");
  style.textContent = [
    ".favorites-panel{margin:14px 0 2px;padding:10px 12px;background:var(--panel);border:1px solid var(--border);border-radius:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    ".favorites-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-right:2px}",
    ".favorite-chip,.my-teams-toggle{background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:999px;padding:5px 9px;font-size:11px;cursor:pointer}",
    ".favorite-chip[aria-pressed=true],.my-teams-toggle.active{border-color:var(--accent);color:var(--accent)}",
    ".favorite-empty{font-size:11px;color:var(--muted)}",
    ".favorite-hidden{display:none!important}",
    ".favorites-count{font-size:10px;color:var(--muted)}"
  ].join("");
  document.head.appendChild(style);

  var panel = document.createElement("div");
  panel.className = "favorites-panel";
  panel.setAttribute("aria-label", "Favorite teams");
  board.parentNode.insertBefore(panel, board);

  var favorites = readFavorites();
  var filterEnabled = readFilter();
  var rendering = false;

  function applyFilter() {
    var favoriteSet = new Set(favorites);
    var cards = board.querySelectorAll("a.card");
    Array.prototype.forEach.call(cards, function (card) {
      var keys = Array.prototype.map.call(card.querySelectorAll(".row"), function (row) {
        return teamKey(teamName(row));
      });
      var match = keys.some(function (key) { return favoriteSet.has(key); });
      card.classList.toggle("favorite-hidden", filterEnabled && !match);
    });

    Array.prototype.forEach.call(board.querySelectorAll(".grid"), function (grid) {
      var hasVisible = Array.prototype.some.call(grid.querySelectorAll("a.card"), function (card) {
        return !card.classList.contains("favorite-hidden");
      });
      var label = grid.previousElementSibling;
      grid.classList.toggle("favorite-hidden", filterEnabled && !hasVisible);
      if (label && label.classList.contains("daylabel")) label.classList.toggle("favorite-hidden", filterEnabled && !hasVisible);
    });
  }

  function renderPanel() {
    if (rendering) return;
    rendering = true;
    var teams = currentTeams();
    panel.innerHTML = "";

    var label = document.createElement("span");
    label.className = "favorites-label";
    label.textContent = "My Teams";
    panel.appendChild(label);

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "my-teams-toggle" + (filterEnabled ? " active" : "");
    toggle.textContent = filterEnabled ? "Showing favorites" : "Show favorites only";
    toggle.setAttribute("aria-pressed", filterEnabled ? "true" : "false");
    toggle.disabled = favorites.length === 0;
    toggle.addEventListener("click", function () {
      filterEnabled = !filterEnabled;
      writeFilter(filterEnabled);
      renderPanel();
      applyFilter();
    });
    panel.appendChild(toggle);

    if (!teams.length) {
      var pending = document.createElement("span");
      pending.className = "favorite-empty";
      pending.textContent = "Teams will appear when the slate loads.";
      panel.appendChild(pending);
      rendering = false;
      return;
    }

    teams.forEach(function (team) {
      var chip = document.createElement("button");
      var selected = favorites.indexOf(team.key) !== -1;
      chip.type = "button";
      chip.className = "favorite-chip";
      chip.textContent = (selected ? "★ " : "☆ ") + team.name;
      chip.setAttribute("aria-pressed", selected ? "true" : "false");
      chip.title = selected ? "Remove from My Teams" : "Add to My Teams";
      chip.addEventListener("click", function () {
        if (selected) favorites = favorites.filter(function (key) { return key !== team.key; });
        else favorites = favorites.concat(team.key);
        if (!favorites.length) filterEnabled = false;
        writeFavorites(favorites);
        writeFilter(filterEnabled);
        renderPanel();
        applyFilter();
      });
      panel.appendChild(chip);
    });

    var count = document.createElement("span");
    count.className = "favorites-count";
    count.textContent = favorites.length + (favorites.length === 1 ? " favorite" : " favorites");
    panel.appendChild(count);
    rendering = false;
  }

  var observer = new MutationObserver(function () {
    renderPanel();
    applyFilter();
  });
  observer.observe(board, { childList: true, subtree: true });
  renderPanel();
})();
