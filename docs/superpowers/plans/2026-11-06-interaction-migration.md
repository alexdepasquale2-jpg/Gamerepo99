# Interaction Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace spark-spend methods with data-driven interactions; spark is courage (strain/gain side-effect only).

**Architecture:** Pure `src/sim/interactions.ts` loads Loom `systems/interactions/` tables, applies touch + touchScore + spark formula, gates reignite. Compat adapter expands `act('inspire@p')` to recipe defaults until Probe bots switch. No painter/render edits.

**Tech Stack:** TypeScript, Vitest, existing `SimState` / play-session, data under `src/data/systems/interactions/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-06-interaction-model.md` (Niblet/Alex approved).
- Deterministic, data-driven; no `archetypeId ===` in sim.
- **Never edit** `src/render/painters/overworld-paint.ts` or `src/render/sheet-frames.ts`.
- TDD: failing test first, watch fail, minimal green, commit per task.
- Prefer `claude -p` for bulk impl; Forge reviews every diff.

## File map

| File | Role |
|------|------|
| `src/sim/interactions.ts` | `loadInteractionTables`, `resolveInteraction`, touchScore, reignite |
| `src/sim/interaction-state.ts` | Per-person runtime: marks, presence, bond, promises, touchScore, kindsTouched |
| `src/sim/play-session/play-session-act.ts` | Compat: method act → recipe; later list interaction actions |
| `tests/sim/interaction-touch.test.ts` | Task 1–2 unit tests |
| `tests/sim/interaction-examples.test.ts` | Replay Loom examples A/B/C |
| Data (already landed) | `src/data/systems/interactions/*` |

---

### Task 1: resolveInteraction touch + spark

**Files:**
- Create: `src/sim/interactions.ts`, `src/sim/interaction-state.ts`
- Create: `tests/sim/interaction-touch.test.ts`
- Modify: `src/sim/index.ts` (exports only)

**Interfaces:**
- Produces: `resolveInteraction(state, interactionId, personId, args?) → { spark, flame01, touchScore, … }`
- Consumes: catalog/scoring/rules from loaded JSON (inline fixture OK in unit test)

- [ ] **Step 1: Write failing test** `tests/sim/interaction-touch.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createInteractionRuntime, resolveInteraction } from '../src/sim/interactions';

describe('resolveInteraction', () => {
  it('work_alongside changes flame01 and spark by table (no methods.sparkCost)', () => {
    const rt = createInteractionRuntime({
      catalog: {
        interactions: [{
          id: 'work_alongside',
          kind: 'work_alongside',
          baseStrain: 3,
          sparkGain: 3,
          touch: { flame01: 0.04 },
          bondDelta: 0,
          ripple: 'help',
          tags: ['meaning'],
        }],
      },
      scoring: {
        spark: { sparkMax: 100, situationMulDefault: 1 },
        touchScoreWeights: { flame01Abs: 10, meaning: 4, bond: 5, genuine_growth: 4, keptPromise: 5, presenceDay: 1, giftAccepted: 3, stoodUp: 4, brokenPromise: -6, hollownessAdd: -3, resentmentAdd: -2 },
        reignite: { touchScoreMin: 24, flame01Min: 0.45, requireHollownessStacks: 0 },
      },
      person: { id: 'marta', flame01: 0.28, trust: 0.35, marks: { hollowness: 1 }, touchScore: 7.8, presence: 2, bond: 1, spark: 86 },
    });
    const out = resolveInteraction(rt, 'work_alongside', 'marta');
    expect(out.flame01).toBeCloseTo(0.32, 5);
    expect(out.spark).toBe(86); // -3 +3
    expect(out.touchScore).toBeCloseTo(12.2, 5); // +0.04*10 + meaning 4
    expect(out.usedMethodSparkCost).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (module missing)

Run: `npx vitest run tests/sim/interaction-touch.test.ts`
Expected: FAIL cannot find module / resolveInteraction undefined

- [ ] **Step 3: Minimal `src/sim/interactions.ts` + state** implementing formula from scoring.json

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit** `feat(sim): resolveInteraction work_alongside touch+spark (TDD)`

---

### Task 2: Reignite gate

**Files:** Modify `src/sim/interactions.ts`; extend `tests/sim/interaction-touch.test.ts`

**Interfaces:**
- Produces: `out.reignited` boolean; requires touchScore≥24, flame01≥0.45, hollowness stacks 0, **≥3 distinct kinds** touched (Forge step 2)

- [ ] **Step 1: Failing test** — sequence show_up, talk_gentle, favor_do, work_alongside, promise_keep, talk_gentle → reignited true only at end; single interaction never reignites even if scores forced high

- [ ] **Step 2–4:** RED → GREEN → commit `feat(sim): reignite after touchScore≥24 across ≥3 kinds`

---

### Task 3: Loader + method compat adapter

**Files:**
- Modify: `src/sim/load-data.ts` (or thin loader in interactions.ts reading assembled virtual file)
- Modify: `src/sim/play-session/play-session-act.ts` — `inspire@p` → recipeDefault from migration.json
- Test: `tests/sim/interaction-compat.test.ts`

- [ ] Failing: `actMethod(state,'inspire@marta')` calls resolveInteraction recipe, spark changes via strain not methods.sparkCost path flag
- [ ] Implement adapter; keep listMethodActions until Probe switches
- [ ] Commit `feat(sim): method→interaction compat adapter`

---

### Task 4: Replay Loom examples A/B/C

**Files:** `tests/sim/interaction-examples.test.ts`

- [ ] Load `examples.json`; run each sequence; assert expect fields within 1e-6
- [ ] Commit `test(sim): replay interaction examples A/B/C`

---

### Task 5: Wire exports + soft spark-pacing docs only if needed

- [ ] Export from `src/sim/index.ts`
- [ ] Do **not** retire UI copy or Probe bots in this plan slice (Niblet/Probe later)
- [ ] Commit if any leftover

## Out of scope

- Painter / sheet-frames / OverworldScene
- Probe bot matrix rewrite (handoff after green examples)
- Retiring method fragments tags (later)

## Spec coverage

| Spec § | Task |
|--------|------|
| §3 spark formula | 1 |
| §4 touchScore + reignite | 1–2 |
| §5 catalog touch | 1, 4 |
| §7 migration steps 1–4 | 1–3 |
| §8 examples | 4 |
| §9 acceptance (partial) | 2, 4 |
