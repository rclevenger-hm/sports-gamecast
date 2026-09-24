# Broadcast data contract

The Listen Live experience intentionally separates **source discovery** from **game mapping** so broadcast metadata can be reviewed, verified, and refreshed without changing the UI runtime.

## `broadcast-registry.json`

`broadcast-registry.json` is the reviewed source-of-truth for legitimate audio providers. Each source must include:

- `id`: stable repository-local identifier.
- `sport`: one of the supported sport keys (`nfl`, `mlb`, `nhl`, `mls`, `epl`).
- `name`: listener-facing source/network name.
- `provider`: provider or rights-holder name used for provenance and operations.
- `scope`: `home`, `away`, `national`, or `neutral`.
- `language`: a BCP-47-style language tag such as `en`, `en-US`, or `es`.
- `access`: `free`, `subscription`, `geo-restricted`, or `unknown`.
- `verifiedAt`: timestamp for the most recent rights/link verification. Production data is rejected after the repository's verification-age limit.
- `verificationUrl`: HTTPS provenance used to verify that the provider/link is legitimate.

Optional fields include `team`, `regions`, `providerUrl`, `streamUrl`, `directPlaybackAllowed`, `allGames`, and `notes`.

A `streamUrl` is only allowed when `providerUrl` is also present and `directPlaybackAllowed` is explicitly `true`. Otherwise Listen Live uses the provider/deep link rather than embedding an unverified stream. `regions` records known geographic availability; `access` records the broader restriction model.

Do not add guessed stations, scraped rebroadcasts, or undocumented stream URLs. A source belongs in the registry only after its provider and listening path can be verified from an authoritative HTTPS source.

## `broadcasts.json`

`broadcasts.json` maps provider event IDs to reviewed source IDs. Mapping references may override `scope` for a specific matchup so a team network declared as a team source can render as the effective home or away feed for that event.

The scheduled mapping generator may derive mappings only from registry entries that explicitly opt into automatic mapping (`team` or permitted `allGames` behavior). It must not invent sources.

## Validation

The test suite validates the registry and generated mappings before deployment. In addition to referential integrity, it enforces normalized provider/language/access/restriction metadata, HTTPS links, verification provenance, and the direct-playback authorization boundary.
