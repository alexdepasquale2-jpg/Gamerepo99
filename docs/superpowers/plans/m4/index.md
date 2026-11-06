# M4 Living World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M3 playable walk + spark pacing, ship an **off-screen living layer**: LOD stock/despair, scheduled caravans, doctrine competition/collapse, and letters/rumors at scale — headless-first, Probe-visible.

**Architecture:** Pure `src/sim/` modules tick from existing `createPlaySession({ mode:'play' })` `tick()` / `travel()` / `advance:dawn`. Reuse `startTravel`, effects targets (`town.despair`, stock), `doctrines.json` formulas, `caravan-schedules.json`, `letters.json`, `ripples.crossTown`. No Phaser required for acceptance.

**Tech Stack:** TypeScript, Vitest, existing validate-data. Data under `src/data/{world,economy,systems,dialogue}/`.

## Global Constraints

- HEAD ≥ `c7c36ed` (road-content spec landed; spark-pacing data may be in flight).
- No `archetypeId ===` in `src/sim/`. Brood `activeBodiesMax: 1`.
- Free toolchain; determinism: same seed + same advances ⇒ same LOD/caravan/doctrine/letter outcomes.
- Square ortho grid (`q=x`,`r=y`) — wilderness §6; do not reopen.
- Inputs: `specs/2026-11-06-road-content-design.md`, `specs/2026-11-06-spark-pacing-balance.md`, wilderness-economy §3–5.
- Spark pacing: dawn/rest must remain reachable (M3 Forge pass); LOD must not re-introduce 3-tick fuses (`cost_town_despair` stays mild).
- Quality > schedule; Probe matrix must stay runnable.

### Decision (brainstorming)

| | Approach | Trade-off |
|---|----------|-----------|
| A | Full agent sim for every NPC/caravan | Too heavy; nondeterministic feel |
| B | **Dawn LOD + schedule tables + formula ticks** *(chosen)* | Matches authored data; testable; Probe-friendly |
| C | Defer all living systems to M5 | Leaves M3 roads empty off-screen |

**Choose B.** Four task groups only — no fauna AI, no tactical combat, no hex.

### HEAD API lock

```ts
createPlaySession({ mode: 'play', seed, archetypeId }): PlaySession
// PlaySession: start, listActions, act, tick, travel, snapshot, events, dump, listRoutes, …
startTravel(state, routeId): { daysEff: number }  // emits route.travel_step / encounter.spawn
generateWorld({ seed, peopleCount?, includeAnchors? }): FabricWorld
dumpWorld(world): { text, hash }
```

Economy/doctrine/letter modules **new** under `src/sim/`; wire into `advanceToDawn` / `tick` / travel day loop.

### File map

| Path | Responsibility |
|------|----------------|
| `src/sim/economy-lod.ts` | Dawn stock flows, despair, starve juice |
| `src/sim/caravans.ts` | Schedule spawn/move from `caravan-schedules.json` |
| `src/sim/doctrine-tick.ts` | Competition + collapse cascade |
| `src/sim/letters-scale.ts` | Batch letters/rumors from ripples + templates |
| `tests/sim/economy-lod.test.ts` etc. | TDD |

## Task files

- [Task A: Off-screen economy LOD](./task-a-economy-lod.md)
- [Task B: Caravans from schedules](./task-b-caravans.md)
- [Task C: Doctrine competition & collapse](./task-c-doctrine-collapse.md)
- [Task D: Letters & rumors at scale](./task-d-letters-rumors.md)

## M4 acceptance

1. `npm run validate && npm test && npm run build` green.  
2. Headless: 10 dawns on seed 42 move stock, spawn ≥1 caravan, can collapse a doctrine when exposure/gap thresholds met, emit ≥3 letter/rumor packets.  
3. Spark: LOD despair drain does not restore pre-pacing fuse (kind median still dozens of ticks with dawn).  
4. Grep: no `archetypeId ===` in `src/sim/`.

## Plan self-review

- Four groups map 1:1 to requested scope.  
- Road-content schedules + spark-pacing constraints cited.  
- No TBD. Hoarder/async/generational stay M5.
