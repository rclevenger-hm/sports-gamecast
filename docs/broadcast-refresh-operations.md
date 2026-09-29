# Broadcast refresh operations

The broadcast mapping job runs on the Pages workflow schedule and before each non-pull-request deployment. It is responsible only for turning reviewed registry entries into game-to-source mappings; it must not discover or invent broadcast sources.

## Failure modes

| Failure | Expected signal | Safe response |
| --- | --- | --- |
| Scoreboard provider unavailable | Mapping generation step fails and the deployment does not continue | Confirm the provider outage, avoid editing the registry to work around it, and rerun after recovery |
| Provider schema changes | Mapping tests or generated-data validation fail | Inspect the provider response against the mapping contract before changing parser assumptions |
| Registry validation fails | Generated-data validation stops the deployment | Correct the reviewed source metadata; do not weaken provenance or playback authorization checks |
| No mapped sources | Deployment succeeds with an empty or partial mapping set | Confirm whether the reviewed registry actually covers the current slate; an empty result is preferable to guessed sources |
| Stale or unauthorized source | Registry validation or source review blocks release | Re-verify the source from an authoritative page or remove it until verification is possible |

## Triage sequence

1. Open the failed Actions run and identify whether the failure occurred during tests, mapping generation, or generated-data validation.
2. Check whether multiple sports/dates failed together; broad failure usually indicates an upstream availability or schema problem rather than a single registry entry.
3. Reproduce mapping generation against a deliberately narrow date before changing code or source metadata.
4. Preserve the reviewed registry as the source of truth. Do not add scraped streams or guessed station mappings to make a deployment green.
5. After a fix, rerun the full repository test suite before allowing Pages deployment to continue.

## Recovery and rollback

A failed refresh should fail closed: do not publish newly generated mapping data unless validation completes successfully. The previous deployed Pages artifact remains the recovery point while the workflow is red.

If a bad mapping reaches production despite validation:

1. identify the last known-good commit and Actions deployment;
2. revert the mapping or source-registry change through a reviewed pull request;
3. confirm generated data validates against the restored registry;
4. deploy and verify the affected game manually;
5. add regression coverage for the failure mode before reintroducing the change.

## Operational evidence to retain

For a release candidate, retain the commit SHA, Actions run, source-verification date, generated mapping timestamp, and any upstream incident notes needed to explain missing audio coverage.

The desired failure mode is visible incompleteness, not fabricated coverage. A missing authorized source should render as unavailable while the scoreboard and Gamecast continue to function normally.
