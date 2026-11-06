# M3 worth playing — Hybrid-C playthrough gate

**Generated:** 2026-11-06 07:58 AM (America/New_York)  
**Candidate HEAD:** `c91755e` (`feat(prism): v3 world target + baked sprite sheets for Forge`)  
**Harness:** `connectBotSession()` → `createPlaySession` live; seeds `1,2,3`; maxTicks 200  
**Status:** live matrix **OK** (0× `API_PENDING`, 0× `ERROR`)  
**Skills cited:** `using-superpowers`, `verification-before-completion` (fresh matrix / test:bots / npm test / build / special-bar / e2e:m3 this turn)

## Verdict
**Call: SHIP-WITH-FIXES**

**Question:** Is this worth playing?  
**Answer:** **Almost — playable shell is real, but every bot run is a ~3–10 tick spark fuse.** Methods change state, hollow/reignite counters move, special-bar moments land, overworld boots. Stuck/boredom/dominance are clean. Still not a journey you’d sit with: spark ~65–75 burns to ≤0 in a handful of acts even on careful kind play; matrix **burnoutRate = 1.0** across all 27 cells. Fix the economy (or give rest/travel/regen paths bots can use) before calling M3 “worth playing” without asterisks.

## Live matrix aggregates vs thresholds
| Metric | Threshold / expect | Live | Pass? |
|--------|--------------------|------|-------|
| matrix status | not `API_PENDING` | **OK** (27/27) | yes |
| stuck | `stuckTicks`=10 | **0/27** (rate 0) | yes |
| boredom | `boredomTicks`=10 | **0/27** (rate 0) | yes |
| method_dominance | cap 0.65 | **0 breaches** (max pick ~0.11–0.50) | yes |
| burnout_rate | (observe) | **27/27 = 1.0** | **harsh fail** |
| hollow vs reignited | (observe) | **43 hollow / 95 reignited** | moves |
| ERROR cells | 0 | **0** | yes |

## Matrix table (archetype × style × seed)
| Archetype | Style | Seed | Status | Stuck | Bored | Dom max / method | Burn | H/R | Ticks |
|-----------|-------|------|--------|-------|-------|------------------|------|-----|-------|
| marrow | savage | 1 | OK | n | n | 0.25 shame@clara_whitby | Y | 4/5 | 8 |
| marrow | savage | 2 | OK | n | n | 0.12 shame@gen_p_2_0 | Y | 4/6 | 8 |
| marrow | savage | 3 | OK | n | n | 0.29 challenge@elias_boone | Y | 3/3 | 7 |
| marrow | kind | 1 | OK | n | n | 0.25 carry_burden@clara_whitby | Y | 0/3 | 4 |
| marrow | kind | 2 | OK | n | n | 0.40 carry_burden@harold_finch | Y | 0/4 | 5 |
| marrow | kind | 3 | OK | n | n | 0.25 inspire@gen_p_3_0 | Y | 0/3 | 4 |
| marrow | mixed | 1 | OK | n | n | 0.20 carry_burden@clara_whitby | Y | 0/4 | 5 |
| marrow | mixed | 2 | OK | n | n | 0.17 carry_burden@gen_p_2_0 | Y | 2/4 | 6 |
| marrow | mixed | 3 | OK | n | n | 0.20 inspire@gen_p_3_0 | Y | 1/2 | 5 |
| ivy_quill | savage | 1 | OK | n | n | 0.30 lie@gen_p_1_2 | Y | 5/5 | 10 |
| ivy_quill | savage | 2 | OK | n | n | 0.11 shame@gen_p_2_0 | Y | 4/6 | 9 |
| ivy_quill | savage | 3 | OK | n | n | 0.20 challenge@elias_boone | Y | 4/4 | 10 |
| ivy_quill | kind | 1 | OK | n | n | 0.25 carry_burden@clara_whitby | Y | 0/3 | 4 |
| ivy_quill | kind | 2 | OK | n | n | 0.50 carry_burden@harold_finch | Y | 0/2 | 4 |
| ivy_quill | kind | 3 | OK | n | n | 0.25 inspire@gen_p_3_0 | Y | 0/3 | 4 |
| ivy_quill | mixed | 1 | OK | n | n | 0.20 carry_burden@clara_whitby | Y | 0/4 | 5 |
| ivy_quill | mixed | 2 | OK | n | n | 0.17 carry_burden@gen_p_2_0 | Y | 2/5 | 6 |
| ivy_quill | mixed | 3 | OK | n | n | 0.17 inspire@gen_p_3_0 | Y | 2/3 | 6 |
| basilisk_brood | savage | 1 | OK | n | n | 0.29 shame@clara_whitby | Y | 3/2 | 7 |
| basilisk_brood | savage | 2 | OK | n | n | 0.14 shame@gen_p_2_0 | Y | 4/4 | 7 |
| basilisk_brood | savage | 3 | OK | n | n | 0.33 challenge@elias_boone | Y | 2/3 | 6 |
| basilisk_brood | kind | 1 | OK | n | n | 0.25 carry_burden@clara_whitby | Y | 0/3 | 4 |
| basilisk_brood | kind | 2 | OK | n | n | 0.50 carry_burden@harold_finch | Y | 0/3 | 4 |
| basilisk_brood | kind | 3 | OK | n | n | 0.33 inspire@gen_p_3_0 | Y | 0/2 | 3 |
| basilisk_brood | mixed | 1 | OK | n | n | 0.20 carry_burden@clara_whitby | Y | 0/4 | 5 |
| basilisk_brood | mixed | 2 | OK | n | n | 0.20 carry_burden@gen_p_2_0 | Y | 2/3 | 5 |
| basilisk_brood | mixed | 3 | OK | n | n | 0.25 inspire@gen_p_3_0 | Y | 1/2 | 4 |

## Feel pass (harsh)
- `listActions()` ~45 meaningful (savage+kind families); not empty/noop.
- Fingerprints advance; reignite/hollow fire; `townCount` 6 on snapshots.
- Naive + careful kind play still burn by tick ~5 (spark 70→0 at ~14–16/act). No rest/travel regen in bot path.
- Samey short fuse every cell → not yet a medium-length playthrough.

## Special-bar cite
`npx vitest run tests/scenarios/special-bar-gen.test.ts` → **6/6 pass**.  
Seeds in file: **7, 42, 99, 11, 13, 21**. Aggregate check: ≥3/5 memorable moments green (`moment_warm_loaf_cold_hill`, `moment_refusal_coal`, `moment_mark_comes_back`, `moment_chalk_after_the_cut`, `moment_nail_across_the_water`).

## Playwright / manual
`npm run test:e2e:m3` → **1/1 pass** (`m3-overworld-smoke`: boots overworld canvas, no console errors, Enter nearest town). Artifact dir `tests/e2e/artifacts/` (`m3-boot.json`, `m3-console.json`). UI unit: `tests/ui/play-boot.test.ts` asserts ≥3 towns from dump.

## Automated truth (this turn @ `c91755e`)
| Command | Result |
|---------|--------|
| `npm run test:bots` | **54/54** |
| `npm test` | **234/234** |
| `npm run build` | **OK** |
| special-bar | **6/6** |
| `npm run test:e2e:m3` | **1/1** |

## Blockers / polish for Forge
1. **Spark economy** — sessions die in ≤10 ticks always; lower method costs, add rest/regen/travel recovery, or succession before total burn.  
2. Expose travel/advance actions in bot-visible `listActions` if they should extend play.  
3. Optional: succession path should be reachable inside a normal playthrough length.

## Feel-tmp
`scripts/_probe-feel-tmp.mts` **absent at tip** — leave deleted; do not recreate.

## Commands
```bash
npx vite-node scripts/run-playthrough-matrix.mts
npm run test:bots
npx vitest run tests/scenarios/special-bar-gen.test.ts
npm test && npm run build && npm run test:e2e:m3
```
