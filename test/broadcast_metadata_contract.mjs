import assert from "node:assert/strict";
import { validateBroadcastData } from "./validate_broadcasts.mjs";

const now = Date.parse("2026-09-24T12:00:00Z");
const mappings = { schemaVersion: 1, generatedAt: null, games: {} };

function validSource(overrides = {}) {
  return {
    id: "example-home-radio",
    sport: "nfl",
    team: "LAC",
    scope: "home",
    name: "Example Radio Network",
    provider: "Example Provider",
    language: "en-US",
    access: "geo-restricted",
    regions: ["US"],
    providerUrl: "https://example.com/listen",
    directPlaybackAllowed: false,
    verifiedAt: "2026-09-20T12:00:00Z",
    verificationUrl: "https://example.com/broadcast-rights",
    ...overrides,
  };
}

function registryWith(source) {
  return { schemaVersion: 1, updatedAt: "2026-09-20T12:00:00Z", sources: [source] };
}

assert.deepEqual(
  validateBroadcastData(registryWith(validSource()), mappings, { now }),
  { sources: 1, games: 0 },
  "normalized source metadata should validate",
);

assert.throws(
  () => validateBroadcastData(registryWith(validSource({ provider: "" })), mappings, { now }),
  /requires provider metadata/,
);
assert.throws(
  () => validateBroadcastData(registryWith(validSource({ language: "english" })), mappings, { now }),
  /valid language tag/,
);
assert.throws(
  () => validateBroadcastData(registryWith(validSource({ regions: "US" })), mappings, { now }),
  /regions must be an array/,
);
assert.throws(
  () => validateBroadcastData(registryWith(validSource({ streamUrl: "https://stream.example.com/live", directPlaybackAllowed: false })), mappings, { now }),
  /direct stream requires directPlaybackAllowed=true/,
);

const eventSource = validSource({ team: undefined, scope: "national", eventId: "401000001" });
const eventMapping = (gameId, sport = "nfl", scope = "national") => ({
  schemaVersion: 1,
  games: { [gameId]: { sport, sources: [{ id: eventSource.id, scope }] } },
});

assert.deepEqual(
  validateBroadcastData(registryWith(eventSource), eventMapping(eventSource.eventId), { now }),
  { sources: 1, games: 1 },
);
for (const eventId of ["", " 401000001 ", "other-game", 401000001]) {
  assert.throws(
    () => validateBroadcastData(registryWith({ ...eventSource, eventId }), mappings, { now }),
    /eventId must be a numeric string/,
  );
}
for (const selector of [{ team: "LAC" }, { allGames: true }, { scope: "home" }]) {
  assert.throws(
    () => validateBroadcastData(registryWith({ ...eventSource, ...selector }), mappings, { now }),
    /eventId is only valid for non-team national\/neutral sources without allGames/,
  );
}
assert.throws(
  () => validateBroadcastData(registryWith({ ...eventSource, providerUrl: null }), mappings, { now }),
  /with an eventId requires providerUrl/,
);
for (const badMapping of [
  eventMapping("401000002"),
  eventMapping(eventSource.eventId, "mlb"),
  eventMapping(eventSource.eventId, "nfl", "home"),
]) {
  assert.throws(
    () => validateBroadcastData(registryWith(eventSource), badMapping, { now }),
    /must match the event source sport, eventId and scope/,
  );
}

console.log("Broadcast metadata contract checks passed.");
