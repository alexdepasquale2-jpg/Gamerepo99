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

