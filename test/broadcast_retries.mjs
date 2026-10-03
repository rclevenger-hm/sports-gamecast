import assert from "node:assert/strict";
import test from "node:test";
import { fetchScoreboard, generateMappings } from "../scripts/generate-broadcasts.mjs";

const scoreboardUrl = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261003";
const scoreboard = { events: [] };

// No live provider requests or real timers: an unexpected extra attempt fails immediately.
function mockRequests(outcomes) {
  const calls = [];
  const delays = [];
  let jsonCalls = 0;
  return {
    calls,
    delays,
    get jsonCalls() { return jsonCalls; },
    async fetchImpl(url, options) {
      const outcome = outcomes[calls.length];
      calls.push({ url, options });
      assert.ok(outcome, "unexpected extra scoreboard request");
      if (outcome instanceof Error) throw outcome;
      return {
        ok: outcome.status >= 200 && outcome.status < 300,
        status: outcome.status,
        async json() {
          jsonCalls += 1;
          assert.ok(this.ok, "failed HTTP responses must not be parsed as scoreboards");
          if (outcome.jsonError) throw outcome.jsonError;
          return outcome.body ?? scoreboard;
        }
      };
    },
    async sleepImpl(ms) { delays.push(ms); }
  };
}

test("a successful first response is returned without retrying", async () => {
  const requests = mockRequests([{ status: 200 }]);
  assert.strictEqual(await fetchScoreboard(scoreboardUrl, requests), scoreboard);
  assert.deepEqual(requests.calls, [{
    url: scoreboardUrl,
    options: { headers: { accept: "application/json" } }
  }]);
  assert.deepEqual(requests.delays, []);
  assert.equal(requests.jsonCalls, 1);
});

for (const status of [408, 425, 429, 500, 502, 503, 504, 599]) {
  test(`HTTP ${status} retries the same request and returns the recovered scoreboard`, async () => {
    const requests = mockRequests([{ status }, { status: 200 }]);
    assert.strictEqual(await fetchScoreboard(scoreboardUrl, requests), scoreboard);
    assert.equal(requests.calls.length, 2);
    assert.deepEqual(requests.calls[1], requests.calls[0]);
    assert.deepEqual(requests.delays, [250]);
    assert.equal(requests.jsonCalls, 1);
  });
}

test("the default retry budget allows recovery on the third attempt with exponential backoff", async () => {
  const requests = mockRequests([{ status: 429 }, { status: 503 }, { status: 200 }]);
  assert.strictEqual(await fetchScoreboard(scoreboardUrl, requests), scoreboard);
  assert.equal(requests.calls.length, 3);
  assert.deepEqual(requests.delays, [250, 500]);
  assert.equal(requests.jsonCalls, 1);
});

test("the next request waits for the backoff to finish", async () => {
  const requests = mockRequests([{ status: 503 }, { status: 200 }]);
  let startSleep;
  let finishSleep;
  const sleeping = new Promise(resolve => { startSleep = resolve; });
  const backoff = new Promise(resolve => { finishSleep = resolve; });
  const pending = fetchScoreboard(scoreboardUrl, {
    ...requests,
    sleepImpl(ms) {
      requests.delays.push(ms);
      startSleep();
      return backoff;
    }
  });
  await sleeping;
  try {
    assert.equal(requests.calls.length, 1, "the retry must not start while backoff is pending");
    assert.deepEqual(requests.delays, [250]);
  } finally {
    finishSleep();
    await pending;
  }
  assert.equal(requests.calls.length, 2);
});

test("exhausted retries report the final HTTP status without a fourth request or final sleep", async () => {
  const requests = mockRequests([{ status: 429 }, { status: 503 }, { status: 504 }]);
  await assert.rejects(fetchScoreboard(scoreboardUrl, requests), {
    message: "schedule fetch failed: HTTP 504"
  });
  assert.equal(requests.calls.length, 3);
  assert.deepEqual(requests.delays, [250, 500]);
  assert.equal(requests.jsonCalls, 0);
});

for (const retries of [0, 1]) {
  test(`a custom budget of ${retries} retries limits attempts and waits`, async () => {
    const requests = mockRequests(Array.from({ length: retries + 1 }, () => ({ status: 503 })));
    await assert.rejects(fetchScoreboard(scoreboardUrl, { ...requests, retries }), {
      message: "schedule fetch failed: HTTP 503"
    });
    assert.equal(requests.calls.length, retries + 1);
    assert.deepEqual(requests.delays, retries === 0 ? [] : [250]);
  });
}

for (const status of [400, 401, 403, 404, 409, 422, 499, 600]) {
  test(`HTTP ${status} fails immediately without consuming retries`, async () => {
    const requests = mockRequests([{ status }]);
    await assert.rejects(fetchScoreboard(scoreboardUrl, requests), {
      message: `schedule fetch failed: HTTP ${status}`
    });
    assert.equal(requests.calls.length, 1);
    assert.deepEqual(requests.delays, []);
    assert.equal(requests.jsonCalls, 0);
  });
}

test("a non-retryable response ends an already-started retry sequence", async () => {
  const requests = mockRequests([{ status: 503 }, { status: 404 }]);
  await assert.rejects(fetchScoreboard(scoreboardUrl, requests), {
    message: "schedule fetch failed: HTTP 404"
  });
  assert.equal(requests.calls.length, 2);
  assert.deepEqual(requests.delays, [250]);
});

for (const failure of ["network", "JSON"]) {
  test(`${failure} errors preserve the original error and are not HTTP retries`, async () => {
    const error = failure === "network" ? new TypeError("fetch failed") : new SyntaxError("invalid JSON");
    const outcome = failure === "network" ? error : { status: 200, jsonError: error };
    const requests = mockRequests([outcome]);
    await assert.rejects(fetchScoreboard(scoreboardUrl, requests), caught => caught === error);
    assert.equal(requests.calls.length, 1);
    assert.deepEqual(requests.delays, []);
    assert.equal(requests.jsonCalls, failure === "network" ? 0 : 1);
  });
}

const sportPaths = {
  nfl: "football/nfl",
  mlb: "baseball/mlb",
  nhl: "hockey/nhl",
  mls: "soccer/usa.1",
  epl: "soccer/eng.1"
};
const dates = ["20261003", "20261004"];
const registry = {
  schemaVersion: 1,
  sources: Object.keys(sportPaths).map(sport => ({
    id: `${sport}-radio`, sport, scope: "national", allGames: true
  }))
};
const schedules = Object.entries(sportPaths).flatMap(([sport, path]) => dates.map(date => ({
  sport,
  date,
  url: `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${date}`,
  body: { events: [{ id: `${sport}-${date}`, date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T20:00:00Z` }] }
})));

test("mapping generation resets the retry budget for each sport/date and retains recovered games", async () => {
  const requests = mockRequests(schedules.flatMap(({ body }) => [
    { status: 503 }, { status: 429 }, { status: 200, body }
  ]));
  const result = await generateMappings({ registry, dates, ...requests });
  assert.equal(result.schemaVersion, 1);
  assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
  assert.deepEqual(Object.keys(result.games), schedules.map(({ sport, date }) => `${sport}-${date}`));
  for (const { sport, date } of schedules) {
    assert.equal(result.games[`${sport}-${date}`].sport, sport);
    assert.deepEqual(result.games[`${sport}-${date}`].sources, [{ id: `${sport}-radio`, scope: "national" }]);
  }
  assert.deepEqual(requests.calls.map(call => call.url), schedules.flatMap(({ url }) => [url, url, url]));
  assert.deepEqual(requests.delays, schedules.flatMap(() => [250, 500]));
  assert.equal(requests.jsonCalls, schedules.length);
});

for (const retries of [0, 1, 2]) {
  test(`mapping generation fails closed with sport/date context after ${retries} retries`, async () => {
    const requests = mockRequests([
      { status: 200, body: schedules[0].body },
      ...Array.from({ length: retries + 1 }, () => ({ status: 503 }))
    ]);
    await assert.rejects(generateMappings({ registry, dates, ...requests, retries }), error => {
      assert.equal(error.message, "schedule fetch failed for nfl 20261004: schedule fetch failed: HTTP 503");
      assert.equal(error.cause?.message, "schedule fetch failed: HTTP 503");
      return true;
    });
    assert.deepEqual(requests.calls.map(call => call.url), [
      schedules[0].url, ...Array(retries + 1).fill(schedules[1].url)
    ]);
    assert.deepEqual(requests.delays, [250, 500].slice(0, retries));
    assert.equal(requests.jsonCalls, 1, "later sports must not be fetched after the failed date");
  });
}

test("mapping generation preserves the provider error as its cause", async () => {
  const cause = new TypeError("provider connection failed");
  const requests = mockRequests([cause]);
  await assert.rejects(generateMappings({ registry, dates, ...requests }), error => {
    assert.equal(error.message, "schedule fetch failed for nfl 20261003: provider connection failed");
    assert.strictEqual(error.cause, cause);
    return true;
  });
  assert.equal(requests.calls.length, 1);
  assert.deepEqual(requests.delays, []);
});
