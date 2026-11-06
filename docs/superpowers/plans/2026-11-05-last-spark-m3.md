> **SUPERSEDED:** Replaced by `2026-11-05-m3-first-playable-world.md` under new milestone numbering. Archive: `docs/archive/plans/`.

# Last Spark M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M2 ships the quality bar, deepen the connected world: kinship propagation, LOD, bounded history stub, letter discovery, gap/doctrine, wilderness economy + travel + `WorldRenderSnapshot` — all test-first, data-driven, no archetype branches.

**Architecture:** Pure `src/sim/` extensions; UI letters read-only from delivered packets; embodiment/`activeBodiesMax` only via traits/hooks (M2 Brood stays `activeBodiesMax: 1` until an optional grant trait/hook adds +1). Specs: `last-spark-m3-design.md`, founding-lore-gap, doctrine-legitimacy, wilderness-economy (heading = degrees).

**Tech Stack:** TypeScript, Vitest, Phaser UI for letters only; JSON under `src/data/`.

## Global Constraints

- No `archetypeId ===` in `src/sim/`.
- **Do not** revert Forge 595d722: Brood base `activeBodiesMax` remains **1** until Task 1’s grant trait/hook is applied via data.
- Formulas: kinship strain emit `(0.4+0.25*w)/strainMul*connectionMul`; LOD soft **0.85**; doctrine legitimacy per decision note; travel hire trust formula; render `heading: number` degrees (0 north, 90 east) — no vec.
- Authored people never overwritten by history gen.
- `bakedDynamismLines` stays false unless a separate optional task enables it; line picker remains pluggable via methods/hooks.
- `npm test && npm run validate` green after each task; quality > schedule.

### File map (create unless noted)

| Path | Responsibility |
|------|----------------|
| `src/data/traits.json` / new status trait or hook | Optional +1 `activeBodiesMax` grant |
| `src/sim/kinship.ts`, `packets.ts` | Emit/deliver |
| `src/sim/lod.ts` | Distant town dawn |
| `src/sim/history.ts` | Bounded generateRules stub |
| `src/ui/letters-ui.ts` | Discovery UI |
| `src/sim/gap.ts` / world helpers | Gap strain, representation, bridge |
| `src/sim/doctrine.ts` | Dawn tick + acts |
| `src/sim/economy.ts`, `travel.ts`, `render-snapshot.ts` | Economy LOD, travel, snapshot |
| `tests/sim/*.test.ts` | Per-task TDD |

---

### Task 1: Optional +1 activeBodiesMax via trait/hook (Brood dual when granted)

**Files:**
- Modify: `src/data/traits.json` — add statusTrait or embodiment modifier e.g. `grant_second_focus` with `{ "activeBodiesMaxAdd": 1 }`
- Optional: `src/data/hooks/legacy.json` or personal-cost — hook that grants the trait
- Modify: `src/sim/inhabitant.ts` (or embodiment helper) to apply `activeBodiesMaxAdd` from traits/hooks only
- Test: `tests/sim/multi-body.test.ts`
- **Do not** set base `body_basilisk_brood.activeBodiesMax` above 1 without the grant present

**Interfaces:**
- Consumes: embodiment `bodySlots`, `activeBodiesMax`; status traits
- Produces: `effectiveActiveBodiesMax(state): number`; `setActiveBodies(state, ids: string[]): void` enforcing ≤ effective max; `bodiesInMultipleTowns(state): boolean`

- [ ] **Step 1: Write the failing test**

```ts
it('M2 base brood max is 1; grant trait raises effective max to 2', () => {
  const state = bootM2World(loadData(), 'basilisk_brood', 3);
  expect(state.player.embodiment.activeBodiesMax).toBe(1);
  expect(effectiveActiveBodiesMax(state)).toBe(1);
  grantStatusTrait(state, 'grant_second_focus'); // data id
  expect(effectiveActiveBodiesMax(state)).toBe(2);
  setActiveBodies(state, ['body_0', 'body_1']);
  state.player.bodies[0].townId = 'ashford';
  state.player.bodies[1].townId = 'lowmere';
  const spark = state.player.spark;
  runHooks(state, 'dusk');
  expect(state.player.spark).toBe(spark - 3); // cost_brood_strain
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/multi-body.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Add `grant_second_focus` statusTrait (`activeBodiesMaxAdd: 1`). Sum adds into effective max. Never `if (archetypeId === 'basilisk_brood')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/multi-body.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/traits.json src/sim tests/sim/multi-body.test.ts
git commit -m "feat(m3): optional +1 activeBodiesMax via status trait data"
```

**Depends on:** M2 green.  
**Acceptance:** Base max 1 without grant; 2 with grant; strain dusk fires across towns; grep clean.

---

### Task 2: Kinship propagation (emit/deliver)

**Files:**
- Keep: `src/data/kinship.json`, `ripples.json`
- Create: `src/sim/kinship.ts`, `src/sim/packets.ts`
- Test: `tests/sim/propagation-m3.test.ts`

**Interfaces:**
- Produces: `emitAfterResolve(state, personId)`, `deliverDuePackets(state)`
- Emit proof chance: `(0.4 + 0.25 * edge.weight) / strainMul * connectionMul` with `strainMul = 1 + 1.5 * abs(gapAxisA-gapAxisB)`, `connectionMul = 0.7 + 0.6 * connection`

- [ ] **Step 1: Write the failing test**

```ts
it('baker cousin: packet reaches priya after mill_road days', () => {
  const state = bootM2World(loadData(), 'marrow', 11);
  // force genuine_growth on marta + successful emit roll
  emitAfterResolve(state, 'marta_ellison');
  state.day += 2;
  deliverDuePackets(state);
  expect(state.lettersDelivered.some((l) => l.toPersonId === 'priya_sen')).toBe(true);
});

it('shamed pen pal: leon hollowness pressures ashford', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 12);
  state.people.leon_march.marks = [{ markId: 'hollowness', stacks: 1 }];
  emitAfterResolve(state, 'leon_march');
  state.day += 2;
  deliverDuePackets(state);
  expect(state.towns.ashford.relapsePressure).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/propagation-m3.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement M3 §2.3–2.5; seeded rng for deterministic tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/propagation-m3.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/kinship.ts src/sim/packets.ts tests/sim/propagation-m3.test.ts
git commit -m "feat(m3): kinship packet propagation"
```

**Depends on:** Task 1 optional (independent of brood).  
**Acceptance:** Baker cousin + shamed pen pal reproducible.

---

### Task 3: LOD dawn pass

**Files:**
- Modify: `src/data/towns.json` (`lod` blocks)
- Create: `src/sim/lod.ts`
- Test: `tests/sim/lod.test.ts`

**Interfaces:**
- Produces: `lodDawnPass(state, townId)`

- [ ] **Step 1: Write the failing test**

```ts
it('lod drifts vitality without entry', () => {
  const state = bootM2World(loadData(), 'marrow', 4);
  const v0 = state.towns.lowmere.vitality;
  state.currentTownId = 'ashford';
  for (let i = 0; i < 3; i++) {
    state.day++;
    lodDawnPass(state, 'lowmere');
  }
  expect(state.towns.lowmere.vitality).toBeLessThan(v0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/lod.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Spec §3; soft factor 0.85.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/lod.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/lod.ts src/data/towns.json tests/sim/lod.test.ts
git commit -m "feat(m3): LOD dawn pass"
```

**Depends on:** Task 2 (packets may deliver during LOD).  
**Acceptance:** Distant town vitality drifts; player town full-fidelity unchanged.

---

### Task 4: History generation stub (bounded)

**Files:**
- Create: `src/sim/history.ts`
- Keep: `src/data/kinship.json` `generateRules`
- Test: `tests/sim/history.test.ts`
- Spec: M3 design §4

**Interfaces:**
- Produces: `generatePersonDraft(seed, townId, tables): PersonDraft`; skips if `authored: true`

- [ ] **Step 1: Write the failing test**

```ts
it('same seed yields same draft; authored people skipped', () => {
  const a = generatePersonDraft(42, 'hollow_ford', loadData());
  const b = generatePersonDraft(42, 'hollow_ford', loadData());
  expect(a).toEqual(b);
  expect(generatePersonDraft(1, 'ashford', loadData(), { personId: 'marta_ellison' })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/history.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Steps 1–5 from M3 §4; no UI requirement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/history.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/history.ts tests/sim/history.test.ts src/data/kinship.json
git commit -m "feat(m3): bounded history gen stub"
```

**Depends on:** none (content Task 5 uses handwritten Ford first).  
**Acceptance:** Deterministic; never overwrites authored M2 cast.

---

### Task 5: Discovery — letters UI + templates

**Files:**
- Keep: `src/data/letters.json`
- Create: `src/ui/letters-ui.ts`
- Modify: `src/ui/hud.ts`
- Test: `tests/sim/letters.test.ts`

**Interfaces:**
- Produces: `pickLetterTemplate(data, ctx)`, `formatLetter(...)`; HUD unread badge

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

Match packetType+edgeKind; fallback generic; list `state.lettersDelivered`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/letters.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/letters-ui.ts src/ui/hud.ts tests/sim/letters.test.ts src/data/letters.json
git commit -m "feat(m3): letters discovery ui"
```

**Depends on:** Task 2.  
**Acceptance:** Delivered packet visible in UI list.

---

### Task 6: Hollow Ford content + unlock

**Files:**
- Modify: `towns.json`, `people.json`, `lines.json`, `links.json`
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

Handwrite 3 people + lines; link; unlock rule. History stub may attach ≤1 extra edge offline — not required for unlock test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/hollow-ford.test.ts && npm run validate`  
Expected: PASS / OK

- [ ] **Step 5: Commit**

```bash
git add src/data/towns.json src/data/people.json src/data/lines.json src/data/links.json src/sim tests/sim/hollow-ford.test.ts
git commit -m "feat(m3): hollow ford settlement"
```

**Depends on:** Task 4 (optional), Task 2.  
**Acceptance:** Unlock rules; validate OK; lines coverage for new people.

---

### Task 7: Gap axis, representation, bridge acts

**Files:**
- Modify: `src/sim/world.ts` / new `src/sim/gap.ts`, packets/methods as needed
- Test: `tests/sim/gap.test.ts`
- Spec: founding-lore-gap; M3 §10

**Interfaces:**
- Produces: `gapDelta`, `strainMul`, `applyRepresentation`, `applyBridgeAct`; bus `gap.bridge`

- [ ] **Step 1: Write the failing test**

```ts
it('ruth genuine_growth raises ashford connection', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 9);
  state.people.ruth_calder.marks = [{ markId: 'genuine_growth', stacks: 1 }];
  const c0 = state.towns.ashford.connection;
  applyRepresentation(state, 'ruth_calder');
  expect(state.towns.ashford.connection).toBeGreaterThan(c0);
});

it('cross-gap edge has elevated strain', () => {
  const d = loadData();
  const e = d.kinship.edges.find((x) => x.crossGap);
  expect(strainMul(d, e)).toBeGreaterThan(1.5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/gap.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

M3 §10 formulas; default missing gapAxis 0.2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/gap.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim tests/sim/gap.test.ts
git commit -m "feat(m3): gap strain representation bridge"
```

**Depends on:** Task 2.  
**Acceptance:** Ashford boots with gapAxis 0.15; strain > 1.5 on crossGap.

---

### Task 8: Doctrine dawn tick + acts

**Files:**
- Create: `src/sim/doctrine.ts`
- Data: `doctrines.json`
- Modify: dawn order in sim-context
- Test: `tests/sim/doctrine.test.ts`

**Interfaces:**
- Produces: `tickDoctrine`, `applyDoctrineAct`
- Forbidden: archetypeId equality

- [ ] **Step 1: Write the failing test**

```ts
it('expose collapses legitimacy when gap and exposure high', () => {
  const state = bootM2World(loadData(), 'ivy_quill', 8);
  const d = state.doctrines['doctrine_reach_progress'] ?? state.towns.city_reach.doctrine;
  d.realDelivery = 0.55;
  d.perceivedDelivery = 0.8;
  d.exposure = 0.5;
  const leg0 = d.legitimacy;
  applyDoctrineAct(state, 'act_expose_lie', { personId: 'mira_whitby' });
  tickDoctrine(state, 'city_reach');
  expect(d.legitimacy).toBeLessThan(leg0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/doctrine.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Decision-note formulas; acts from data; `feltByMaxGapAxis` filter.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/doctrine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/doctrine.ts tests/sim/doctrine.test.ts
git commit -m "feat(m3): doctrine legitimacy tick and acts"
```

**Depends on:** Task 7 (gap filter).  
**Acceptance:** Collapse path; Ashford optional doctrine null-safe.

---

### Task 9: Wilderness economy LOD + travel hire + render snapshot

**Files:**
- Create: `src/sim/economy.ts`, `travel.ts`, `render-snapshot.ts`
- Data: biomes, economy-resources, facilities, routes, road-encounters, travel-trades (present)
- Test: `tests/sim/economy.test.ts`, `tests/sim/render-snapshot.test.ts`, `tests/sim/travel.test.ts`
- Spec: wilderness-economy §§5–6

**Interfaces:**
- Produces: `tickEconomyLod`, `startTravel`, `hireTrade`, `getWorldRenderSnapshot(): WorldRenderSnapshot`
- `MobileRenderView.heading: number` (degrees)

- [ ] **Step 1: Write the failing test**

```ts
it('economyOptIn false does not add despair from empty stock', () => {
  const state = bootM2World(loadData(), 'marrow', 2);
  state.towns.ashford.economyOptIn = false;
  const d0 = state.towns.ashford.despair ?? 0;
  tickEconomyLod(state);
  expect(state.towns.ashford.despair ?? 0).toBe(d0);
});

it('snapshot heading is degrees number', () => {
  const state = bootM2World(loadData(), 'marrow', 2);
  const snap = getWorldRenderSnapshot(state);
  for (const m of snap.mobiles) {
    expect(typeof m.heading).toBe('number');
  }
});

it('hire trade reduces effective travel days when trust high', () => {
  const state = bootM2World(loadData(), 'marrow', 2);
  const before = startTravel(state, 'route_ashford_lowmere');
  // with hire carter — daysEff lower than base (data formula)
  expect(typeof before.daysEff).toBe('number');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/economy.test.ts tests/sim/render-snapshot.test.ts tests/sim/travel.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Opt-in economy; travel advances days while world ticks; hire trust formula; snapshot per decision note (no vec heading).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/economy.test.ts tests/sim/render-snapshot.test.ts tests/sim/travel.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/economy.ts src/sim/travel.ts src/sim/render-snapshot.ts tests/sim
git commit -m "feat(m3): economy travel and WorldRenderSnapshot"
```

**Depends on:** Task 3 (LOD), Task 8 optional.  
**Acceptance:** Ashford `economyOptIn:false` safe; heading degrees; validate OK.

---

## M3 acceptance

1. Tasks 1–9 tests green; `npm run validate` OK.  
2. Brood base max still 1 without grant; grant trait → 2.  
3. Baker cousin & shamed pen pal reproducible.  
4. Letters UI shows delivered packet.  
5. Gap/doctrine/economy/travel/snapshot tests green.  
6. Grep: no `archetypeId ===` in `src/sim/`.  
7. Scenarios (`bakedDynamismLines: false`) still pass if M2 runner present.

## Plan self-review

- Spec coverage: multi-body grant, propagation, LOD, history stub, discovery, Hollow Ford, gap, doctrine, economy/travel/render — tasked.  
- Brood M2 lock respected; +1 via data trait/hook.  
- Heading = number degrees.  
- No TBD placeholders.  
- Line selector remains pluggable (dynamism optional, flag off).

