(function (root) {
  "use strict";

  var SPORTS = {
    mlb: { path: "baseball/mlb", kind: "baseball" },
    nhl: { path: "hockey/nhl", kind: "hockey" },
    mls: { path: "soccer/usa.1", kind: "soccer" },
    epl: { path: "soccer/eng.1", kind: "soccer" }
  };

  function get(obj, path, dflt) {
    try {
      var cur = obj;
      for (var i = 0; i < path.length; i++) {
        if (cur == null) return dflt;
        cur = cur[path[i]];
      }
      return cur == null ? dflt : cur;
    } catch (e) {
      return dflt;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function asNumber(value, dflt) {
    var n = Number(value);
    return Number.isFinite(n) ? n : dflt;
  }

  function latest(items) {
    if (!Array.isArray(items)) return null;
    for (var i = items.length - 1; i >= 0; i--) {
      if (items[i]) return items[i];
    }
    return null;
  }

  function teamId(item) {
    return String(get(item, ["team", "id"], get(item, ["team", "uid"], "")) || "");
  }

  function competition(summary, sbEvent) {
    return get(sbEvent, ["competitions", 0], null) || get(summary, ["header", "competitions", 0], {}) || {};
  }

  function statusOf(summary, sbEvent) {
    return get(sbEvent, ["competitions", 0, "status"], null) ||
      get(sbEvent, ["status"], null) ||
      get(summary, ["header", "competitions", 0, "status"], null) || {};
  }

  function teamPair(summary, sbEvent) {
    var comps = get(competition(summary, sbEvent), ["competitors"], []);
    if (!comps.length) comps = get(summary, ["header", "competitions", 0, "competitors"], []);
    var away = comps.find(function (c) { return c.homeAway === "away"; }) || comps[1] || {};
    var home = comps.find(function (c) { return c.homeAway === "home"; }) || comps[0] || {};
    return { away: away, home: home };
  }

  function teamName(comp) {
    var t = comp.team || {};
    return t.shortDisplayName || t.name || t.abbreviation || t.displayName || "";
  }

  function athleteName(value) {
    return get(value, ["athlete", "displayName"], get(value, ["displayName"], get(value, ["fullName"], "")));
  }

  function personName(value) {
    return athleteName(value) || get(value, ["athlete", "shortName"], get(value, ["shortName"], ""));
  }

  function occupied(value) {
    if (value == null || value === false || value === 0 || value === "0") return false;
    return true;
  }

  function detailText(status) {
    return get(status, ["type", "shortDetail"], get(status, ["type", "detail"], ""));
  }

  function stateOf(status) {
    return get(status, ["type", "state"], "pre");
  }

  function playText(play) {
    return get(play, ["text"], get(play, ["shortText"], get(play, ["type", "text"], "")));
  }

  function getTeamBox(summary, id) {
    var teams = get(summary, ["boxscore", "teams"], []);
    return teams.find(function (row) { return String(get(row, ["team", "id"], "")) === String(id); }) || null;
  }

  function getStat(row, names) {
    if (!row) return "";
    var stats = row.statistics || row.stats || [];
    for (var i = 0; i < stats.length; i++) {
      var s = stats[i] || {};
      var key = String(s.name || s.label || s.abbreviation || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (var j = 0; j < names.length; j++) {
        var wanted = String(names[j]).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (key === wanted) return s.displayValue != null ? s.displayValue : (s.value != null ? String(s.value) : "");
      }
    }
    return "";
  }

  function baseballModel(summary, sbEvent) {
    var comp = competition(summary, sbEvent);
    var status = statusOf(summary, sbEvent);
    var plays = summary.plays || [];
    var last = latest(plays) || {};
    var sit = comp.situation || get(sbEvent, ["competitions", 0, "situation"], null) || last.situation || {};
    var count = last.count || {};
    var detail = detailText(status);
    var inning = asNumber(status.period, asNumber(get(last, ["period", "number"], null), null));
    var half = /bottom|bot\b/i.test(detail) ? "Bottom" : (/top\b/i.test(detail) ? "Top" : "");
    var balls = asNumber(sit.balls, asNumber(count.balls, null));
    var strikes = asNumber(sit.strikes, asNumber(count.strikes, null));
    var outs = asNumber(sit.outs, asNumber(last.outs, null));
    var onFirst = sit.onFirst != null ? sit.onFirst : get(last, ["runners", "first"], null);
    var onSecond = sit.onSecond != null ? sit.onSecond : get(last, ["runners", "second"], null);
    var onThird = sit.onThird != null ? sit.onThird : get(last, ["runners", "third"], null);
    var batter = athleteName(sit.batter || get(last, ["batter"], null));
    var pitcher = athleteName(sit.pitcher || get(last, ["pitcher"], null));
    var onDeck = personName(sit.onDeck || get(last, ["onDeck"], null));
    var pitcherPitches = asNumber(get(sit, ["pitcher", "pitchCount"], get(sit, ["pitcher", "pitches"], get(last, ["pitchCount"], null))), null);
    var pitchType = get(last, ["pitchType", "text"], get(last, ["pitchType"], ""));
    var pitchSpeed = get(last, ["pitchSpeed"], get(last, ["pitchVelocity"], ""));
    var pitchDescription = [pitchType, pitchSpeed ? String(pitchSpeed) + " MPH" : ""].filter(Boolean).join(" ");
    var runners = {
      first: personName(onFirst),
      second: personName(onSecond),
      third: personName(onThird)
    };
    var headline = [half, inning != null ? String(inning) : ""].filter(Boolean).join(" ") || detail || "Live inning";
    var countText = (balls != null && strikes != null) ? balls + "-" + strikes : "Count —";
    var outsText = outs != null ? outs + (outs === 1 ? " out" : " outs") : "Outs —";
    return {
      kind: "baseball",
      headline: headline,
      detail: playText(last),
      balls: balls,
      strikes: strikes,
      outs: outs,
      countText: countText,
      outsText: outsText,
      bases: { first: occupied(onFirst), second: occupied(onSecond), third: occupied(onThird) },
      batter: batter,
      pitcher: pitcher,
      onDeck: onDeck,
      pitcherPitches: pitcherPitches,
      pitchDescription: pitchDescription,
      runners: runners,
      state: stateOf(status)
    };
  }

  function hockeyModel(summary, sbEvent) {
    var comp = competition(summary, sbEvent);
    var status = statusOf(summary, sbEvent);
    var pairs = teamPair(summary, sbEvent);
    var plays = summary.plays || [];
    var last = latest(plays) || {};
    var awayId = get(pairs.away, ["team", "id"], "");
    var homeId = get(pairs.home, ["team", "id"], "");
    var eventTeam = teamId(last);
    var awayBox = getTeamBox(summary, awayId);
    var homeBox = getTeamBox(summary, homeId);
    var sit = comp.situation || {};
    var latestText = playText(last);
    var powerPlay = !!(sit.powerPlay || sit.powerPlayTime || /power play|man advantage/i.test(latestText));
    return {
      kind: "hockey",
      headline: detailText(status) || ((status.period || "") ? "Period " + status.period : "Live"),
      detail: latestText,
      eventSide: eventTeam && eventTeam === String(awayId) ? "away" : (eventTeam && eventTeam === String(homeId) ? "home" : "center"),
      away: teamName(pairs.away),
      home: teamName(pairs.home),
      awayShots: getStat(awayBox, ["shots", "shotsOnGoal", "sog"]),
      homeShots: getStat(homeBox, ["shots", "shotsOnGoal", "sog"]),
      powerPlay: powerPlay,
      state: stateOf(status)
    };
  }

  function soccerModel(summary, sbEvent) {
    var status = statusOf(summary, sbEvent);
    var pairs = teamPair(summary, sbEvent);
    var commentary = summary.commentary || summary.plays || [];
    var last = latest(commentary) || {};
    var awayId = get(pairs.away, ["team", "id"], "");
    var homeId = get(pairs.home, ["team", "id"], "");
    var eventTeam = teamId(last);
    var awayBox = getTeamBox(summary, awayId);
    var homeBox = getTeamBox(summary, homeId);
    return {
      kind: "soccer",
      headline: detailText(status) || "Live match",
      detail: playText(last),
      eventSide: eventTeam && eventTeam === String(awayId) ? "away" : (eventTeam && eventTeam === String(homeId) ? "home" : "center"),
      away: teamName(pairs.away),
      home: teamName(pairs.home),
      awayPossession: getStat(awayBox, ["possessionPct", "possession", "possessionPercentage"]),
      homePossession: getStat(homeBox, ["possessionPct", "possession", "possessionPercentage"]),
      awayShots: getStat(awayBox, ["totalShots", "shots", "shotsOnGoal"]),
      homeShots: getStat(homeBox, ["totalShots", "shots", "shotsOnGoal"]),
      awayCorners: getStat(awayBox, ["wonCorners", "cornerKicks", "corners"]),
      homeCorners: getStat(homeBox, ["wonCorners", "cornerKicks", "corners"]),
      state: stateOf(status)
    };
  }

  function ensureStyles(doc) {
    if (!doc || doc.getElementById("sportVisualStyles")) return;
    var style = doc.createElement("style");
    style.id = "sportVisualStyles";
    style.textContent = [
      ".sport-visual{position:relative;margin-top:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--panel2);min-height:128px}",
      ".sv-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px;font-size:11px;color:var(--muted)}",
      ".sv-chip{border:1px solid var(--border);background:var(--panel);border-radius:999px;padding:4px 8px}",
      ".sv-chip strong{color:var(--text)}",
      ".sv-baseball{height:160px;background:radial-gradient(circle at 50% 70%,#8a673c 0 13%,transparent 14%),linear-gradient(#1d6b3a,#15542d)}",
      ".sv-diamond{position:absolute;width:80px;height:80px;left:50%;top:48%;transform:translate(-50%,-50%) rotate(45deg);border:2px solid rgba(255,255,255,.82);background:rgba(161,117,67,.55)}",
      ".sv-base{position:absolute;width:16px;height:16px;background:#f4f4f4;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}",
      ".sv-base.occupied{background:var(--accent);box-shadow:0 0 10px rgba(255,204,0,.65)}",
      ".sv-b1{right:-9px;top:32px}.sv-b2{top:-9px;left:32px}.sv-b3{left:-9px;top:32px}",
      ".sv-homeplate{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);font-size:10px;color:#fff;font-weight:800}",
      ".sv-count{position:absolute;right:10px;top:10px;text-align:right;color:#fff;font-size:11px;line-height:1.5;text-shadow:0 1px 2px #000}",
      ".sv-baseball-caption{position:absolute;left:12px;top:10px;right:88px;color:#fff;font-size:11px;line-height:1.35;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".sv-baserunners{position:absolute;left:12px;bottom:10px;color:rgba(255,255,255,.92);font-size:10px;line-height:1.35;text-shadow:0 1px 2px #000}",
      ".sv-hockey{height:138px;background:#eef6fa;color:#16212b;border-color:#b8c7d2}",
      ".sv-rink{position:absolute;inset:10px;border:2px solid #c9d4dc;border-radius:36px;background:rgba(255,255,255,.92);overflow:hidden}",
      ".sv-rink:before{content:'';position:absolute;left:50%;top:0;bottom:0;width:2px;background:#d34;transform:translateX(-50%)}",
      ".sv-blue{position:absolute;top:0;bottom:0;width:2px;background:#2878c8}.sv-blue.left{left:31%}.sv-blue.right{right:31%}",
      ".sv-center-circle{position:absolute;left:50%;top:50%;width:42px;height:42px;border:2px solid #d34;border-radius:50%;transform:translate(-50%,-50%)}",
      ".sv-goal{position:absolute;top:50%;width:12px;height:34px;border:2px solid #d34;transform:translateY(-50%)}.sv-goal.left{left:6px;border-left:0}.sv-goal.right{right:6px;border-right:0}",
      ".sv-puck{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:#111;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.55);transform:translate(-50%,-50%);transition:left .5s ease}",
      ".sv-rink-label{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:9px;color:#52616c;white-space:nowrap}",
      ".sv-power{position:absolute;top:5px;left:50%;transform:translateX(-50%);background:#ffd400;color:#111;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:900}",
      ".sv-soccer{height:148px;background:#176b39;color:#fff;border-color:#1b7c43}",
      ".sv-pitch{position:absolute;inset:9px;border:2px solid rgba(255,255,255,.86)}",
      ".sv-pitch:before{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:2px solid rgba(255,255,255,.75)}",
      ".sv-center{position:absolute;left:50%;top:50%;width:42px;height:42px;border:2px solid rgba(255,255,255,.78);border-radius:50%;transform:translate(-50%,-50%)}",
      ".sv-box{position:absolute;top:26%;bottom:26%;width:17%;border:2px solid rgba(255,255,255,.78)}.sv-box.left{left:-2px}.sv-box.right{right:-2px}",
      ".sv-ball{position:absolute;top:50%;width:14px;height:14px;border-radius:50%;background:#fff;color:#111;box-shadow:0 1px 5px rgba(0,0,0,.5);transform:translate(-50%,-50%);transition:left .5s ease}",
      ".sv-pitch-label{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);font-size:9px;color:rgba(255,255,255,.85);white-space:nowrap}",
      "@media(max-width:640px){.sport-visual{min-height:118px}.sv-baseball{height:148px}.sv-hockey{height:128px}.sv-soccer{height:136px}}"
    ].join("");
    doc.head.appendChild(style);
  }

  function hostFor(doc) {
    var football = doc.getElementById("fieldGfx");
    if (!football || !football.parentNode) return null;
    football.style.display = "none";
    var host = doc.getElementById("sportVisualGfx");
    if (!host) {
      host = doc.createElement("div");
      host.id = "sportVisualGfx";
      host.className = "sport-visual";
      football.insertAdjacentElement("afterend", host);
    }
    return host;
  }

  function renderBaseball(model, host) {
    host.className = "sport-visual sv-baseball";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", model.headline + ", " + model.countText + ", " + model.outsText);
    host.innerHTML = "<div class='sv-diamond'>" +
      "<span class='sv-base sv-b1" + (model.bases.first ? " occupied" : "") + "'></span>" +
      "<span class='sv-base sv-b2" + (model.bases.second ? " occupied" : "") + "'></span>" +
      "<span class='sv-base sv-b3" + (model.bases.third ? " occupied" : "") + "'></span></div>" +
      "<div class='sv-homeplate'>HOME</div>" +
      (model.detail ? "<div class='sv-baseball-caption'><strong>Last pitch:</strong> " + esc(model.detail) + (model.pitchDescription ? " · " + esc(model.pitchDescription) : "") + "</div>" : "") +
      "<div class='sv-baserunners'>" + esc(baseRunnerText(model)) + "</div>" +
      "<div class='sv-count'><strong>" + esc(model.headline) + "</strong><br>" + esc(model.countText) + "<br>" + esc(model.outsText) + "</div>";
  }

  function baseRunnerText(model) {
    var bits = [];
    var bases = [["1B", "first"], ["2B", "second"], ["3B", "third"]];
    for (var i = 0; i < bases.length; i++) {
      var label = bases[i][0];
      var key = bases[i][1];
      bits.push(label + ": " + (model.runners[key] || (model.bases[key] ? "Runner" : "Empty")));
    }
    return bits.join(" · ");
  }

  function renderHockey(model, host) {
    var puckLeft = model.eventSide === "away" ? 30 : (model.eventSide === "home" ? 70 : 50);
    host.className = "sport-visual sv-hockey";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", model.headline + ", latest event shown on rink");
    host.innerHTML = "<div class='sv-rink'>" +
      "<span class='sv-blue left'></span><span class='sv-blue right'></span><span class='sv-center-circle'></span>" +
      "<span class='sv-goal left'></span><span class='sv-goal right'></span>" +
      "<span class='sv-puck' style='left:" + puckLeft + "%'></span>" +
      (model.powerPlay ? "<span class='sv-power'>POWER PLAY</span>" : "") +
      "<span class='sv-rink-label'>latest event · " + esc(model.away) + " ← → " + esc(model.home) + "</span></div>";
  }

  function renderSoccer(model, host) {
    var ballLeft = model.eventSide === "away" ? 35 : (model.eventSide === "home" ? 65 : 50);
    host.className = "sport-visual sv-soccer";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", model.headline + ", latest event shown on pitch");
    host.innerHTML = "<div class='sv-pitch'><span class='sv-center'></span><span class='sv-box left'></span><span class='sv-box right'></span>" +
      "<span class='sv-ball' style='left:" + ballLeft + "%'>•</span>" +
      "<span class='sv-pitch-label'>latest event · " + esc(model.away) + " ← → " + esc(model.home) + "</span></div>";
  }

  function metaHtml(model) {
    var bits = [];
    if (model.kind === "baseball") {
      if (model.batter) bits.push("<span class='sv-chip'><strong>At bat:</strong> " + esc(model.batter) + "</span>");
      if (model.pitcher) bits.push("<span class='sv-chip'><strong>Pitching:</strong> " + esc(model.pitcher) + "</span>");
      if (model.pitcherPitches != null) bits.push("<span class='sv-chip'><strong>Pitches:</strong> " + esc(model.pitcherPitches) + "</span>");
      if (model.onDeck) bits.push("<span class='sv-chip'><strong>On deck:</strong> " + esc(model.onDeck) + "</span>");
    } else if (model.kind === "hockey") {
      if (model.awayShots || model.homeShots) bits.push("<span class='sv-chip'><strong>Shots:</strong> " + esc(model.awayShots || "—") + "–" + esc(model.homeShots || "—") + "</span>");
    } else if (model.kind === "soccer") {
      if (model.awayPossession || model.homePossession) bits.push("<span class='sv-chip'><strong>Possession:</strong> " + esc(model.awayPossession || "—") + " / " + esc(model.homePossession || "—") + "</span>");
      if (model.awayShots || model.homeShots) bits.push("<span class='sv-chip'><strong>Shots:</strong> " + esc(model.awayShots || "—") + "–" + esc(model.homeShots || "—") + "</span>");
      if (model.awayCorners || model.homeCorners) bits.push("<span class='sv-chip'><strong>Corners:</strong> " + esc(model.awayCorners || "—") + "–" + esc(model.homeCorners || "—") + "</span>");
    }
    return bits.length ? "<div class='sv-meta'>" + bits.join("") + "</div>" : "";
  }

  function buildModel(sport, summary, sbEvent) {
    var cfg = SPORTS[sport];
    if (!cfg) return null;
    if (cfg.kind === "baseball") return baseballModel(summary, sbEvent);
    if (cfg.kind === "hockey") return hockeyModel(summary, sbEvent);
    return soccerModel(summary, sbEvent);
  }

  function renderForSport(sport, summary, sbEvent, doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || !SPORTS[sport]) return null;
    ensureStyles(doc);
    var host = hostFor(doc);
    if (!host) return null;
    var model = buildModel(sport, summary, sbEvent);
    if (!model) return null;

    if (model.kind === "baseball") renderBaseball(model, host);
    else if (model.kind === "hockey") renderHockey(model, host);
    else renderSoccer(model, host);

    var box = doc.getElementById("situationBox");
    if (box) box.classList.remove("hidden");
    var headline = doc.getElementById("downDistance");
    if (headline) headline.textContent = model.headline;
    var detail = doc.getElementById("lastPlay");
    if (detail) detail.innerHTML = (model.detail ? "<b>Latest:</b> " + esc(model.detail) : "") + metaHtml(model);
    return model;
  }

  function scoreboardDateFromISO(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    d = new Date(d.getTime() - 6 * 3600 * 1000);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  }

  function init() {
    if (typeof document === "undefined" || typeof fetch === "undefined") return;
    var qs = new URLSearchParams(location.search);
    var sport = String(qs.get("sport") || "nfl").toLowerCase();
    if (!SPORTS[sport]) return;
    var eventId = qs.get("event");
    if (!eventId) return;

    var cfg = SPORTS[sport];
    var api = "https://site.api.espn.com/apis/site/v2/sports/" + cfg.path;
    var timer = null;
    var lastSummary = null;
    var lastEvent = null;

    function fetchJSON(url) {
      return fetch(url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    function load() {
      return fetchJSON(api + "/summary?event=" + encodeURIComponent(eventId)).then(function (summary) {
        var iso = get(summary, ["header", "competitions", 0, "date"], null);
        var date = qs.get("date") || scoreboardDateFromISO(iso);
        var sbUrl = api + "/scoreboard" + (date ? "?dates=" + encodeURIComponent(date) : "");
        return fetchJSON(sbUrl).catch(function () { return null; }).then(function (sb) {
          var ev = sb && Array.isArray(sb.events) ? sb.events.find(function (item) { return String(item.id) === String(eventId); }) : null;
          lastSummary = summary;
          lastEvent = ev;
          var model = renderForSport(sport, summary, ev, document);
          var state = model ? model.state : "pre";
          clearTimeout(timer);
          timer = setTimeout(load, state === "in" ? 10000 : (state === "pre" ? 30000 : 120000));
        });
      }).catch(function () {
        clearTimeout(timer);
        timer = setTimeout(load, 30000);
      });
    }

    var situation = document.getElementById("situationBox");
    if (situation && typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(function () {
        if (lastSummary && situation.classList.contains("hidden")) {
          renderForSport(sport, lastSummary, lastEvent, document);
        }
      });
      observer.observe(situation, { attributes: true, attributeFilter: ["class"] });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) clearTimeout(timer);
      else load();
    });

    load();
  }

  root.SportVisuals = {
    buildModel: buildModel,
    baseballModel: baseballModel,
    hockeyModel: hockeyModel,
    soccerModel: soccerModel,
    renderForSport: renderForSport,
    scoreboardDateFromISO: scoreboardDateFromISO
  };

  if (typeof document !== "undefined") init();
})(typeof globalThis !== "undefined" ? globalThis : this);
