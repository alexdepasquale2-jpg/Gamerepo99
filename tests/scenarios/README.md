# Seeded scenario suite (Loom → Forge / Probe)

**Data:** `src/data/scenarios.json`  
**API:** Forge `createPlaySession` (M2 plan / Probe `BotSession` + scenario extensions)  
**Gate:** M2 “What makes this special” — ≥3 of 5 memorable moments + first-10-min timing checks.

## Purpose

Scenarios are **authored data**, not cutscenes. Each entry is a seed + setup + scripted player ops + expected assertions. Forge implements a runner; Probe verifies once `createPlaySession` is exported.

## Session contract

Minimum (already in Probe `BotSession`):

```ts
start({ seed, archetypeId })
listActions()
act(actionId)
tick()
snapshot()
events()
```

**Scenario runner extensions** (Forge may expose on the same session object or via `createPlaySession().runScenario(id)`):

| Op | Meaning |
|----|---------|
| `approach` | Select target; open method menu (records `firstChoice` metrics when first time) |
| `method` | Commit `methodId` on `targetPersonId` (action id form `methodId@personId`) |
| `advance` | `to: dusk\|dawn\|day` or `ticks: N` — world clocks forward |
| `record` | Stash a snapshot path for later compare |
| `recordMetrics` | Set `firstChoice` / `firstConsequence` tick (+ optional wall clock if harness provides) |
| `boot` | Explicit start (default on `start`) |

Richer `snapshot()` fields used by `expect` (names in `scenarios.json` → `snapshotExtensions`):

- `people.<id>.{flame,marks,siteKindled}`
- `player.spark`
- `bus.ids` (juice / sim event ids)
- `lines.lastReactionId` / `lastRefusalId`
- `packets.inbox`
- `metrics.firstChoiceAtTick` / `firstConsequenceAtTick`
- `menu.methodIds`
- `lastResolve.{flameDelta,sparkCost}`

## How to run (once API lands)

```bash
# Preferred: data-driven runner
npx vitest run tests/scenarios/scenarios.test.ts

# Or Probe matrix still separate
npm run test:bots
```

Suggested Forge test (TDD):

```ts
import scenarios from '../../src/data/scenarios.json';
import { createPlaySession } from '../../src/sim';

for (const sc of scenarios.scenarios) {
  it(sc.id, () => {
    const session = createPlaySession();
    const result = session.runScenario(sc); // or interpret steps via act/tick
    expect(result.passed).toBe(true);
  });
}
```

Until `createPlaySession` exists, scenario unit tests may `describe.skip` / mark `API_PENDING` the same way as bots — **do not** fake green on memorable moments without the real sim.

## M2 acceptance mapping

| Scenario id | Special-bar item |
|-------------|------------------|
| `moment_warm_loaf_cold_hill` | Memorable #1 |
| `moment_chalk_after_the_cut` | Memorable #2 |
| `moment_nail_across_the_water` | Memorable #3 |
| `moment_refusal_coal` | Memorable #4 |
| `moment_mark_comes_back` | Memorable #5 |
| `first_10_minutes_ashford_hook` | First 10 minutes (C) |

Ship bar: **≥3 memorable** scenarios pass + first-10-min metrics within caps (or Probe wall-clock checklist filed if wall clock not instrumented yet).

## Validator

`scripts/validate` requires `scenarios.json` and checks:

- archetypeId ∈ m2 playable
- personIds / methodIds / markIds / hook ids referenced exist
- every `kind: memorable_moment` and `first_10_minutes` present (≥5 + 1)

## Non-goals

- No Phaser in scenario runner
- No archetypeId branches in runner code
- No commits from Loom — Forge batches land the runner + any `tests/scenarios/*.test.ts`


## M2 locks (do not violate in scenarios)

- `player.features.bakedDynamismLines` **false** for all ship scenarios (fixed lines fallback path).
- Basilisk Brood: `bodySlots: 3`, **`activeBodiesMax: 1`** (Forge commit 595d722). No scenario may require two simultaneous active bodies in M2.
- Line picker is pluggable via methods/hooks; scenarios assert state/bus first, not a single hardcoded string when flag may later turn on in optional tests.


## M3 generated-world special bar

Memorable moments retarget via `worldSeed` + `resolvePerson` on each scenario JSON under `src/data/systems/scenarios/`.

- Resolver: `resolveScenarioPerson(session, { preferAnchorId?, woundId?, tagsAny?, siteKind? })` (anchors preferred when present).
- Advance: `act('advance:dusk'|'advance:dawn'|…)` fires dusk personal-cost hooks.
- Metrics: `session.metrics()` records `firstChoiceAtTick` / `firstConsequenceAtTick` on `approach@` / method commit.
- Gate test: `npx vitest run tests/scenarios/special-bar-gen.test.ts` — BAR ≥3 of 5 memorable moments on gen seeds.
