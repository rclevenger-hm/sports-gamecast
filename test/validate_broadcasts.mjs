import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const registryPath = path.join(root, "data", "broadcast-registry.json");
const mappingsPath = path.join(root, "data", "broadcasts.json");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function isHttps(value) {
  if (value == null) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

const registry = readJson(registryPath);
const mappings = readJson(mappingsPath);
assert(registry.schemaVersion === 1, "broadcast registry schemaVersion must be 1");
assert(Array.isArray(registry.sources), "broadcast registry sources must be an array");
assert(mappings.schemaVersion === 1, "broadcast mappings schemaVersion must be 1");
assert(mappings.games && typeof mappings.games === "object" && !Array.isArray(mappings.games), "broadcast mappings games must be an object");

const allowedSports = new Set(["nfl", "mlb", "nhl", "mls", "epl"]);
const allowedScopes = new Set(["home", "away", "national", "neutral"]);
const allowedAccess = new Set(["free", "subscription", "geo-restricted", "unknown"]);
const sourceIds = new Set();

for (const source of registry.sources) {
  assert(source && typeof source === "object" && !Array.isArray(source), "each broadcast source must be an object");
  assert(typeof source.id === "string" && source.id.trim(), "each broadcast source requires a non-empty id");
  assert(!sourceIds.has(source.id), `duplicate broadcast source id: ${source.id}`);
  sourceIds.add(source.id);
  assert(allowedSports.has(source.sport), `unsupported sport for ${source.id}`);
  assert(allowedScopes.has(source.scope), `unsupported scope for ${source.id}`);
  assert(allowedAccess.has(source.access), `unsupported access type for ${source.id}`);
  assert(typeof source.name === "string" && source.name.trim(), `source ${source.id} requires a name`);
  assert(isHttps(source.providerUrl), `source ${source.id} providerUrl must use https`);
  assert(isHttps(source.streamUrl), `source ${source.id} streamUrl must use https`);
  if (source.allGames != null) assert(typeof source.allGames === "boolean", `source ${source.id} allGames must be boolean`);
  if (source.allGames === true) assert(!source.team && (source.scope === "national" || source.scope === "neutral"), `source ${source.id} allGames is only valid for non-team national/neutral sources`);
  if (source.streamUrl) {
    assert(source.providerUrl, `source ${source.id} with a direct stream requires providerUrl`);
    assert(source.directPlaybackAllowed === true, `source ${source.id} direct stream requires directPlaybackAllowed=true`);
  }
}

for (const [gameId, game] of Object.entries(mappings.games)) {
  assert(game && typeof game === "object" && !Array.isArray(game), `game mapping ${gameId} must be an object`);
  const refs = Array.isArray(game.sources) ? game.sources : [];
  for (const ref of refs) {
    const sourceId = typeof ref === "string" ? ref : ref?.id;
    assert(typeof sourceId === "string" && sourceIds.has(sourceId), `game ${gameId} references unknown source id: ${sourceId}`);
    if (typeof ref === "object") assert(allowedScopes.has(ref.scope), `game ${gameId} source ${sourceId} has unsupported effective scope`);
  }
}

console.log(`Broadcast data valid: ${registry.sources.length} sources, ${Object.keys(mappings.games).length} mapped games.`);
