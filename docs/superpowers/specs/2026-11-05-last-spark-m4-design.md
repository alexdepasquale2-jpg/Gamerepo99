> **REPLAN 2026-11-05 — REMAPPED → new **M4 Living world** / parts of M5.** Succession/generational depth → **M5**; living off-screen + doctrine competition → **M4**. See DESIGN §10.

# Last Spark — M4 Design (LOCKED schedule: Sat Nov 7 midday · ~½ day)

**Depends on:** M3 LOD + multi-body + letters  
**Status:** Spec for compressed schedule — ruthless scope

## Goal

Finish the emotional spine: **full succession/generational play**, deeper **history generation**, **more archetypes from data**, and **relapse arcs** that threaten cleared towns.

## In scope (only)

1. **Full succession / generational play**  
   - Multi-generation run counter UI; predecessor vignette chain (1 line each).  
   - Ember stacking soft-cap; reputation echoes visible on town fear/trust.  
   - `inherited_dependence` decay paths already in data — wire tells in UI if missing.  
   - Quit (`Let it rest`) ends run with neutral summary (never shamed).

2. **History generation depth (bounded)**  
   - On New Run / succession, generate 2–3 relationship edges + 1 wound rumor per person from tables (`src/data/history-tables.json`) — not LLM.  
   - Seeded; must not overwrite handwritten M2 backstories when `authored: true`.

3. **More archetypes from data**  
   - Add **2** playable templates only (e.g. `sister_ember` midwife, `bellamy_mute` bellringer) composed from existing trait/hook vocabulary.  
   - New hooks only if reusable (`cost_sleep_debt`, `refusal_speak` no-op using existing refuse pattern).  
   - Generator weights in `archetypes.json`; pick/roll UI lists M2+M4.

4. **Relapse arcs**  
   - Cleared town can re-stall critical people if vitality drifts &lt; 55 or hollow marks dominate.  
   - Data: `relapseArcs.json` with thresholds + event ids; wire into dawn LOD/full tick.  
   - One UI warning banner: “Ashford’s quiet is coming back.”

## Out of scope

Narrative ending gallery polish (M5), infinite archetypes, multiplayer, voice acting, M5 juice.

## Data additions

| File | Change |
|------|--------|
| `archetypes.json` | +2 archetypes, generator weights |
| `traits.json` / `hooks.json` | only if midwife/mute need new reusable hooks |
| `history-tables.json` | **new** — bond/wound rumor fragments |
| `relapseArcs.json` | **new** — thresholds + effects |
| `events.json` | +2 relapse-flavored events |

## Acceptance (Sat midday)

- Continue through ≥2 successions in one seeded run.  
- New archetypes selectable; still hook-driven.  
- Authored backstories intact; generated history only fills gaps.  
- Cleared town can relapse; banner fires once.  
- `npm test && npm run validate` green.

## Half-day task sketch

1. Succession multi-gen + summary  
2. history-tables + assembler  
3. Two archetypes data + smoke tests  
4. Relapse arcs dawn + banner  
5. Validate/commit

---

## Doctrine competition & collapse cascades (M4)

**Depends on:** M3 §11 doctrine tick.

### Competition
Towns may hold `secondaryDoctrineIds[]`. Each dawn, legitimacy compared; if challenger legitimacy > incumbent + 0.15 for 3 consecutive days → swap leader doctrine (peaceful) unless `control > 0.5` (suppress; +exposure risk).

### Collapse cascade
When legitimacy collapse fires:
1. Local despair pulse.  
2. Emit `relapse_pressure` packets along kin with `relapseMulAdd = 0.1 + gap`.  
3. Cross-gap city doctrines: if collapse in city_reach, village `perceivedDelivery` of any imported city promises −0.1 (representation shock).

### Tests
- Three-day challenger swap without high control.  
- Collapse emits pressure packet to kin town.  
- City collapse reduces ashford perceived for Reach-linked promises.

---

## Wilderness M4 (procgen & mobiles)

**Decision:** wilderness-economy-design.md staging M4.

- Procgen extra route segments between Hollow Ford / new settlements using biome tables.  
- Caravans as `MobileRenderView` agents moving along routes each dawn.  
- Unlock mounts/ferry/smuggler via bonds; highwayman hostile encounters.  
- Extractive receiveShare politics bite doctrine realDelivery for villages.  
- Tests: caravan reaches town; smuggler adds exposure; fast route unlock when bond≥threshold.
