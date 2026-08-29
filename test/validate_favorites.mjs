import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const favorites = fs.readFileSync(path.join(root, "favorites.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(index.includes('<script src="favorites.js"></script>'), "index.html must load favorites.js");
assert(favorites.includes('sports-gamecast-favorites-v1'), "favorites storage key missing");
assert(favorites.includes('sports-gamecast-my-teams-filter'), "My Teams filter storage key missing");
assert(favorites.includes('MutationObserver'), "favorites module must react to scoreboard refreshes");
assert(favorites.includes('aria-pressed'), "favorites controls must expose pressed state");
assert(favorites.includes('favorite-hidden'), "favorites module must support filtering non-favorite games");

console.log("Favorites integration contract valid.");
