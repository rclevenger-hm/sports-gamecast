import { mapScoreboard, generateMappings } from "../scripts/generate-broadcasts.mjs";

const registry = {
  schemaVersion: 1,
  sources: [
    { id: "lac-radio", sport: "nfl", team: "LAC", scope: "home", name: "Chargers Radio", access: "free" },
    { id: "den-radio", sport: "nfl", team: "DEN", scope: "home", name: "Broncos Radio", access: "free" },
    { id: "league-audio", sport: "nfl", scope: "national", allGames: true, name: "League Audio", access: "subscription" },
    { id: "national-one-game", sport: "nfl", scope: "national", eventId: "401000001", name: "Specific Game Radio", access: "geo-restricted", providerUrl: "https://example.com/listen", directPlaybackAllowed: false },
    { id: "other-game-radio", sport: "nfl", scope: "national", eventId: "401000002", name: "Other Game Radio", access: "free" },
    { id: "wrong-sport", sport: "mlb", scope: "national", eventId: "401000001", name: "Baseball Radio", access: "free" },
    { id: "not-global", sport: "nfl", scope: "national", name: "Specific National Feed", access: "free" },
    { id: "mlb-source", sport: "mlb", team: "LAD", scope: "home", name: "Dodgers Radio", access: "free" }
  ]
};

const scoreboard = {
  events: [{
    id: "401000001",
    date: "2026-08-31T20:25:00Z",
    competitions: [{ competitors: [
      { homeAway: "away", team: { id: "24", abbreviation: "LAC", displayName: "Los Angeles Chargers" } },
      { homeAway: "home", team: { id: "7", abbreviation: "DEN", displayName: "Denver Broncos" } }
    ] }]
  }, {
    id: 401000002,
    date: "2026-08-31T20:25:00Z",
    competitions: [{ competitors: [
      { homeAway: "away", team: { abbreviation: "NE" } },
      { homeAway: "home", team: { abbreviation: "BUF" } }
    ] }]
  }]
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const mapped = mapScoreboard("nfl", scoreboard, registry);
const game = mapped["401000001"];
assert(game, "expected game mapping");
assert(game.awayTeam === "LAC" && game.homeTeam === "DEN", "expected normalized teams");
assert(game.sources.some(ref => ref.id === "lac-radio" && ref.scope === "away"), "team source must derive away scope from matchup");
assert(game.sources.some(ref => ref.id === "den-radio" && ref.scope === "home"), "team source must derive home scope from matchup");
assert(game.sources.some(ref => ref.id === "league-audio" && ref.scope === "national"), "allGames national source must map");
assert(game.sources.some(ref => ref.id === "national-one-game" && ref.scope === "national"), "event source must map to its selected matchup");
assert(!game.sources.some(ref => ref.id === "other-game-radio"), "unrelated event source must not map");
assert(!game.sources.some(ref => ref.id === "wrong-sport"), "an event source must match the sport even if the event id matches");
assert(!game.sources.some(ref => ref.id === "not-global"), "national source without allGames must not map automatically");
assert(!game.sources.some(ref => ref.id === "mlb-source"), "other sports must not map");

const fakeFetch = async url => ({
  ok: true,
  async json() { return url.includes("football/nfl") ? scoreboard : { events: [] }; }
});
const generated = await generateMappings({ registry, dates: ["20260831"], fetchImpl: fakeFetch });
assert(generated.schemaVersion === 1, "generated schemaVersion");
assert(generated.games["401000001"], "generator should aggregate mapped games");
assert(generated.games["401000002"].sources.some(ref => ref.id === "other-game-radio"), "numeric schedule ids must match the registry string");
assert(!generated.games["401000002"].sources.some(ref => ref.id === "national-one-game"), "one-off national source must not follow a different game on the same date");
assert(Object.keys(generated.games).length === 2, "generator should not invent unmapped games");

console.log("Broadcast mapping generator valid.");
