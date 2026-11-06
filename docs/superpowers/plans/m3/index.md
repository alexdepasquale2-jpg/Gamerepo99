# M3 First Playable World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M2 Fabric, ship a **playable walk** of the generated overworld and settlements as any playable archetype — methods, marks, spark, succession, travel time, roadside encounters, cross-town ripples — and pass Probe’s quality gate with the **What makes this special** bar re-targeted at a generated world.

**Architecture:** `createPlaySession({ mode:'play', seed, archetypeId })` boots `generateWorld` into sim state; Phaser/ui read snapshots and send commands. Fabric line selector and coherence already exist. Ashford is an optional anchor settlement, not a bespoke loop.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Probe `tests/bots` + `createPlaySession`.

**Spec:** `docs/superpowers/specs/2026-11-05-m3-first-playable-world-design.md`  
**Gate:** `docs/qa/QUALITY_GATE.md`

## Global Constraints

### HEAD API lock (post–Fabric A–G, ~2f545d0+)

Use these signatures — do **not** invent alternates:

```ts
import { generateWorld, dumpWorld, createPlaySession } from '../src/sim'; // or fabric / world-dump paths

generateWorld({ seed, peopleCount?, includeAnchors? }): FabricWorld
dumpWorld(world: FabricWorld): { text: string; hash: string }  // NOT a bare string
createPlaySession({ mode: 'inspect', seed, peopleCount? }): InspectSession | null
// InspectSession: { dump(): string; snapshot(): InspectSnapshot }
// M3 Task 1 extends createPlaySession with mode: 'play' (currently inspect-only → null/unimplemented)
```

Grid/render: wilderness §6 — **square orthogonal**, `q = x`, `r = y`, not hex.

**What makes this special (Fabric → M3):** keep the bar explicit — ≥3 of 5 seeded moments must pass as scenario tests against **generated** worlds (Task 7). Fabric variety (Task H) must land so gen seeds are not clone-shaped before Probe’s M3 gate.


- No `archetypeId ===` in `src/sim/`.
- Brood `activeBodiesMax: 1` (595d722); no dual-active in M3.
- Travel advances calendar days while world ticks; `MobileRenderView.heading` is `number` degrees (0 north, 90 east).
- Dialogue from `dialogue/fragments/` (canonical line-fragments merge) (canonical); do not revive `lines.json` as source of truth.
- Quality > schedule; Probe matrix must not stay `API_PENDING`.
- Data paths: prefer `src/data/{dialogue,people,world,economy,systems,hooks}/` after Tidy move; flat fallback until then.

### File map

| Path | Responsibility |
|------|----------------|
| `src/sim/play-session.ts` | `createPlaySession` play + inspect |
| `src/sim/travel.ts` | route travel + encounters |
| `src/sim/packets.ts` / kinship | cross-town ripples |
| `src/sim/succession.ts` | burnout → locked UI copy |
| `src/sim/render-snapshot.ts` | `WorldRenderSnapshot` for Prism |
| `src/render/*`, `src/ui/*` | overworld + town + method menu |
| `tests/sim/play-*.test.ts` | TDD |
| `tests/scenarios/*` | special-bar on gen world |
| `docs/qa/reports/m3-worth-playing.md` | Probe verdict |

---

## Task files

- [Task 1: createPlaySession play mode on generated world](./task-01-play-session.md)
- [Task 2: Methods × marks × spark on fabric people](./task-02-methods-marks-spark.md)
- [Task 3: Travel time + roadside encounters](./task-03-travel-encounters.md)
- [Task 4: Cross-town ripples on generated kin](./task-04-cross-town-ripples.md)
- [Task 5: Succession stub on burnout](./task-05-succession.md)
- [Task 6: Minimal Phaser overworld + town view](./task-06-phaser-overworld.md)
- [Task 7: What makes this special — retargeted scenarios on generated world](./task-07-scenarios-generated.md)
- [Task 8: Probe quality gate](./task-08-probe-gate.md)

---

## M3 acceptance

1. `npm run validate && npm test && npm run build` green.  
2. Play: any of 3 archetypes → gen world → method → travel → ripple → succession path.  
3. Special bar: ≥3 emergent moments + first-10-min timings on gen seeds.  
4. Probe gate written; not API_PENDING.  
5. Grep: no `archetypeId ===` in `src/sim/`; Brood max 1.  
6. Ashford not required as only content.

## Plan self-review

- Spec §§4–7 mapped to Tasks 1–8.  
- Special bar retargeted (Task 7).  
- No TBD. createPlaySession kept.  
- M4+ systems explicitly out.

