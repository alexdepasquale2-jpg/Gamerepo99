# M3 First Playable World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After M2 Fabric, let the player **walk the generated overworld and settlements** as any M2-playable archetype — methods, marks, spark, succession, travel time, roadside encounters, ripples across towns — and pass Probe’s quality gate.

**Architecture:** `createPlaySession` boots `generateWorld(seed)` then player commands move/method/travel; Phaser views read snapshots. Fabric selector/coherence already live. Ashford is one anchor settlement inside the gen, not a bespoke loop.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Probe bots (`createPlaySession`).

**Spec / gate:** Fabric design; `docs/qa/QUALITY_GATE.md`; feel moments may use generated people + anchors.

## Global Constraints

- No archetypeId branches; Brood `activeBodiesMax: 1` unless M4+ grant trait.
- Probe matrix not `API_PENDING`; worth-playing report required.
- Travel advances days while world ticks (reuse wilderness travel data).
- `heading: number` degrees on mobiles.
- Quality > schedule.

---

### Task 1: createPlaySession play mode on generated world

**Files:** Modify `src/sim` session factory; Test: `tests/sim/play-session.test.ts`

**Interfaces:** `createPlaySession({ seed, archetypeId, mode:'play' })` → BotSession + `travel`, `dump`

- [ ] **Step 1: Failing test** — start marrow seed 42; listActions nonempty; snapshot spark > 0; towns ≥ 3  
- [ ] **Step 2:** `npx vitest run tests/sim/play-session.test.ts` FAIL  
- [ ] **Step 3:** Wire gen→sim state; export session  
- [ ] **Step 4:** PASS  
- [ ] **Step 5:** Commit `feat(m3): createPlaySession play mode on generated world`  

**Depends on:** M2 Fabric Tasks E–F.

---

### Task 2: Methods × marks × spark on generated + anchor people

**Files:** methods.ts (done), world bind; Test: `tests/sim/play-methods.test.ts`

- [ ] **Step 1:** Resolve carry on anchor marta (if present) or any generated apathy wound — flameDelta ≠ 0; spark drops  
- [ ] **Steps 2–5:** TDD + commit `feat(m3): method resolve against fabric people`

**Depends on:** Task 1.

---

### Task 3: Travel time + roadside encounters

**Files:** `src/sim/travel.ts`; data routes/encounters; Test: `tests/sim/travel-play.test.ts`

- [ ] **Step 1:** startTravel route; after daysEff world day advanced; maybe encounter bus id  
- [ ] **Steps 2–5:** TDD + commit `feat(m3): travel days and encounters`

**Depends on:** Task 1.

---

### Task 4: Cross-town ripples / packets

**Files:** packets/kinship from fabric edges; Test: `tests/sim/ripple-play.test.ts`

- [ ] **Step 1:** Genuine growth emit → packet delivered along kin edge within link.days  
- [ ] **Steps 2–5:** commit `feat(m3): cross-town ripples on generated kin`

**Depends on:** Task 2.

---

### Task 5: Succession stub on burnout

**Files:** succession; Test: `tests/sim/succession-play.test.ts`

- [ ] **Step 1:** Force spark 0 → succession UI payload exact copy; dependence ×0.5  
- [ ] **Steps 2–5:** commit `feat(m3): succession on fabric run`

**Depends on:** Task 2.

---

### Task 6: Minimal Phaser overworld + town view

**Files:** `src/render/*`, `src/ui/*`; Test: smoke e2e or scene boot test

- [ ] **Step 1:** Boot scene lists towns from session dump; enter settlement; method menu  
- [ ] **Steps 2–5:** commit `feat(m3): phaser walk generated world`

**Depends on:** Tasks 1–3.

---

### Task 7: Probe matrix + quality gate

**Files:** bots harness; reports

- [ ] **Step 1:** Live matrix not API_PENDING; thresholds bands; write `m2-worth-playing.md` (name may become `m3-worth-playing.md`)  
- [ ] **Steps 2–5:** Probe-owned; Forge only ensures session export

**Depends on:** Task 1–6.

---

## M3 acceptance

1. Walk generated world as Marrow/Ivy/Brood.  
2. Travel, encounters, ripples, succession work.  
3. Probe quality gate SHIP or SHIP-WITH-FIXES.  
4. validate + test + build green.  
5. Ashford not required as sole content — anchors optional via seed.

