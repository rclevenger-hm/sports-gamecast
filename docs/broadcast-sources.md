# Broadcast Source Policy

Sports Gamecast treats audio as a discovery and playback-assistance feature, not as a rebroadcast service.

## Allowed source types

A registry entry may point to:

- an official team or league audio page;
- an authorized radio affiliate or station page;
- an authorized third-party provider page;
- a direct browser-safe stream only when the source explicitly permits that use.

Do not add scraped, tokenized, paywall-bypassing, or otherwise unauthorized stream URLs.

## Registry contract

`data/broadcast-registry.json` is the maintained source catalog. Each source entry uses a stable id and may include:

- `id` — stable internal identifier;
- `sport` — `nfl`, `mlb`, `nhl`, `mls`, or `epl`;
- `team` — team abbreviation for a team-affiliated source; the daily mapper derives whether that team is home or away for each game;
- `scope` — default/manual scope: `home`, `away`, `national`, or `neutral`;
- `allGames` — optional boolean for a non-team `national`/`neutral` provider that is authorized and available for every game in that sport;
- `language` — BCP 47 language code such as `en` or `es`;
- `name` — user-facing station/network/provider name;
- `provider` — provider or station organization;
- `providerUrl` — canonical HTTPS page for authorized listening;
- `streamUrl` — direct HTTPS audio URL only when permitted;
- `directPlaybackAllowed` — must be `true` before a direct stream is rendered in the browser;
- `access` — `free`, `subscription`, `geo-restricted`, or `unknown`;
- `regions` — optional region codes for known restrictions;
- `verifiedAt` — ISO-8601 timestamp of the last source validation;
- `notes` — short operational notes that do not expose credentials or tokens.

`allGames` is deliberately opt-in. A national source without it is never automatically attached to every game merely because it is national.

## Generated game mapping

`scripts/generate-broadcasts.mjs` combines the maintained registry with current schedules and writes `data/broadcasts.json`.

For team-affiliated sources the mapper calculates the effective `home` or `away` role from that specific matchup. Generated source references therefore use objects such as:

```json
{ "id": "team-radio", "scope": "away" }
```

The Listen Live UI accepts both this generated form and the original string id form for backward compatibility.

The default generator window covers yesterday through two days ahead in UTC to avoid dropping late-night games at date boundaries. A custom date list can be supplied with `--dates=YYYYMMDD,YYYYMMDD`.

The Pages workflow refreshes mappings on a schedule and before deployment. The generated file is placed into the deployed Pages artifact; the refresh job does not create automated commits on the default branch.

The UI must fail gracefully when no authorized audio source is known. It must never invent a stream or silently substitute an unrelated station.

## Validation rules

CI validates the registry, generator behavior, and generated mapping before deployment. At minimum:

- schema version must be supported;
- source ids must be unique;
- URLs must be HTTPS;
- direct streams must have an explicit source record and playback permission;
- access and scope values must use supported enums;
- `allGames` is only valid for non-team national/neutral sources;
- generated game mappings may only reference source ids present in the registry;
- generated effective scopes must be valid;
- team sources must be labeled home/away from the actual matchup.

## Review checklist for new sources

Before adding a source:

1. Confirm it is an official or authorized listening destination.
2. Record the team affiliation when applicable.
3. Record known subscription or geographic restrictions.
4. Prefer a stable provider page over a transient media URL.
5. If using a direct stream, confirm browser playback is permitted and the URL is not short-lived or credentialized.
6. Only set `allGames: true` when the provider genuinely covers every game in the sport under the recorded access terms.
7. Revalidate the source periodically and remove stale entries promptly.
