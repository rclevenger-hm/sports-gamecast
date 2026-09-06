# Push notification architecture

Sports Gamecast already supports in-browser favorite-team alerts while the page is active. True background push is a different reliability and security boundary: it requires a server-side component that can observe game state when the browser is closed, maintain subscriptions, and send authenticated Web Push messages.

This document defines that boundary before implementation.

## Goals

- Notify only for teams/events the user explicitly follows.
- Support game start, broadcast availability, score/lead change, late-game state, and final events.
- Avoid duplicate notifications across polling cycles.
- Keep browser subscriptions revocable and scoped to the minimum data needed.
- Preserve the static Pages app as a read-only client; no private push credentials belong in browser code.

## Proposed flow

```text
scheduled collector
  -> normalized scoreboard state
  -> transition detector
  -> notification policy
  -> subscription store
  -> Web Push provider
  -> service worker
  -> user notification
```

The collector may reuse the same upstream game sources as the browser, but it must run independently of an open tab.

## State and idempotency

Each candidate notification should have a deterministic event key, for example:

```text
<sport>:<event-id>:<event-type>:<transition-version>
```

The sender records that key before or atomically with delivery so a retry cannot fan out the same score change repeatedly. A polling failure must not be interpreted as a game transition.

## Subscription record

Store only what is necessary:

- Web Push endpoint and cryptographic subscription material;
- selected team identifiers;
- enabled notification categories;
- created/updated timestamps;
- optional expiration/last-success metadata.

Do not store GitHub credentials, browser history, unrelated profile data, or raw upstream responses as part of the subscription record.

## Notification policy

| Event | Default | Dedupe rule |
| --- | --- | --- |
| Game start | opt-in | once per event |
| Broadcast available | opt-in | once per verified source/version |
| Score change | opt-in | once per observed score tuple |
| Lead change | opt-in | once per leading-team transition |
| Late-game state | opt-in | once per configured threshold |
| Final | opt-in | once per event |

A correction from the upstream provider should create a new transition only when the normalized game state actually changes.

## Failure handling

- **Upstream unavailable:** send nothing; retry collection later.
- **Malformed upstream payload:** reject that event and record an observable parse failure.
- **Expired push subscription:** remove or quarantine it after the provider returns the terminal status defined by Web Push semantics.
- **Partial fan-out failure:** retry only failed subscriptions using the same event key.
- **Scheduler overlap:** use a lease/lock or idempotent transition writes so concurrent collectors do not double-send.

## Security boundary

VAPID/private push credentials stay server-side. The Pages bundle receives only the public VAPID key needed to create a browser subscription. Administrative endpoints require authentication; subscription endpoints validate origin, payload size, allowed team/event identifiers, and rate limits.

## Release sequence

1. Merge/install the PWA shell and service worker.
2. Add subscription creation/removal in the browser behind an explicit user action.
3. Build the server-side subscription store and authenticated push sender.
4. Add a scheduled game-state collector and deterministic transition detector.
5. Add end-to-end tests with a fake push provider before enabling production delivery.
6. Add operational metrics: collection success, transitions produced, sends attempted/succeeded/failed, expired subscriptions, and duplicate-suppression count.

## Non-goals for the current static client

The browser should not pretend it can provide reliable closed-tab background alerts without a push backend. Local polling and the Notification API remain useful while the app is open, but they are not a substitute for server-driven Web Push.
