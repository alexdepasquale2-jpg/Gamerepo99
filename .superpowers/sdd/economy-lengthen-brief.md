# Economy lengthen — Probe SHIP-WITH-FIXES (burnoutRate 1.0)

**Priority:** Niblet top (after Task 2, before 2.5D Tasks 3–6)
**Evidence:** docs/qa/reports/m3-worth-playing.md — spark ~65–75 → 0 in 3–10 ticks @ ~14–16/act; no regen path in bot listActions.

## Loom coordination
Loom was pinged for final numbers. Ship this **conservative first pass** now; Loom can retune data later. Do not wait.

## Target numbers (binding for this commit)
### Method sparkCost (methods.json) — ~50% cut
| id | old | new |
|----|-----|-----|
| challenge | 14 | 7 |
| shame | 8 | 4 |
| inspire | 22 | 11 |
| carry_burden | 18 | 9 |
| lie | 10 | 5 |
| emptyInspireSparkSurcharge | 8 | 4 |

### Spark profiles (traits.json sparkProfiles) + player.json defaults
- spark_den_ogre sparkStart: 70 → **85**
- spark_clerk_ink sparkStart: 75 → **88**
- spark_brood_shared sparkStart: 65 → **80**
- player.defaults.sparkStart: 70 → **85**
- recovery_base_dawn value: 8 → **12** (spark-recovery.json)

### Code wiring (required — data alone won’t fix bots)
1. `advanceToDawn` must `runHooks(state, 'dawn', { data, rng })` and clamp spark to sparkMax (from profile/defaults).
2. `listMethodActions` (or play listActions) must also expose:
   - `advance:dawn`, `advance:day`
   - `travel:<routeId>` for each `listRoutesFrom` current town (need routes on state or pass from session)
3. `actMethod` already handles advance:* — add `travel:<routeId>` → `startTravel` (session already has travel(); mirror in act path or listActions that bots call travel separately — Probe wants them in listActions, so actMethod should dispatch travel).
4. Travel lengthen: each travel day should apply dawn recovery hooks OR +8 spark (cap max) so road days aren’t pure time with no regen. Prefer calling the same dawn hook path once per travel day inside startTravel or after each day++.
5. Succession: leave burnoutAt=0; with longer runs succession.open should appear after meaningful play. Add/adjust test that careful low-cost play survives ≥20 acts OR that dawn+halved costs keep spark >0 after 10 kind acts.

## Files likely
- src/data/systems/methods.json
- src/data/people/traits.json
- src/data/systems/player.json
- src/data/hooks/spark-recovery.json
- src/sim/scenario-advance.ts
- src/sim/play-session-act.ts
- src/sim/travel.ts (dawn regen per day)
- src/sim/play-session.ts (wire routes into listActions if needed)
- tests: new tests/sim/economy-lengthen.test.ts and/or extend play-session / travel-play tests

## Leave alone
- Loom dirty/untracked data (travel-trades, road-encounters mods, caravan-*, facility-workers, encounter-density)
- SCHEDULE.xlsx, Prism art, 2.5D Task 3+
- Do not SendToAgent

## Verify
Focused: new economy tests + play-session + methods + travel + succession tests.
Then `npm test` once at commit boundary (budget: full suite at task boundary).
Commit: `fix(m3): lengthen spark economy for playable runs`

## Report
Write `.superpowers/sdd/economy-lengthen-report.md` with SHAs, numbers applied, test counts, concerns.
Return ≤15 lines Status/SHA/tests/concerns/report path.
