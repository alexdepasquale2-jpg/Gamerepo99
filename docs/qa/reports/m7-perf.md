# M7 dawn-tick performance profile

Script: `npm run perf:dawn` (scripts/perf-dawn.mts; timing wraps each call in the script, nothing added to src/sim).
Setup: seed 7, `generateWorld({ peopleCount: 1500, includeAnchors: true })` (1506 people), 200 dawns, with an unspoken encode every 3rd dawn and a doctrine act every 10th. Raw numbers: `_m7-perf.json` (after-fix run). Times in ms.

## Before fix (per dawn)

| subsystem | p50 | p95 | max | sum/200 |
|---|---|---|---|---|
| runHooks | 0.016 | 0.045 | 0.748 | 4.8 |
| tickEconomyLod | 0.025 | 0.059 | 1.005 | 7.7 |
| tickDoctrines | 0.030 | 0.083 | 0.722 | 8.0 |
| tickLetters | 2.006 | 3.819 | 6.261 | 459.3 |
| tickUnspokenDawn | 0.367 | 1.035 | 1.989 | 96.9 |
| tickHoardDawn | 0.018 | 0.055 | 0.367 | 5.2 |
| total | 2.586 | 4.398 | 8.893 | 583.4 |

## After fix

Two runs: total p50 1.78 / 1.94, p95 5.99 / 8.74, max 11.4 / 45.6 ms (sum 464 / 611). tickLetters p50 1.21 / 1.27 (was 2.01). The p95/max are dominated by shared-machine GC/scheduling noise (the same subsystems, untouched, show the same spikes); the p50 improvement is the stable signal.

## Memory and state growth

- heapUsed: ~39 MB to ~47-55 MB over 200 dawns (includes uncollected garbage; no leak signature).
- SimState JSON (minus data/rng): 324,734 to 353,055 bytes (+8.7%, about 140 bytes/dawn), driven by letters/unspoken/bus logs.

## Findings

Whole dawn is ~2 ms at 1500 people: nowhere near a frame-budget problem. tickLetters is ~75-80% of it.

Fixed (clear win): `rollCrossTownLetters` built the social graph (`createSocialGraph(edges)`) every dawn even when the pending backlog was empty (the common case). It is now built only when there is backlog to cascade. Outputs are unchanged: tests/sim/letters-scale.test.ts has golden fingerprints (empty and queued backlog, 25 dawns) captured on the pre-fix code and passing on both versions.

## Other ideas (not done)

- `edgesOf` re-maps all kinEdges to SocialEdge objects, then filters and sorts the cross-town set every dawn: cache keyed on kinEdges identity plus a town-assignment version (townIds change on travel/relocation, so needs an invalidation hook).
- `routeDays` linearly scans economyRoutes per flight; a Map keyed by sorted town pair would help at many routes.
- `pickTemplate` filters the template list per call; precompute by packetType.
- `markStacks` scans all people x marks twice per dawn; maintain counters on mark add/remove.
- `anyBurningAdjacent` (dusk) is O(burning^2); spatial hash if burning counts get large.
- state log growth (letters/bus) is slow but unbounded; consider capping history.
