# Broadcast source verification contract

The public broadcast registry is intentionally maintained as a curated list of sources rather than a directory of arbitrary stream URLs. Every production source must carry evidence that someone recently verified what the source is and how fans are authorized to reach it.

## Required verification fields

Each source entry must include:

- `verifiedAt`: an ISO-8601 timestamp from a verification performed within the last 90 days.
- `verificationUrl`: an HTTPS page used as provenance for the source, such as an official team, league, station, or provider page describing the broadcast option.

CI rejects missing, malformed, future-dated, or stale verification timestamps and rejects missing/non-HTTPS provenance URLs.

## Why freshness is enforced

Broadcast rights, station affiliations, provider URLs, subscription requirements, geographic restrictions, and browser-playback behavior can change during a season. A source that was legitimate six months ago should not remain silently trusted forever.

The 90-day window is a maintenance guardrail rather than a legal determination. It forces periodic human re-verification and creates an obvious review point before old source metadata reaches the deployed product.

## Direct playback remains stricter

A `streamUrl` is only accepted when the source also has a `providerUrl` and `directPlaybackAllowed: true`. Verification metadata does not by itself grant permission to embed or replay audio; it records the evidence used to classify the source.

When direct playback is not clearly authorized and browser-safe, prefer an official provider deep link.

## Source review checklist

Before adding or refreshing an entry:

1. Confirm the provider or station is currently associated with the relevant team, league, or national broadcast.
2. Confirm the link is public-facing and uses HTTPS.
3. Record access requirements (`free`, `subscription`, `geo-restricted`, or `unknown`).
4. Record language and home/away/national/neutral scope accurately.
5. Only add a direct stream when embedding/playback is explicitly permitted and technically browser-safe.
6. Set `verifiedAt` to the actual review time and `verificationUrl` to the page supporting the classification.

This contract is designed to keep the radio-first feature useful without turning the registry into an unverified link scraper.
