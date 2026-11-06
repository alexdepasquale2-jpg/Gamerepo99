> **SUPERSEDED 2026-11-05:** Town-loop M2 cancelled. New order: **M2 Fabric** → **M3 First playable world**.  
> Active plan: `docs/superpowers/plans/m2/index.md` (stub: `2026-11-05-m2-fabric.md`). Archive copy also under `docs/archive/plans/`.  
> Keep for historical task detail (Forge Tasks 1–6 reuse). Brood `activeBodiesMax: 1` (595d722) still binds.

# Last Spark M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable M2 closed loop by **Fri Nov 6 8:00 AM**: pick one of three data archetypes, walk Ashford/Lowmere, run methods×wounds×marks with hook-driven costs/refusals/recovery (no per-archetype branches), basic cross-town packets, succession stub with locked UI copy, minimal Phaser view + debug overlay.

**Architecture:** Pure `src/sim/` tick core (seeded RNG, no Phaser/DOM). JSON from `src/data/` loaded once into typed tables. Phaser in `src/render/` + `src/ui/` reads state and sends commands. Inhabitant = assembled traits/hooks; systems iterate hook ids only.

**Tech Stack:** TypeScript, Vite, Phaser 3, Vitest (or node:test), existing `scripts/validate-data.mjs`.

## Global Constraints

- Feel pass ratified: `docs/superpowers/specs/2026-11-05-m2-feel-pass-design.md` (option B) → binding `DESIGN.md` §3.5.

- Honor `docs/STRUCTURE.md`: sim pure; render/ui never import each other; kebab-case files; soft 200 / hard 400 lines.
- **No `if (archetypeId === …)`** — only traits/hooks/effects (`docs/DESIGN.md` §2.1).
- Design status **LOCKED**; succession copy exact: `Your fire went out. Someone remembers it.` / `[Carry it on]` / `[Let it rest]`.
- Dependence bonds ×0.5; dependence successors get `inherited_dependence`.
- Free toolchain only; 32px tiles; `npm run build` && `npm test` must pass for M2 done.
- Schedule: M2 due **Fri 8 AM**; M3–M5 Friday; polish Sat; showcase Sun. Feel > features. Defer LOD, multi-active Brood, full history gen to M3+.
- **Save format (forward-compat only):** any M2 save JSON must include `version: 1` and may include reserved optional `imprint: null` (or omit). Do not implement imprint→NPC or world import/export in M2 — see `specs/2026-11-05-async-legacy-npc-design.md` (M5+).
- **Optional coin:** `player.defaults.coin` (number, default 0) may exist on save/state. Do **not** implement stash/notoriety/patrons in M2 — see `specs/2026-11-05-hoarder-notoriety-design.md` (M4+).
- **Quality bar:** depth beats breadth; schedule is secondary. M2 acceptance includes **What makes this special** (testable).
- **Brood M2 lock:** `bodySlots: 3`, `activeBodiesMax: 1` (Forge 595d722). Do not raise max in M2.
- **Scenarios:** `src/data/systems/scenarios/` + `tests/scenarios/README.md` — Task 10 should prefer these seeded paths (≥3/5 moments).
- **Optional dynamism:** `player.features.bakedDynamismLines` default **false**. See Optional Task 11.

---

## File map (create unless noted)

| Path | Responsibility |
|------|----------------|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` | Tooling |
| `src/main.ts` | Boot Phaser, wire sim |
| `src/sim/types/*.ts` | Data + runtime types |
| `src/sim/rng.ts` | Seeded RNG |
| `src/sim/load-data.ts` | Load/validate JSON tables |
| `src/sim/inhabitant.ts` | Assemble inhabitant from archetype |
| `src/sim/effects.ts` | Apply effect schema |
| `src/sim/hooks.ts` | Run hooks by trigger/`when` |
| `src/sim/world.ts` | Towns, sites, people, links, packets |
| `src/sim/methods.ts` | Resolve + refusals |
| `src/sim/ripples.ts` | Local + cross-town emit |
| `src/sim/succession.ts` | Bonds, flag, UI payload |
| `src/sim/sim-context.ts` | Tick order / commands |
| `src/sim/events-bus.ts` | Sim event bus (`STRUCTURE.md`) |
| `src/render/boot-scene.ts`, `town-scene.ts` | Minimal view |
| `src/ui/hud.ts`, `method-menu.ts`, `succession-ui.ts`, `debug-overlay.ts` | HUD/commands |
| `tests/sim/*.test.ts` | Headless tests |
| `README.md` | Run/test instructions |

---

### Task 1: Scaffold + data gate

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `README.md`
- Test: `tests/sim/validate-data.test.ts`
- Keep: `scripts/validate-data.mjs`, `src/data/*`

**Interfaces:**
- Consumes: none
- Produces: `npm test`, `npm run validate` scripts

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/validate-data.test.ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('data gate', () => {
  it('validate-data.mjs exits 0', () => {
    const out = execFileSync('node', ['scripts/validate-data.mjs'], { encoding: 'utf8' });
    expect(out).toContain('OK');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/validate-data.test.ts`
Expected: FAIL (vitest/package missing)

- [ ] **Step 3: Write minimal implementation**

`package.json` scripts: `"test": "vitest run"`, `"validate": "node scripts/validate-data.mjs"`, `"dev": "vite"`, `"build": "tsc --noEmit && vite build"`. Dependencies: `phaser`, `typescript`, `vite`, `vitest`. Minimal `index.html` + `src/main.ts` console boot stub.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run validate`
Expected: PASS / OK

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json index.html README.md tests/sim/validate-data.test.ts src/main.ts
git commit -m "chore: scaffold hearthfall tooling and data gate"
```

---

### Task 2: Seeded RNG + types

**Files:**
- Create: `src/sim/rng.ts`, `src/sim/types/data.ts`, `src/sim/types/runtime.ts`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `createRng(seed: number): { next(): number; int(min: number, max: number): number }`
- Produces types: `ArchetypeDef`, `HookDef`, `Inhabitant`, `SimState`, `Effect`

- [ ] **Step 1: Write the failing test**

```ts
// tests/sim/rng.test.ts
import { createRng } from '../../src/sim/rng';
import { describe, it, expect } from 'vitest';

it('is deterministic for same seed', () => {
  const a = createRng(42); const b = createRng(42);
  expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL cannot find module

- [ ] **Step 3: Write minimal implementation**

Mulberry32 in `rng.ts`. Types mirror JSON ids as string unions loosely (`string` ids OK for M2).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/types tests/sim/rng.test.ts
git commit -m "feat(sim): seeded rng and core types"
```

---

### Task 3: Load data tables

**Files:**
- Create: `src/sim/load-data.ts`
- Test: `tests/sim/load-data.test.ts`

**Interfaces:**
- Consumes: `src/data/*.json`
- Produces: `loadData(): DataTables` with `archetypes`, `traits`, `hooks`, `methods`, `people`, `towns`, `links`, …

- [ ] **Step 1: Write the failing test**

```ts
import { loadData } from '../../src/sim/load-data';
it('loads three m2 archetypes and refusal_shame_child hook', () => {
  const d = loadData();
  expect(d.archetypes.filter(a => a.m2Playable)).toHaveLength(3);
  expect(d.hooksById.has('refusal_shame_child')).toBe(true);
  expect(d.hooksById.has('hook_does_not_exist')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/load-data.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Import JSON via Vite `assert { type: 'json' }` or `fs` in tests + vite plugin. Build `hooksById`, `traits` indexes. Throw if archetype references missing hook id (belt + `validate-data.mjs`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/load-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/load-data.ts tests/sim/load-data.test.ts
git commit -m "feat(sim): load and index locked data tables"
```

---

### Task 4: Effects + hook runner

**Files:**
- Create: `src/sim/effects.ts`, `src/sim/hooks.ts`
- Test: `tests/sim/hooks.test.ts`

**Interfaces:**
- Consumes: `DataTables`, `SimState`, `createRng`
- Produces: `applyEffect(state, effect, ctx)`, `runHooks(state, trigger, ctx): void`
- **Forbidden:** branching on `state.player.archetypeId`

- [ ] **Step 1: Write the failing test**

```ts
it('runs cost_loneliness_tax only when when{} matches', () => {
  const state = makeStateWithHookIds(['cost_loneliness_tax']);
  state.flags.kindSuccessToday = true;
  state.flags.noBurningAdjacent = true;
  runHooks(state, 'dusk', { data, rng });
  expect(state.player.spark).toBe(68); // 70-2
});

it('does not special-case marrow id', () => {
  const src = readFileSync('src/sim/hooks.ts', 'utf8');
  expect(src).not.toMatch(/archetypeId\s*===\s*['\"]marrow['\"]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/hooks.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Evaluate `when` predicates generically. Apply `op` add/mul/set/grant_mark/emit_packet for M2 subset.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/hooks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/effects.ts src/sim/hooks.ts tests/sim/hooks.test.ts
git commit -m "feat(sim): generic effects and hook runner"
```

---

### Task 5: Inhabitant assembly + embodiment move

**Files:**
- Create: `src/sim/inhabitant.ts`, `src/sim/world.ts` (partial: grid + sites)
- Test: `tests/sim/inhabitant.test.ts`

**Interfaces:**
- Consumes: `loadData`, archetype id
- Produces: `assembleInhabitant(data, archetypeId): Inhabitant`
- Produces: `canEnterTile(inh, tileTags): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it('marrow blocked on door_front, ivy not', () => {
  const d = loadData();
  const m = assembleInhabitant(d, 'marrow');
  const i = assembleInhabitant(d, 'ivy_quill');
  expect(canEnterTile(m, ['door_front'])).toBe(false);
  expect(canEnterTile(i, ['door_front'])).toBe(true);
});

it('brood has bodySlots 3 and activeBodiesMax 1', () => {
  const b = assembleInhabitant(loadData(), 'basilisk_brood');
  expect(b.embodiment.bodySlots).toBe(3);
  expect(b.embodiment.activeBodiesMax).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/inhabitant.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Copy trait blobs onto inhabitant; list hook ids from archetype + spark profile. No archetype switches.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/inhabitant.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/inhabitant.ts src/sim/world.ts tests/sim/inhabitant.test.ts
git commit -m "feat(sim): assemble inhabitants from traits"
```

---

### Task 6: Method resolve + diegetic refusals

**Files:**
- Create: `src/sim/methods.ts`
- Modify: `src/sim/world.ts` (people flame)
- Test: `tests/sim/methods.test.ts`

**Interfaces:**
- Consumes: hooks `refusal`, methodMods, wound matrix
- Produces: `commitMethod(state, personId, methodId): CommitResult`  
  (`{ kind:'refused', line, tells } | { kind:'resolved', flameDelta, marks }`)

- [ ] **Step 1: Write the failing test**

```ts
it('shame on jonah refuses with visible menu semantics', () => {
  const state = bootAshford('marrow');
  const r = commitMethod(state, 'jonah_pike', 'shame');
  expect(r.kind).toBe('refused');
  expect(r.line.length).toBeGreaterThan(0);
  expect(state.player.spark).toBeLessThan(70); // coal flicker -1
  expect(state.people.jonah_pike.flame).toBe(state.people.jonah_pike.flameStart ?? 18);
});

it('challenge on marta raises flame using matrix', () => {
  const state = bootAshford('marrow');
  const before = state.people.marta_ellison.flame;
  const r = commitMethod(state, 'marta_ellison', 'challenge');
  expect(r.kind).toBe('resolved');
  expect(state.people.marta_ellison.flame).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/methods.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Match refusal hooks by `methodId` + `when`; pick line by `lineVoiceFrom` archetypeId fallback `default`. Else compute flameDelta; roll markWeights; spend spark; pick `lines.json` reaction for method; if witnesses present adjust mark weights per DESIGN §3.5; push juice events.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/methods.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/methods.ts src/sim/world.ts tests/sim/methods.test.ts
git commit -m "feat(sim): method resolve and diegetic refusals"
```

---

### Task 7: Ripples + cross-town packets + M2 region boot

**Files:**
- Create: `src/sim/ripples.ts`, expand `src/sim/world.ts`, `src/sim/sim-context.ts`
- Test: `tests/sim/propagation.test.ts`

**Interfaces:**
- Consumes: `links.json`, `ripples.json`
- Produces: `bootM2World(data, archetypeId, seed): SimState`, `tickDay(state)`, `advancePackets(state)`

- [ ] **Step 1: Write the failing test**

```ts
it('genuine_growth can emit proof packet along rumor link', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 1);
  // force mark + ripple
  state.people.ruth_calder.flame = 60;
  state.people.ruth_calder.marks = [{ markId: 'genuine_growth', stacks: 1 }];
  afterResolveRipple(state, 'ruth_calder');
  expect(state.packets.length + state.deliveredProofs.length).toBeGreaterThan(0);
});

it('fear-road early unlock stays costly', () => {
  const state = bootM2World(loadData(), 'marrow', 2);
  state.day = 4; state.player.spark = 40;
  const cost = travelCost(state, 'den_lowmere_fear_road');
  expect(cost).toBeGreaterThanOrEqual(6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/propagation.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Authored Ashford+Lowmere+den from JSON (no procgen). Packets decrement `days` at dawn. Vitality formula from DESIGN.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/propagation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/ripples.ts src/sim/world.ts src/sim/sim-context.ts tests/sim/propagation.test.ts
git commit -m "feat(sim): m2 region, ripples, cross-town packets"
```

---

### Task 8: Succession stub + inherited_dependence

**Files:**
- Create: `src/sim/succession.ts`
- Test: `tests/sim/succession.test.ts`

**Interfaces:**
- Consumes: `archetypes.succession`, statusTraits
- Produces: `buildSuccessionScreen(state): { copy, buttons, defaultChoice, candidates }`
- Produces: `chooseContinue(state, personId)`, `chooseQuit(state)`

- [ ] **Step 1: Write the failing test**

```ts
it('uses locked copy and default continue', () => {
  const ui = buildSuccessionScreen(burnedOutState());
  expect(ui.copy).toBe('Your fire went out. Someone remembers it.');
  expect(ui.buttons.continue).toBe('Carry it on');
  expect(ui.buttons.quit).toBe('Let it rest');
  expect(ui.defaultChoice).toBe('continue');
  expect(ui.quitNeverShamed).toBe(true);
});

it('dependence-chosen successor gains inherited_dependence', () => {
  const state = burnedOutStateWithDependenceBondOn('harold_finch');
  chooseContinue(state, 'harold_finch');
  expect(state.player.statusTraits).toContain('inherited_dependence');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/succession.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Score bonds; apply legacy hooks; if dependence path → run `apply_inherited_dependence`. Quit sets `state.ended = 'let_it_rest'` with no shame flavor flags.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/succession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/succession.ts tests/sim/succession.test.ts
git commit -m "feat(sim): succession screen contract and inherited_dependence"
```

---

### Task 9: Minimal Phaser view + UI commands + debug overlay

**Files:**
- Create: `src/render/boot-scene.ts`, `src/render/town-scene.ts`, `src/ui/hud.ts`, `src/ui/method-menu.ts`, `src/ui/succession-ui.ts`, `src/ui/debug-overlay.ts`, `src/sim/events-bus.ts`
- Modify: `src/main.ts`
- Test: `tests/sim/commands.test.ts` (headless command API; no Phaser in tests)

**Interfaces:**
- Consumes: `SimState` readonly from render; commands via `dispatch(state, cmd)`
- Produces: commands `move`, `selectPerson`, `commitMethod`, `travel`, `successionContinue`, `successionQuit`
- Debug overlay fields: spark, day, town vitality, selected person flame/marks, active hooks, archetype id (display only)

- [ ] **Step 1: Write the failing test**

```ts
it('dispatch commitMethod mutates sim without phaser', () => {
  const state = bootM2World(loadData(), 'marrow', 0);
  dispatch(state, { type: 'selectPerson', personId: 'marta_ellison' });
  dispatch(state, { type: 'commitMethod', methodId: 'challenge' });
  expect(state.people.marta_ellison.flame).toBeGreaterThan(12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Colored rects OK (32px). Method menu always lists shame; on refuse show line + coal flicker tint. On resolve show reaction line + spark lerp. Site kindle tint when flame crosses threshold. Succession UI uses locked strings. Debug toggle `D`. Wire Prism hooks via event bus names in DESIGN §3.5.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run build`
Expected: all PASS / build OK

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/render src/ui src/sim/events-bus.ts src/sim/sim-context.ts tests/sim/commands.test.ts
git commit -m "feat: minimal phaser view, ui commands, debug overlay"
```

---

### Task 10: Feel wiring + lines data + memorable-moment tests

**Files:**
- Create: `src/data/lines.json` (if not present), `tests/sim/feel.test.ts`
- Modify: `src/sim/methods.ts`, `src/sim/events-bus.ts`, `src/ui/hud.ts`, `src/render/town-scene.ts`
- Test: `tests/sim/feel.test.ts`

**Interfaces:**
- Consumes: `lines.json`, DESIGN §3.5
- Produces: seeded tests for "warm loaf cold hill" and "nail across the water"

- [ ] **Step 1: Write the failing test**

```ts
it('warm loaf cold hill: kind marta then dusk loneliness', () => {
  const state = bootM2World(loadData(), 'marrow', 7);
  // force carry success on marta, no witnesses, advance to dusk hooks
  expect(state.bus.lastIds).toContain('site.kindle');
  expect(state.bus.lastIds).toContain('spark.spend');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/feel.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Emit juice events; show reaction lines; dusk loneliness path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/feel.test.ts && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/lines.json src/sim tests/sim/feel.test.ts src/ui src/render
git commit -m "feat: moment-to-moment feel events and memorable-moment tests"
```

---

## M2 acceptance (Fri 8 AM)

**Priority:** quality / depth over schedule. Ship fewer systems that pass the special bar rather than a thin closed loop.

1. `npm run validate && npm test && npm run build` green.  
2. Play: pick Marrow/Ivy/Brood → Ashford method loop → Lowmere via clear or costly fear-road → burnout shows exact succession copy.  
3. Repo grep: no `archetypeId ===` in `src/sim/`.  
4. Brood: body swap only (`activeBodiesMax` 1).  
5. Feel: spark lerps on spend; reaction lines show; at least one memorable-moment path (bakery loneliness OR forge packet) reproducible in a seeded test.  
6. Event bus emits §3.5 juice ids for Prism.  

### What makes this special (required — concrete checks)

#### A. Memorable moments the systems produce on their own (no cutscenes)

| # | Moment | How M2 systems create it | Testable check |
|---|--------|--------------------------|----------------|
| 1 | **Warm loaf, cold hill** | Carry/Inspire Marta → `site.kindle` bakery → same-day kind success + dusk with no adjacent burning → `cost_loneliness_tax` | Seeded test: after path, bus contains `site.kindle` and `spark.spend` (or dusk cost); spark decreased at dusk while bakery kindled |
| 2 | **Chalk after the cut** | Shame/Challenge Ruth → `hollowness` mark → next dawn relapse mul drops her flame; if Jonah burning, `ripple.harm` | Seeded test: Ruth has `hollowness`; dawn2 flame < flame after resolve; optional `ripple.harm` when witness burning |
| 3 | **Nail across the water** | Elias reignite with Challenge/Carry → `genuine_growth` → `packet.emit` on ferry/rumor link → Tom site gets proof toast next dawn | Seeded test: bus has `packet.emit`; Lowmere Tom `proof` or packet inbox non-empty by dawn+1 |
| 4 | **Refusal coal** | Choose Shame targeting a child-tagged person → `refusal_shame_child` fires; method stays in menu | Seeded test: resolve blocked/refused; `refusal.coal_flicker` (or refusal line shown); Shame still listed in method menu |
| 5 | **Mark comes back** | Land `resentment` or `dependence` on someone; later method vs them uses markMul / cling dusk cost | Seeded test: second resolve vs same person yields different `flameDelta` or spark cost than unmarked baseline (same seed family) |

Acceptance: **≥3 of 5** reproducible in seeded tests (Task 10); all five *authorable* from current data (no new cutscene content).

#### B. Choices that matter

Every committed method choice must visibly change a later state **or** line.

- **Check:** For each of the 5 methods, a seeded resolve against a fixed Ashford person changes at least one of: `person.flame`, `person.marks`, `player.spark`, reaction line id, or bus juice id, versus a no-op control.  
- **Check:** Witness present vs absent changes mark weights or emits `ripple.help`/`ripple.harm` (assert bus or mark stacks differ).  
- **Check:** Refusing Shame (child) leaves world marks unchanged but still spends the refusal tell (line/coal) — choice is readable, not a soft UI disable.

#### C. First 10 minutes that hook

Beat-by-beat outline (target play, Marrow or Ivy on Ashford):

| t | Beat |
|---|------|
| 0:00 | Boot → pick archetype (name + one-line wound tell). |
| 0:45 | Ashford street; first cold site visible (bakery or stoop). |
| **1:30** | **First meaningful choice:** approach person → method menu (5 methods). Time-to-first-choice ≤ **2 min**. |
| 2:00 | Commit → resolve beat (spark lerp + reaction line). |
| **3:00** | **First consequence:** mark icon / site warmth tint / spark drop readable. Time-to-first-consequence ≤ **4 min**. |
| 5:00 | Second person or revisit; witness or dusk tax foreshadow. |
| 7:00 | Optional: packet toast or Lowmere fear-road tease. |
| 10:00 | Player can state one relationship change (“Marta’s oven lit” / “Ruth went hollow”). |

**Checks:** Probe/manual timer on fresh build; automated smoke may assert tutorial flags: `firstChoiceAtTick` and `firstConsequenceAtTick` recorded on session metrics when bots API lands. Until then: checklist in `docs/qa/reports/m2-playable-town-bots.md` or Probe note.


## Plan self-review

- Feel: brainstorm decision B locked in `specs/2026-11-05-m2-feel-pass-design.md`; Tasks 6/9/10 cover beat/juice/moments.
- Spec coverage: hooks, refusals, packets, succession, 3 archetypes, debug, §3.5 feel — tasked.  
- Deferred explicitly: simultaneous multi-body, full LOD, letter UI, procgen — M3+.  
- No TBD placeholders in tasks.  
- Paths align with `STRUCTURE.md`.

