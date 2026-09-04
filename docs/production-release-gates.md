# Production release gates

Sports Gamecast is currently a portfolio-grade radio-first sports companion. A public release should not be described as production-ready until the gates below are satisfied and evidenced.

## 1. Sports data contract

**Gate:** Scoreboard, schedule, and Gamecast data come from a provider whose terms support the intended public use.

Evidence to retain:
- provider and product name
- contractual/API terms reviewed
- authentication/rate-limit model
- documented availability expectations
- supported sports/leagues and fields relied on by the UI
- fallback behavior for provider outage or schema change

The current undocumented public score endpoints do not satisfy this gate.

## 2. Broadcast-source authorization

**Gate:** Every production broadcast registry entry has verifiable provenance and a documented playback mode that matches the provider's terms.

For each source record, retain:
- station/provider identity
- official verification URL
- date last verified
- league/team affiliation where applicable
- home/away/national scope
- language
- geographic, subscription, or account restrictions
- whether direct browser playback is explicitly permitted
- otherwise, the authorized deep-link destination

A source being publicly reachable is not by itself authorization to restream, proxy, or embed it.

## 3. Mapping correctness

**Gate:** A generated game-to-broadcast mapping cannot attach a team-affiliated feed to a game in which that team is not participating, and national/neutral feeds require explicit opt-in rules.

Required validation:
- sport isolation
- team participation matching
- home/away scope derivation
- no dangling source ids
- restricted sources preserve restriction metadata
- scheduled refresh failure leaves the last known valid artifact available rather than publishing malformed output

## 4. Notification behavior

**Gate:** User-facing alerts are opt-in, configurable, deduplicated, and scoped to explicitly selected teams.

Before release, verify:
- permission is requested only from a user action
- game-start, score, lead-change, late-game, final, and broadcast-available preferences can be independently controlled
- duplicate refreshes do not repeat the same state transition
- notification links resolve to the correct Gamecast
- background push has documented retention, privacy, and unsubscribe behavior if a push backend is introduced

## 5. PWA / mobile readiness

**Gate:** The application is installable and its offline behavior is honest about live-data limitations.

Required evidence:
- valid web app manifest
- service worker registration and update behavior
- tested install flow on current Chrome/Edge and at least one mobile platform
- application shell can load offline without displaying stale scores as current
- network-required states are clearly labeled
- cache policy does not persist sensitive or provider-restricted data beyond intended lifetime

## 6. Operational readiness

**Gate:** A maintainer can distinguish application defects from upstream data/broadcast failures and can recover the deployment safely.

Minimum operating evidence:
- Pages deployment remains gated by automated tests
- external-source failures degrade visibly rather than silently
- source-registry validation runs before deployment
- scheduled mapping jobs expose failures in Actions history
- rollback procedure is documented and tested
- release checklist records the commit/tag and validation run used for a release

## 7. Privacy, legal, and store review

**Gate:** Public-facing terms match actual application behavior.

Before a broader release:
- publish a concise privacy notice
- document local-storage and notification usage
- inventory third-party network requests
- review league/team trademark usage in store assets
- review sports-data and radio-provider terms for the planned distribution channel
- avoid claims implying league, team, station, or broadcaster endorsement

## Release decision record

For each release candidate, record:

```text
Release/tag:
Date:
Sports data gate: PASS / HOLD
Broadcast authorization gate: PASS / HOLD
Mapping gate: PASS / HOLD
Notifications gate: PASS / HOLD
PWA/mobile gate: PASS / HOLD
Operational gate: PASS / HOLD
Privacy/legal gate: PASS / HOLD
Known exceptions:
Validation run:
Decision: RELEASE / HOLD
Reviewer:
```

A `HOLD` is an acceptable result. The purpose of these gates is to make readiness explicit rather than allowing incomplete external-data or licensing assumptions to become production behavior by accident.
