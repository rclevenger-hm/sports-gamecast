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

`data/broadcast-registry.json` is the maintained source catalog. Each future source entry should use a stable id and may include:

- `id` — stable internal identifier;
- `sport` — `nfl`, `mlb`, `nhl`, `mls`, or `epl`;
- `team` — team abbreviation when the source is team-specific;
- `scope` — `home`, `away`, `national`, or `neutral`;
- `language` — BCP 47 language code such as `en` or `es`;
- `name` — user-facing station/network/provider name;
- `provider` — provider or station organization;
- `providerUrl` — canonical HTTPS page for authorized listening;
- `streamUrl` — direct HTTPS audio URL only when permitted;
- `access` — `free`, `subscription`, `geo-restricted`, or `unknown`;
- `regions` — optional region codes for known restrictions;
- `verifiedAt` — ISO-8601 timestamp of the last source validation;
- `notes` — short operational notes that do not expose credentials or tokens.

## Generated game mapping

`data/broadcasts.json` is reserved for generated game-to-source mappings. A later scheduled job will combine the daily schedule with the maintained registry and produce entries keyed by game/event id.

The UI should fail gracefully when no authorized audio source is known. It should never invent a stream or silently substitute an unrelated station.

## Validation rules

CI validates the registry and generated mapping before deployment. At minimum:

- schema version must be supported;
- source ids must be unique;
- URLs must be HTTPS;
- direct streams must have an explicit source record;
- access and scope values must use the supported enum values;
- generated game mappings may only reference source ids present in the registry.

## Review checklist for new sources

Before adding a source:

1. Confirm it is an official or authorized listening destination.
2. Record known subscription or geographic restrictions.
3. Prefer a stable provider page over a transient media URL.
4. If using a direct stream, confirm browser playback is permitted and the URL is not short-lived or credentialized.
5. Revalidate the source periodically and remove stale entries promptly.
