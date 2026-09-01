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
    } catch (e) { return []; }
  }
  function writeFavorites(items) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {} }
  function readFilter() { try { return localStorage.getItem(FILTER_KEY) === "1"; } catch (e) { return false; } }
  function writeFilter(enabled) { try { localStorage.setItem(FILTER_KEY, enabled ? "1" : "0"); } catch (e) {} }
  function currentSport() { return (new URLSearchParams(location.search).get("sport") || "nfl").toLowerCase(); }
  function teamKey(name) { return currentSport() + ":" + name.trim().toLowerCase(); }
  function teamName(row) {
    var nm = row.querySelector(".nm");
    if (!nm) return "";
    var clone = nm.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll(".rec,.poss,.favorite-row-button"), function (node) { node.remove(); });
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
    ".favorites-count{font-size:10px;color:var(--muted)}",
    ".favorite-row-button{order:-1;flex:0 0 auto;width:28px;height:28px;display:inline-grid;place-items:center;background:transparent;color:var(--muted);border:1px solid transparent;border-radius:999px;cursor:pointer;font-size:15px;line-height:1}",
    ".favorite-row-button:hover,.favorite-row-button:focus-visible{border-color:var(--border);color:var(--accent);outline:none}",
    ".favorite-row-button[aria-pressed=true]{color:var(--accent)}",
    ".favorites-filter-empty{margin:20px 0;padding:24px;background:var(--panel);border:1px dashed var(--border);border-radius:10px;text-align:center;color:var(--muted);font-size:13px}",
    ".favorites-filter-empty b{color:var(--text)}"
  ].join("");
  document.head.appendChild(style);

  var panel = document.createElement("div");
  panel.className = "favorites-panel";
  panel.setAttribute("aria-label", "Favorite teams");
  board.parentNode.insertBefore(panel, board);

  var emptyState = document.createElement("div");
  emptyState.className = "favorites-filter-empty favorite-hidden";
  emptyState.innerHTML = "<b>No My Teams games on this slate.</b><br>Show all games or choose another date.";
  emptyState.setAttribute("role", "status");
  emptyState.setAttribute("aria-live", "polite");
  board.parentNode.insertBefore(emptyState, board.nextSibling);

  var favorites = readFavorites();
  var filterEnabled = readFilter();
  var rendering = false;

  function toggleFavorite(key) {
    if (favorites.indexOf(key) !== -1) favorites = favorites.filter(function (item) { return item !== key; });
    else favorites = favorites.concat(key);
    if (!favorites.length) filterEnabled = false;
    writeFavorites(favorites);
    writeFilter(filterEnabled);
    refreshFavoritesUI();
  }

  function decorateRows() {
    Array.prototype.forEach.call(board.querySelectorAll(".game .row"), function (row) {
      var name = teamName(row);
      if (!name) return;
      var key = teamKey(name);
      var button = row.querySelector(".favorite-row-button");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "favorite-row-button";
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(button.getAttribute("data-team-key"));
        });
        row.insertBefore(button, row.firstChild);
      }
      var selected = favorites.indexOf(key) !== -1;
      button.setAttribute("data-team-key", key);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.setAttribute("aria-label", (selected ? "Remove " : "Add ") + name + (selected ? " from My Teams" : " to My Teams"));
      button.title = selected ? "Remove from My Teams" : "Add to My Teams";
      button.textContent = selected ? "★" : "☆";
    });
  }

  function applyFilter() {
    var favoriteSet = new Set(favorites);
    var visibleCards = 0;
    Array.prototype.forEach.call(board.querySelectorAll("a.card"), function (card) {
      var keys = Array.prototype.map.call(card.querySelectorAll(".row"), function (row) { return teamKey(teamName(row)); });
      var match = keys.some(function (key) { return favoriteSet.has(key); });
      var hidden = filterEnabled && !match;
      card.classList.toggle("favorite-hidden", hidden);
      if (!hidden) visibleCards += 1;
    });
    Array.prototype.forEach.call(board.querySelectorAll(".grid"), function (grid) {
      var hasVisible = Array.prototype.some.call(grid.querySelectorAll("a.card"), function (card) { return !card.classList.contains("favorite-hidden"); });
      var label = grid.previousElementSibling;
      grid.classList.toggle("favorite-hidden", filterEnabled && !hasVisible);
      if (label && label.classList.contains("daylabel")) label.classList.toggle("favorite-hidden", filterEnabled && !hasVisible);
    });
    emptyState.classList.toggle("favorite-hidden", !(filterEnabled && visibleCards === 0));
  }

  function renderPanel() {
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
      refreshFavoritesUI();
    });
    panel.appendChild(toggle);

    if (!teams.length) {
      var pending = document.createElement("span");
      pending.className = "favorite-empty";
      pending.textContent = "Teams will appear when the slate loads.";
      panel.appendChild(pending);
    } else {
      teams.forEach(function (team) {
        var chip = document.createElement("button");
        var selected = favorites.indexOf(team.key) !== -1;
        chip.type = "button";
        chip.className = "favorite-chip";
        chip.textContent = (selected ? "★ " : "☆ ") + team.name;
        chip.setAttribute("aria-pressed", selected ? "true" : "false");
        chip.title = selected ? "Remove from My Teams" : "Add to My Teams";
        chip.addEventListener("click", function () { toggleFavorite(team.key); });
        panel.appendChild(chip);
      });
    }

    var count = document.createElement("span");
    count.className = "favorites-count";
    count.textContent = favorites.length + (favorites.length === 1 ? " favorite" : " favorites");
    panel.appendChild(count);
  }

  function refreshFavoritesUI() {
    if (rendering) return;
    rendering = true;
    decorateRows();
    renderPanel();
    applyFilter();
    rendering = false;
  }

  var observer = new MutationObserver(function (mutations) {
    if (rendering) return;
    var scoreboardChanged = mutations.some(function (mutation) {
      return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
        return node.nodeType === 1 && !node.classList.contains("favorite-row-button");
      });
    });
    if (scoreboardChanged) refreshFavoritesUI();
  });
  observer.observe(board, { childList: true, subtree: true });
  refreshFavoritesUI();
})();
