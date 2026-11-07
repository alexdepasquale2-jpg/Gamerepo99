# M5 Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After M4's living off-screen layer, ship **depth**: a valid hoarder path with dual-edge notoriety, kingdom patrons tied to doctrines, and generational play with async legacy (versioned world files). Headless-first, sim side only.

**Architecture:** New pure modules under `src/sim/` tick from the existing `advanceToDawn` / `tick` / `act` paths. Reuse `economy-lod`, `doctrine-tick` (`ensureDoctrines`, `applyDoctrineAct`, `legitimacyOf`), `letters-scale` (`enqueueLetter`), `social/unspoken`, `succession.ts`. Data is already authored: `src/data/economy/{patrons,stash-sites,notoriety}.json`, `src/data/hooks/legacy.json`.

**Sources (do not contradict):** `docs/DESIGN.md` §2.6 (generational play, LOCKED succession copy) and pointers at lines 56-63; `specs/2026-11-05-hoarder-notoriety-design.md` §4-8; `specs/2026-11-05-async-legacy-npc-design.md` §4-8b; `specs/2026-11-05-doctrine-legitimacy-design.md`.

## Decision

| | Approach | Trade-off |
|---|----------|-----------|
| A | Separate merchant/hoarder mode | Archetype/mode fork; violates forgeRule |
| B | **Metered hoard + notoriety + patrons on shared systems, imprint-based legacy** *(chosen)* | Data-driven, reuses ripple/rumor/kin and doctrines |
| C | Live relay for async | Cost, accounts; spec rejects |

## Global rules (every task)

- Determinism: same seed + same actions => same outcomes. Use `deriveRng` (`src/sim/rng.ts`); no `Math.random`.
- No `archetypeId ===` in `src/sim/`; behavior comes from data weights + hooks.
- No runtime AI. Files < ~400 lines; split modules early.
- Surfacing via people/juice (inspect lines, gossip, tells, letters), never popups.
- Change only through interactions/acts; never spend a resource as a button.
- Neglect is never a lose state.
- Sim side only. Screens, pickers, toasts, art, audio -> M6.

## Task order

1. [Task A: Hoarder path and notoriety](./task-a-hoarder-notoriety.md) (standalone; supplies `coin`, `notoriety`, `peakCoin`)
2. [Task B: Kingdom patrons](./task-b-kingdom-patrons.md) (needs A meters + M4 doctrines)
3. [Task C: Generational legacy and async world files](./task-c-generational-legacy.md) (needs A for `hoard_legacy`; B for patron-touched deltas)

## Gate

```
npm run validate && npm test && npm run build
npx vite-node scripts/m5-depth-evidence.mts
```

New `scripts/m5-depth-evidence.mts`, modelled on `scripts/m4-living-world-evidence.mts` (seeded headless runs, two-run determinism check, JSON to `docs/qa/reports/_m5-depth-evidence.json`, exit 0/1/2). Checks:

1. 30-dawn hoarder bot (zero reignites) ends with `ash_hoard` ending, not a loss; notoriety changed encounter weights.
2. Patron deal shifts doctrine meters and notoriety, identically across two runs.
3. Burnout -> "Carry it on" yields a heir with ember + echoes + rumors; export -> import reproduces the same `contentHash` with the legend present.
4. Grep: no `archetypeId ===` in `src/sim/`, no `Math.random` in new files.

## Out of scope

- Render, audio, menus, import/export/succession UI, share sheet -> **M6**.
- Balance bots, performance, curated legacy packs -> **M7**.
- Free static host / index -> **M8**, needs Niblet+Alex clearance.
- Co-op, server, cloud saves, new archetypes/towns, runtime AI.

## Cross-spec open questions (flagged, not resolved)

1. Hoarder spec §8 stages stash/notoriety/patron data+dawn ticks in **M4**; M4 plan deferred them to M5. Data files exist (`m4Required: true` in stash-sites); no sim consumes them. This plan implements the ticks in M5.
2. `2026-11-05-last-spark-m5-outline.md` (REPLAN note) describes M5 as polish/showcase and remaps that to M6/M8; DESIGN.md §M5 = Depth. This plan follows DESIGN.md.
3. Async spec §6 puts import/export UI in M5; assignment puts all UI in M6. Plan ships file I/O functions only.

## Decisions (Alex, 2026-11-07)

1. Patrons: accept the town-scale patrons for M5; kingdom-scale data can come later.
2. Patron → doctrine: paying the tithe raises `realDelivery`; `deny_reignite` raises `propaganda`.
3. Death: out of scope for M5; burnout is the only ending of a life.
4. Hoard: `visibleWealth = min(1, totalStashCoin / capacity)`; `hoardLegacyCoinMin` uses the authored value in `notoriety.json` (or `legacy_hoard_imprint`'s threshold if that is the only one).
5. Heir: zero eligible bonds → only "Let it rest" is offered.
