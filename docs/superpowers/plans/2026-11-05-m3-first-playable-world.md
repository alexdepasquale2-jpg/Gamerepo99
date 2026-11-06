# M3 First Playable World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M2 Fabric, ship a **playable walk** of the generated overworld and settlements as any playable archetype — methods, marks, spark, succession, travel time, roadside encounters, cross-town ripples — and pass Probe’s quality gate with the **What makes this special** bar re-targeted at a generated world.

**Architecture:** `createPlaySession({ mode:'play', seed, archetypeId })` boots `generateWorld` into sim state; Phaser/ui read snapshots and send commands. Fabric line selector and coherence already exist. Ashford is an optional anchor settlement, not a bespoke loop.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Probe `tests/bots` + `createPlaySession`.

**Spec:** `docs/superpowers/specs/2026-11-05-m3-first-playable-world-design.md`  
**Gate:** `docs/qa/QUALITY_GATE.md`

## Global Constraints

- No `archetypeId ===` in `src/sim/`.
- Brood `activeBodiesMax: 1` (595d722); no dual-active in M3.
- Travel advances calendar days while world ticks; `MobileRenderView.heading` is `number` degrees (0 north, 90 east).
- Dialogue from `line-fragments` (canonical); do not revive `lines.json` as source of truth.
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

### Task 1: createPlaySession play mode on generated world

**Files:**
- Create: `src/sim/play-session.ts`
- Modify: `src/sim/index.ts` exports
- Test: `tests/sim/play-session.test.ts`

**Interfaces:**
- Consumes: `generateWorld`, `assembleInhabitant`, `createRng`, Fabric dump
- Produces:

```ts
createPlaySession(opts: {
  mode: 'play' | 'inspect';
  seed: number;
  archetypeId?: string;
}): PlaySession;

type PlaySession = {
  start(opts?: { seed?: number; archetypeId?: string }): void;
  listActions(): { id: string; family?: string }[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): {
    tick: number; day: number; spark: number; burnedOut: boolean;
    townId: string; townCount: number; fingerprint: string;
    reignitedCount: number; hollowCount: number;
  };
  events(): { type: string; methodId?: string }[];
  travel?(routeId: string): void;
  dump(): string;
};
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';

describe('createPlaySession play', () => {
  it('boots generated world for marrow seed 42', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    s.start();
    const snap = s.snapshot();
    expect(snap.spark).toBeGreaterThan(0);
    expect(snap.burnedOut).toBe(false);
    expect(snap.townCount).toBeGreaterThanOrEqual(3);
    expect(s.listActions().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/play-session.test.ts`  
Expected: FAIL (export missing or mode unimplemented)

- [ ] **Step 3: Write minimal implementation**

`generateWorld(seed, { includeAnchors: true })` → bind people/towns into `SimState`; place player in anchor town if any else first village; implement BotSession surface.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/play-session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/play-session.ts src/sim/index.ts tests/sim/play-session.test.ts
git commit -m "feat(m3): createPlaySession play mode on generated world"
```

**Depends on:** M2 Fabric Tasks E–F.  
**Acceptance:** Probe `connectBotSession()` no longer null when this export lands.

---

### Task 2: Methods × marks × spark on fabric people

**Files:**
- Modify: `src/sim/play-session.ts` `act` → `commitMethod`
- Keep: `src/sim/methods.ts` + `setReactionLineSelector`
- Test: `tests/sim/play-methods.test.ts`

**Interfaces:**
- Consumes: `commitMethod` / method resolve from Task 6
- Action ids: `methodId@personId` (same as scenarios README)

- [ ] **Step 1: Write the failing test**

```ts
it('resolving a method changes spark and person flame or marks', () => {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
  s.start();
  const before = s.snapshot().spark;
  const actions = s.listActions().filter((a) => a.id.includes('@'));
  expect(actions.length).toBeGreaterThan(0);
  s.act(actions[0].id);
  const after = s.snapshot();
  expect(after.spark).not.toBe(before);
  expect(s.events().some((e) => e.type === 'spark.spend' || e.methodId)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/play-methods.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Parse `methodId@personId`; call method resolve; emit juice events; reaction via fabric selector.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/play-methods.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/play-session.ts tests/sim/play-methods.test.ts
git commit -m "feat(m3): method resolve against fabric people"
```

**Depends on:** Task 1.  
**Acceptance:** Works on generated people and anchors alike.

---

### Task 3: Travel time + roadside encounters

**Files:**
- Create: `src/sim/travel.ts` (if absent)
- Data: `world/routes.json`, `world/road-encounters.json` (or flat)
- Test: `tests/sim/travel-play.test.ts`

**Interfaces:**
- Produces: `startTravel(state, routeId): { daysEff: number }`; session `travel(routeId)`

- [ ] **Step 1: Write the failing test**

```ts
it('travel advances day by daysEff and may emit encounter', () => {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
  s.start();
  const day0 = s.snapshot().day;
  const routes = listRoutesFrom(s.snapshot().townId); // helper from session dump/state
  expect(routes.length).toBeGreaterThan(0);
  s.travel!(routes[0]);
  expect(s.snapshot().day).toBeGreaterThanOrEqual(day0 + 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/travel-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Advance day/ticks by route days; roll encounter table; bus `encounter.spawn` / `route.travel_step`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/travel-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/travel.ts src/sim/play-session.ts tests/sim/travel-play.test.ts
git commit -m "feat(m3): travel days and roadside encounters"
```

**Depends on:** Task 1.  
**Acceptance:** World continues ticking during travel (LOD/despair hooks may no-op if economy off).

---

### Task 4: Cross-town ripples on generated kin

**Files:**
- Create/modify: `src/sim/packets.ts`, kinship helpers from Fabric
- Test: `tests/sim/ripple-play.test.ts`

**Interfaces:**
- Produces: emit after genuine_growth / hollowness; deliver after link.days

- [ ] **Step 1: Write the failing test**

```ts
it('genuine_growth can emit packet that delivers along a kin edge', () => {
  const s = createPlaySession({ mode: 'play', seed: 11, archetypeId: 'marrow' });
  s.start();
  // force or find person with kin edge; apply method that yields genuine_growth
  const target = findPersonWithKin(s);
  s.act(`challenge@${target}`);
  // advance days enough for link
  for (let i = 0; i < 5; i++) s.tick();
  expect(s.events().some((e) => e.type === 'packet.emit' || e.type === 'packet.deliver')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/ripple-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Wire Fabric kinship edges into emit/deliver; bus ids `packet.emit` / deliver toast.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/ripple-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/packets.ts src/sim tests/sim/ripple-play.test.ts
git commit -m "feat(m3): cross-town ripples on generated kin"
```

**Depends on:** Task 2.  
**Acceptance:** Seed 11 (or documented seed) reproducible.

---

### Task 5: Succession stub on burnout

**Files:**
- Create: `src/sim/succession.ts`
- Test: `tests/sim/succession-play.test.ts`

**Interfaces:**
- Produces: succession payload with exact copy strings from `archetypes.json` succession.ui

- [ ] **Step 1: Write the failing test**

```ts
it('burnout opens succession with locked copy', () => {
  const s = createPlaySession({ mode: 'play', seed: 3, archetypeId: 'ivy_quill' });
  s.start();
  forceSpark(s, 0);
  s.tick();
  expect(s.snapshot().burnedOut).toBe(true);
  expect(s.events().some((e) => e.type === 'succession.open')).toBe(true);
  const ui = getSuccessionUi(s);
  expect(ui.screenCopy).toBe('Your fire went out. Someone remembers it.');
  expect(ui.buttons.continue).toBe('Carry it on');
  expect(ui.buttons.quit).toBe('Let it rest');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/succession-play.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

On spark ≤ burnoutAt emit succession; dependence weight ×0.5 when scoring bonds.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/succession-play.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sim/succession.ts tests/sim/succession-play.test.ts
git commit -m "feat(m3): succession stub on fabric run"
```

**Depends on:** Task 2.  
**Acceptance:** Quit never shamed.

---

### Task 6: Minimal Phaser overworld + town view

**Files:**
- Create/modify: `src/render/overworld-scene.ts`, `src/render/town-scene.ts`, `src/ui/hud.ts`, `src/ui/method-menu.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/play-boot.test.ts` or e2e smoke

**Interfaces:**
- Consumes: `getWorldRenderSnapshot(state)` if present; else town list from session dump

- [ ] **Step 1: Write the failing test**

```ts
it('boot exposes overworld town markers from session', async () => {
  // headless: createPlaySession dump parsed by a pure helper used by scene
  const towns = townsFromDump(createPlaySession({ mode: 'inspect', seed: 42 }).dump());
  expect(towns.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/play-boot.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Colored rects OK (32px); enter settlement → method menu; spark lerp on spend.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ui/play-boot.test.ts && npm run build`  
Expected: PASS / build OK

- [ ] **Step 5: Commit**

```bash
git add src/render src/ui src/main.ts tests/ui
git commit -m "feat(m3): phaser walk generated overworld and town"
```

**Depends on:** Tasks 1–3.  
**Acceptance:** Manual/Playwright: boot → see ≥3 towns → enter one → commit method.

---

### Task 7: What makes this special — retargeted scenarios on generated world

**Files:**
- Modify: `src/data/scenarios.json` (or `systems/scenarios.json`) — add `worldSeed` + `resolvePerson` by tag/wound
- Modify: `tests/scenarios/README.md`; create `tests/scenarios/special-bar-gen.test.ts`
- Spec: M3 design §5

**Interfaces:**
- Person resolution: `{ preferAnchorId?, woundId?, tagsAny? }` → personId from generated world

- [ ] **Step 1: Write the failing test**

```ts
it('warm-loaf path finds bakery-capable person on seed with anchors', () => {
  const s = createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' });
  s.start();
  const personId = resolveScenarioPerson(s, {
    preferAnchorId: 'marta_ellison',
    siteKind: 'bakery',
    woundId: 'apathy',
  });
  expect(personId).toBeTruthy();
  s.act(`carry_burden@${personId}`);
  // advance to dusk…
  expect(s.events().some((e) => e.type === 'site.kindle' || e.type === 'spark.spend')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scenarios/special-bar-gen.test.ts`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Resolver + dusk advance helpers; ≥3 of 5 moments implementable; first-10-min metrics flags on session.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scenarios/special-bar-gen.test.ts`  
Expected: PASS (≥3 moments)

- [ ] **Step 5: Commit**

```bash
git add src/data/scenarios.json tests/scenarios src/sim
git commit -m "feat(m3): special-bar scenarios on generated world"
```

**Depends on:** Tasks 2, 5.  
**Acceptance:** Moments do not hard-require sole Ashford loop; anchors preferred when present.

---

### Task 8: Probe quality gate

**Files:**
- `tests/bots/*` (Probe); Forge ensures export
- Create: `docs/qa/reports/m3-worth-playing.md` (Probe writes)

**Interfaces:**
- Live `connectBotSession()` → matrix; thresholds in `tests/bots/thresholds.json`

- [ ] **Step 1: Failing check** — matrix not `API_PENDING`

```bash
npm run test:bots
# expect cells with real metrics, not API_PENDING
```

- [ ] **Step 2:** If API_PENDING → Task 1 incomplete; stop

- [ ] **Step 3:** Probe fills matrix + worth-playing verdict (SHIP / SHIP-WITH-FIXES / NO-SHIP)

- [ ] **Step 4:** Cite special-bar seeds + one Playwright/manual note

- [ ] **Step 5:** Probe handoff to Niblet (Forge does not fake SHIP)

**Depends on:** Tasks 1–7.  
**Acceptance:** Per `QUALITY_GATE.md`.

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

