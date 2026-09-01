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
assert(favorites.includes('favorite-row-button'), "scoreboard rows must expose inline favorite controls");
assert(favorites.includes('favorites-filter-empty'), "filtered My Teams view must expose an empty state");
assert(favorites.includes('stopPropagation'), "inline favorite controls must not navigate into Gamecast");
assert(favorites.includes('aria-live'), "filtered empty state should be announced accessibly");

console.log("Favorites integration contract valid.");
