# M3 First Playable World — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Depends on:** M2 Fabric (`2026-11-05-m2-dynamic-fabric-design.md`) shipped headless  
**Plan:** `plans/m3/index.md`

---

## 1. Context

M2 Fabric produces a seeded world (settlements on the gap axis, kin, doctrines, routes, facilities, anchors). M3 makes that world **playable**: walk overworld and settlements as Marrow / Ivy / Brood; methods × marks × spark; succession; travel time; roadside encounters; cross-town ripples. **Probe quality gate** applies. The old Ashford-only town loop is archived.

**What makes this special** (emergent moments + first 10 minutes) is **re-targeted at a generated world** — anchors (e.g. Marta) may still appear when `includeAnchors: true`, but scenarios/gates must not require Ashford-as-sole-content.

Constraints: no archetypeId branches; Brood `activeBodiesMax: 1`; `createPlaySession` is Probe entry; quality > schedule; free toolchain.

---

## 2. Options

### A — Replay old Ashford scripted loop inside gen  
**−** Contradicts Fabric; Ashford stays special.

### B — Full M4 living systems in M3  
**−** Scope bomb; caravans/doctrine competition belong in M4.

### C — Playable walk on Fabric world + Probe gate + special bar on gen *(recommended)*  
Session boots `generateWorld(seed)`; player moves/methods/travels; Phaser views; Probe matrix + worth-playing; moments use anchors **or** generated people with same systems.

---

## 3. Decision

**Choose C.**

---

## 4. Play loop (binding)

```
createPlaySession({ mode:'play', seed, archetypeId })
  → generateWorld(seed, { includeAnchors: true })
  → assembleInhabitant(archetype)
  → place in starting settlement (anchor town if present else lowest gapAxis village)
  → listActions / act / tick / travel / snapshot / events
```

Travel: days-while-world-ticks; encounters from `road-encounters`; hire optional if data present. Ripples use fabric kin edges. Succession copy unchanged. Render mobiles `heading: number` degrees.

---

## 5. What makes this special (M3 retarget)

| Bar | Old (Ashford script) | M3 (generated world) |
|-----|----------------------|----------------------|
| Memorable moments | Fixed Marta/Ruth/Elias scripts | Same **systems** on anchors if present **or** generated person with matching wound/tags; scenarios pick `personId` from world dump by tag/wound, fallback anchor ids |
| Choices that matter | Method changes state/line | Unchanged — assert via session |
| First 10 minutes | Ashford street beat sheet | Boot → visible settlement → ≤2 min first method choice → ≤4 min first consequence; relationship change nameable by 10 min on **any** seeded world |

Emergent scripts (loaf / chalk / nail / refusal / mark-bite) remain the design targets; Probe seeds prefer worlds that include bakery-like site + child-tagged person + forge-like site when anchors on.

---

## 6. Out of M3

Off-screen economy LOD tick, caravan mobiles, doctrine competition cascades, letter UI at scale → **M4**. Hoarder/async/generational → **M5**. Dual Brood active → trait grant **M4+**.

---

## 7. Acceptance

1. Walk gen world as all three archetypes.  
2. Travel, encounters, ripples, succession work.  
3. Probe gate: live matrix + worth-playing (SHIP / SHIP-WITH-FIXES / NO-SHIP).  
4. Special bar: ≥3 moment paths + first-10-min timings on seeded gen world.  
5. validate/test/build green; no archetype branches; Brood max 1.

