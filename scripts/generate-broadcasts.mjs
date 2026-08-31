import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPORTS = {
  nfl: "football/nfl",
  mlb: "baseball/mlb",
  nhl: "hockey/nhl",
  mls: "soccer/usa.1",
  epl: "soccer/eng.1"
};

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function compactDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function defaultDates() {
  const now = new Date();
  return [-1, 0, 1, 2].map(offset => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    return compactDate(date);
  });
}

function teamFromCompetitor(competitor) {
  const team = competitor?.team || {};
  return {
    id: String(team.id || ""),
    abbreviation: upper(team.abbreviation),
    name: team.displayName || team.shortDisplayName || team.name || team.abbreviation || ""
  };
}

export function mapScoreboard(sport, scoreboard, registry) {
  const games = {};
  const sources = Array.isArray(registry?.sources) ? registry.sources.filter(source => source?.sport === sport) : [];

  for (const event of scoreboard?.events || []) {
    const competition = event?.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    const homeComp = competitors.find(c => c.homeAway === "home") || {};
    const awayComp = competitors.find(c => c.homeAway === "away") || {};
    const home = teamFromCompetitor(homeComp);
    const away = teamFromCompetitor(awayComp);
    const mapped = [];

    for (const source of sources) {
      const sourceTeam = upper(source.team);
      let scope = source.scope;
      let applies = false;

      if (sourceTeam) {
        if (sourceTeam === home.abbreviation) {
          scope = "home";
          applies = true;
        } else if (sourceTeam === away.abbreviation) {
          scope = "away";
          applies = true;
        }
      } else if (source.allGames === true && (source.scope === "national" || source.scope === "neutral")) {
        applies = true;
      }

      if (applies) mapped.push({ id: source.id, scope });
    }

    if (mapped.length) {
      mapped.sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id));
      games[String(event.id)] = {
        sport,
        start: event.date || null,
        homeTeam: home.abbreviation || home.name,
        awayTeam: away.abbreviation || away.name,
        sources: mapped
      };
    }
  }
  return games;
}

export async function generateMappings({ registry, dates = defaultDates(), fetchImpl = fetch }) {
  const games = {};
  for (const [sport, pathPart] of Object.entries(SPORTS)) {
    for (const date of dates) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${pathPart}/scoreboard?dates=${date}`;
      const response = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`schedule fetch failed for ${sport} ${date}: HTTP ${response.status}`);
      Object.assign(games, mapScoreboard(sport, await response.json(), registry));
    }
  }
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), games };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const registry = JSON.parse(fs.readFileSync(path.join(root, "data", "broadcast-registry.json"), "utf8"));
  const arg = process.argv.find(value => value.startsWith("--dates="));
  const dates = arg ? arg.slice(8).split(",").map(value => value.trim()).filter(Boolean) : defaultDates();
  const output = await generateMappings({ registry, dates });
  fs.writeFileSync(path.join(root, "data", "broadcasts.json"), JSON.stringify(output, null, 2) + "\n");
  console.log(`Generated ${Object.keys(output.games).length} broadcast mappings across ${dates.length} schedule dates.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
