# M2 Dynamic Fabric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the prebaked dynamism engine + seeded world generator (settlements on the gap axis, kin/friend/pen-pal links, doctrines, biomes, routes, facilities, history), verified headlessly with determinism and coherence tests and a world dump — **not** a playable walk (that is M3).

**Architecture:** Pure `src/sim/` fabric modules on top of Forge’s finished rng, types, load-data, hooks, effects, inhabitant, and **Task 6 methods** (`setReactionLineSelector`, per-resolve reaction pick). Authored Ashford/Lowmere people become anchors. Data eventually under `dialogue/ people/ world/ economy/ systems/ hooks/` (Tidy move; Forge git-mv after Task 6).

**Tech Stack:** TypeScript, Vitest, existing `scripts/validate-data.mjs`. No Phaser required for M2 Fabric acceptance.

**Spec:** `docs/superpowers/specs/2026-11-05-m2-dynamic-fabric-design.md` (folds baked-dynamism).

## Global Constraints

- No `archetypeId ===` in `src/sim/`.
- No runtime LLM / network.
- Brood: `bodySlots: 3`, **`activeBodiesMax: 1`** (commit 595d722) — do not raise in M2.
- **Dialogue canonical:** `line-fragments.json` (authored_anchor alone-slots). `lines.json` deprecated mirror until consumers switch, then delete.
- Reuse `setReactionLineSelector` — do not fork a second picker API.
- Per-person **state vector** on inhabitant/person runtime (Forge preparing) — fabric curves read it.
- `createPlaySession` stays for Probe; add inspect/dump entry or `mode: 'inspect'`.
- Same seed ⇒ identical world gen (byte-stable dump hash).
- Free toolchain only. Do not edit `docs/STRUCTURE.md` from Loom.

### Reuse map (Forge already landed)

| Piece | Location | Fabric use |
|-------|----------|------------|
| RNG | `src/sim/rng.ts` `createRng` | All gen + line tie-breaks |
| Loader | `src/sim/load-data.ts` | Extend for fabric tables + post-move paths |
| Inhabitant | `src/sim/inhabitant.ts` | Assemble player; gen people separate |
| Hooks/effects | `hooks.ts` / `effects.ts` | Unchanged |
| Methods Task 6 | `methods.ts` + `setReactionLineSelector` | Wire blend selector |
| Brood max | `traits.json` activeBodiesMax=1 | Leave |

### Data path mapping (plan targets new layout; until git-mv use flat)

See spec §5. Until move: keep importing `../data/line-fragments.json` etc. After move: `../data/dialogue/line-fragments.json`. Task A below.

---

## Task files

- [Task H: Fabric variety (Probe NO-SHIP follow-up)](./task-h-variety.md)

- [Task A: Loader + validator ready for subfolder data (coordinate Tidy/Forge git-mv)](./task-a-loader.md)
- [Task B: Person state vector + authored anchors](./task-b-state-vector.md)
- [Task C: Pluggable blend selector (wire setReactionLineSelector)](./task-c-line-selector.md)
- [Task D: Coherence / assertion layer](./task-d-coherence.md)
- [Task E: World generator (gap axis settlements + links + doctrines + biomes + routes + facilities + history)](./task-e-worldgen.md)
- [Task F: World inspector dump + createPlaySession inspect mode](./task-f-inspect-dump.md)
- [Task G: Retire lines.json consumers (fragments only)](./task-g-retire-lines.md)

---

## M2 Fabric acceptance

1. `npm run validate && npm test` green (include new fabric tests).  
2. Determinism: seeds 7, 42, 99 identical hashes across two runs each.  
3. Coherence: zero violations on those seeds with anchors.  
4. Authored Ashford people present as anchors when `includeAnchors: true`.  
5. Reaction selector registered via `setReactionLineSelector`; default authored fragments.  
6. Brood still `activeBodiesMax: 1`.  
7. `dumpWorld` / inspect session works headlessly.  
8. Grep: no archetype equality branches; no LLM calls.

## Plan self-review

- Spec pillars 1–5 tasked (A–G).  
- Aligns Forge selector + state vector + determinism (no duplicate systems).  
- Data layout mapping documented; validator note for post-mv.  
- Old town-loop plan superseded.  
- createPlaySession kept for Probe.

