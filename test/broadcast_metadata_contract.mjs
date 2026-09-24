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

console.log("Broadcast metadata contract checks passed.");
