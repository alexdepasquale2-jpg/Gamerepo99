# Economy lengthen report — Probe M3 SHIP-WITH-FIXES

**Date:** 2026-11-06 (America/New_York)  
**Skills:** using-superpowers, test-driven-development, verification-before-completion  
**Base:** `c7c36ed` (Task 2 + Loom road spec)  
**Commit message:** `fix(m3): lengthen spark economy for playable runs`

## Numbers applied (Loom SoT: docs/superpowers/specs/2026-11-06-spark-pacing-balance.md)

| Field | New |
|-------|----:|
| challenge / shame / inspire / carry_burden / lie sparkCost | 6 / 4 / 4 / 4 / 5 |
| emptyInspireSparkSurcharge | 4 |
| spark_den_ogre / clerk_ink / brood_shared sparkStart | 88 / 90 / 85 |
| player.defaults.sparkStart | 88 |
| recovery_base_dawn / recovery_den_hearth | +12 / +10 |
| cost_town_despair | −1 |

## Code wiring

1. `advanceToDawn` → `runHooks('dawn')` + clamp to sparkMax  
2. `listMethodActions` exposes `advance:dawn`, `advance:day`, `travel:<routeId>`  
3. `actMethod` dispatches `travel:<routeId>` → `startTravel`  
4. Travel days call `advanceToDawn` (dawn regen per road day)  
5. `maybeOpenSuccession` opens at `emberZoneBelow` (≤20); `burnoutAt` stays 0

## Tests

- New: `tests/sim/economy-lengthen.test.ts` (9)  
- Adjusted: `inhabitant.test.ts`, `methods.test.ts` (hardcoded sparkStart)  
- `npm test`: **248/248** pass

## Concerns

- Bots may still ignore rest/travel until policy picks `advance:*` / `travel:*` (now in listActions).  
- Travel regen uses full dawn hooks (stronger than Loom’s suggested +2/day); retunable.  
- Succession-at-20 ends runs earlier than hard zero; matrix burnout_rate should drop via longer pre-ember play + regen, not via delaying the offer.  
- Did not start 2.5D Task 3; Loom/Prism dirty files left unstaged.
