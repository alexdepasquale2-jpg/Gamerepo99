# Last Spark M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M2, ship multi-body (activeBodiesMax 2), kinship packet propagation (baker cousin / shamed pen pal), LOD distant towns, letters UI, and Hollow Ford — all data-driven, half-day ruthless.

**Architecture:** Extend pure `src/sim/` with kinship graph + packet scheduler + lodTick; embodiment reads `activeBodiesMax` from traits only; UI letters modal reads delivered packets. Spec: `docs/superpowers/specs/2026-11-05-last-spark-m3-design.md` (brainstorm C).

**Tech Stack:** TypeScript, Vitest, Phaser 3 UI for letters only; JSON in `src/data/`.

## Global Constraints

- No `archetypeId ===` branches in `src/sim/`.
- Formulas verbatim from M3 spec §2–§3 (emit chance `0.4 + 0.25*weight`, LOD soft factor `0.85`).
- Authored people (`authored` or M2 cast) never overwritten by history gen.
- `npm test && npm run validate` green; feel bus events remain.

---

### Task 1: Brood activeBodiesMax data + embodiment tests

**Files:**
- Modify: `src/data/traits.json` (`body_basilisk_brood.activeBodiesMax` → 2)
- Modify: `src/sim/inhabitant.ts` / embodiment helpers from M2
- Test: `tests/sim/multi-body.test.ts`

**Interfaces:**
- Consumes: `assembleInhabitant`, embodiment trait
- Produces: `setActiveBodies(state, ids: string[]): void` (enforces ≤ activeBodiesMax); `bodiesInMultipleTowns(state): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it('allows two active bodies and strains across towns', () => {
  const state = bootM2World(loadData(), 'basilisk_brood', 3);
  expect(state.player.embodiment.activeBodiesMax).toBe(2);
  setActiveBodies(state, ['body_0', 'body_1']);
  state.player.bodies[0].townId = 'ashford';
  state.player.bodies[1].townId = 'lowmere';
  const spark = state.player.spark;
  runHooks(state, 'dusk', ctx);
  expect(state.player.spark).toBe(spark - 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/multi-body.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Bump trait JSON; enforce max in `setActiveBodies`; dusk hook `when.bodiesInMultipleTowns` already in data.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/multi-body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/traits.json src/sim tests/sim/multi-body.test.ts
git commit -m "feat(m3): dual active bodies via trait data"
```

---

### Task 2: Kinship load + packet emit/deliver formulas

**Files:**
- Keep: `src/data/kinship.json`, `src/data/ripples.json`
- Create: `src/sim/kinship.ts`, `src/sim/packets.ts`
- Test: `tests/sim/propagation-m3.test.ts`

**Interfaces:**
- Consumes: kinship edges, ripples.crossTown
- Produces: `emitAfterResolve(state, personId)`, `deliverDuePackets(state)`
- Emit proof chance: `0.4 + 0.25 * maxEdgeWeightToOtherTown`

- [ ] **Step 1: Write the failing test**

```ts
it('baker cousin: marta growth can packet priya after mill_road.days', () => {
  const state = bootM2World(loadData(), 'marrow', 11);
  // force genuine_growth on marta, force emit roll success via rng stub
  emitAfterResolve(state, 'marta_ellison');
  state.day += 2;
  deliverDuePackets(state);
  expect(state.people.priya_sen.flame).toBeGreaterThan(13);
  expect(state.lettersDelivered.some(l => l.toPersonId === 'priya_sen')).toBe(true);
});

it('shamed pen pal: leon hollowness pressures ashford', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 12);
  state.people.leon_march.marks = [{ markId: 'hollowness', stacks: 1 }];
  emitAfterResolve(state, 'leon_march');
  state.day += 2;
  deliverDuePackets(state);
  expect(state.towns.ashford.relapsePressure).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/propagation-m3.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement spec §2.3–2.5 exactly; use seeded rng inject for deterministic tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/propagation-m3.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/kinship.ts src/sim/packets.ts tests/sim/propagation-m3.test.ts src/data/kinship.json
git commit -m "feat(m3): kinship packet propagation formulas"
```

---

### Task 3: LOD dawn pass

**Files:**
- Modify: `src/data/towns.json` (add `lod` blocks)
- Create: `src/sim/lod.ts`
- Test: `tests/sim/lod.test.ts`

**Interfaces:**
- Produces: `lodDawnPass(state, townId)` — packets already delivered globally; relapseSamples; driftPerDawn

- [ ] **Step 1: Write the failing test**

```ts
it('lod drifts vitality without entry', () => {
  const state = bootM2World(loadData(), 'marrow', 4);
  const v0 = state.towns.lowmere.vitality;
  state.currentTownId = 'ashford';
  for (let i = 0; i < 3; i++) { state.day++; lodDawnPass(state, 'lowmere'); }
  expect(state.towns.lowmere.vitality).toBeLessThan(v0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/lod.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Spec §3; soft factor 0.85; milder flame drops 10..18.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/lod.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/lod.ts src/data/towns.json tests/sim/lod.test.ts
git commit -m "feat(m3): LOD dawn pass for distant towns"
```

---

### Task 4: Letters UI + templates

**Files:**
- Keep: `src/data/letters.json`
- Create: `src/ui/letters-ui.ts`
- Modify: `src/ui/hud.ts`
- Test: `tests/sim/letters.test.ts` (template pick headless)

**Interfaces:**
- Produces: `formatLetter(templateId, ctx): {title, body}`; UI lists `state.lettersDelivered`

- [ ] **Step 1: Write the failing test**

```ts
it('picks cousin template for proof packet with cousin edge', () => {
  const t = pickLetterTemplate(loadData(), { packetType: 'proof_packet', edgeKind: 'cousin' });
  expect(t.id).toBe('tpl_proof_cousin');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/letters.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Match packetType+edgeKind; fallback generic; HUD badge unread count.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/letters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/letters-ui.ts src/ui/hud.ts src/data/letters.json tests/sim/letters.test.ts
git commit -m "feat(m3): letters discovery ui and templates"
```

---

### Task 5: Hollow Ford content + unlock

**Files:**
- Modify: `src/data/towns.json`, `people.json`, `lines.json`, `links.json`
- Test: `tests/sim/hollow-ford.test.ts`

**Interfaces:**
- Unlock: Ashford vitality ≥ 50 OR any packet from Lowmere delivered

- [ ] **Step 1: Write the failing test**

```ts
it('unlocks hollow_ford at ashford vitality 50', () => {
  const state = bootM2World(loadData(), 'marrow', 5);
  state.towns.ashford.vitality = 50;
  expect(isTownUnlocked(state, 'hollow_ford')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/hollow-ford.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Add town, 3 people + lines, link; unlock rule in world.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/hollow-ford.test.ts && npm run validate`
Expected: PASS / OK

- [ ] **Step 5: Commit**

```bash
git add src/data/towns.json src/data/people.json src/data/lines.json src/data/links.json src/sim tests/sim/hollow-ford.test.ts
git commit -m "feat(m3): hollow ford settlement"
```

---


### Task 6: Gap axis, representation, bridge acts

**Files:**
- Modify: `src/sim/world.ts`, `src/sim/packets.ts`, `src/sim/methods.ts`
- Data already: `towns.json` gapAxis/connection/standing; `kinship.json` crossGap; civic_voice tags
- Test: `tests/sim/gap.test.ts`
- Spec: M3 §10; lore `specs/2026-11-05-founding-lore-gap-design.md`

**Interfaces:**
- Produces: `gapDelta(a,b)`, `strainMul(edge)`, `applyRepresentation(state, personId)`, `applyBridgeAct(state, townA, townB)`
- Bus: `gap.bridge`

- [ ] **Step 1: Write the failing test**

```ts
it('ruth genuine_growth raises ashford connection', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 9);
  state.people.ruth_calder.flame = 40;
  state.people.ruth_calder.marks = [{ markId: 'genuine_growth', stacks: 1 }];
  const c0 = state.towns.ashford.connection;
  applyRepresentation(state, 'ruth_calder');
  expect(state.towns.ashford.connection).toBeGreaterThan(c0);
});

it('cross-gap clara-mira edge has elevated strain', () => {
  const d = loadData();
  const e = d.kinship.edges.find(x => x.id === 'edge_clara_mira_city');
  expect(strainMul(d, e)).toBeGreaterThan(1.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/gap.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement M3 §10 formulas; default missing gapAxis to 0.2 for safety.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/gap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim tests/sim/gap.test.ts src/data/towns.json src/data/kinship.json
git commit -m "feat(m3): gap axis strain representation bridge acts"
```

---
## M3 acceptance

1. Tests in Tasks 1–5 green; validate OK.  
2. Baker cousin & shamed pen pal reproducible with seeds.  
3. Grep: no archetype equality branches in sim.  
4. Letters UI shows delivered packet.
5. Gap/representation/bridge tests green; Ashford still boots with gapAxis 0.15.

## Plan self-review

- Spec §1–§8 + §10 (lore gap) mapped to tasks.  
- Formulas cited.  
- No TBD. History gen stub deferred to M4 tables except kinship generateRules present.
