# M3 worth playing — Hybrid-C playthrough gate

**Generated:** 2026-11-06 08:28 AM (America/New_York)  
**Candidate HEAD:** `ca882cd` (`refactor(sim): split play-session/travel/scenario into subfolders`)  
**Includes:** `e74452d` (`fix(bots): weight rest/travel in style policy` — kind rest:5 travel:3; weighted-random, not max-only)  
**vs prior:** SHIP-WITH-FIXES @ `1db4736` / report `6e568d9` (burnoutRate 1.0; rest/travel **0/441** picks)  
**Harness:** `connectBotSession()` → `createPlaySession` live; seeds `1,2,3`; maxTicks 200; clean worktree @ `ca882cd`  
**Status:** live matrix **OK** (0× `API_PENDING`, 0× `ERROR`)  
**Skills cited:** `verification-before-completion`, `office-xlsx`

## Verdict
**Call: SHIP-WITH-FIXES**

**Question:** Is this worth playing?  
**Answer:** **Rest/travel finally fire; runs still all die.** Forge’s weighted style policy is real: rest/travel listed every tick and **picked 25/526** (13 rest + 12 travel) vs prior **0/441**. Dominance even surfaces `travel:*` / `advance:day` in a few cells. Ticks **13–31** (mean ~19.5, was ~16); H/R **77/201**. Stuck/bored/dominance clean. But matrix **burnoutRate = 1.0** again (27/27) — Loom needs **&lt; 1.0**. Worth a longer demo, not a shippable journey.

## Live matrix aggregates vs thresholds
| Metric | Threshold / expect | Live @ ca882cd | vs prior @ 1db4736 | Pass? |
|--------|--------------------|----------------|--------------------|-------|
| matrix status | not `API_PENDING` | **OK** (27/27) | OK | yes |
| stuck | `stuckTicks`=10 | **0/27** | 0 | yes |
| boredom | `boredomTicks`=10 | **0/27** | 0 | yes |
| method_dominance | cap 0.65 | **0 breaches** (max ~0.07–0.21) | 0 | yes |
| burnout_rate | Loom &lt; 1.0 | **27/27 = 1.0** | 1.0 | **harsh fail** |
| hollow vs reignited | (observe) | **77 / 201** | 74 / 168 | slight ↑ |
| typical ticks | longer play | **13–31** (mean ~19.5) | 13–20 (~16) | slight ↑ |
| rest/travel listed | exposed | **yes** (dawn/day/travel every listed tick) | yes | yes |
| rest/travel picked | used by bots | **25/526** (13+12) | **0/441** | **fixed** |
| ERROR cells | 0 | **0** | 0 | yes |

## Matrix table (archetype × style × seed)
| Archetype | Style | Seed | Status | Stuck | Bored | Dom max / method | Burn | H/R | Ticks |
|-----------|-------|------|--------|-------|-------|------------------|------|-----|-------|
| marrow | savage | 1 | OK | n | n | 0.10 lie@ruth_calder | Y | 4/8 | 21 |
| marrow | savage | 2 | OK | n | n | 0.15 challenge@ruth_calder | Y | 4/7 | 13 |
| marrow | savage | 3 | OK | n | n | 0.20 shame@elias_boone | Y | 4/6 | 15 |
| marrow | kind | 1 | OK | n | n | 0.10 carry_burden@harold_finch | Y | 3/8 | 31 |
| marrow | kind | 2 | OK | n | n | 0.12 inspire@jonah_pike | Y | 0/9 | 24 |
| marrow | kind | 3 | OK | n | n | 0.15 carry_burden@gen_p_3_0 | Y | 0/9 | 20 |
| marrow | mixed | 1 | OK | n | n | 0.07 travel:route_ashford_city_glare | Y | 5/8 | 27 |
| marrow | mixed | 2 | OK | n | n | 0.13 carry_burden@gen_p_2_1 | Y | 2/8 | 15 |
| marrow | mixed | 3 | OK | n | n | 0.12 lie@gen_p_3_0 | Y | 3/7 | 17 |
| ivy_quill | savage | 1 | OK | n | n | 0.11 lie@ruth_calder | Y | 6/9 | 28 |
| ivy_quill | savage | 2 | OK | n | n | 0.13 challenge@ruth_calder | Y | 4/7 | 15 |
| ivy_quill | savage | 3 | OK | n | n | 0.17 shame@gen_p_3_0 | Y | 4/7 | 18 |
| ivy_quill | kind | 1 | OK | n | n | 0.10 carry_burden@harold_finch | Y | 3/8 | 29 |
| ivy_quill | kind | 2 | OK | n | n | 0.11 inspire@ruth_calder | Y | 0/8 | 18 |
| ivy_quill | kind | 3 | OK | n | n | 0.17 carry_burden@gen_p_3_0 | Y | 0/8 | 18 |
| ivy_quill | mixed | 1 | OK | n | n | 0.07 travel:route_ashford_city_glare | Y | 5/7 | 29 |
| ivy_quill | mixed | 2 | OK | n | n | 0.13 carry_burden@gen_p_2_1 | Y | 2/8 | 15 |
| ivy_quill | mixed | 3 | OK | n | n | 0.11 lie@gen_p_3_0 | Y | 3/7 | 18 |
| basilisk_brood | savage | 1 | OK | n | n | 0.10 lie@ruth_calder | Y | 5/8 | 21 |
| basilisk_brood | savage | 2 | OK | n | n | 0.15 challenge@ruth_calder | Y | 5/6 | 13 |
| basilisk_brood | savage | 3 | OK | n | n | 0.21 shame@elias_boone | Y | 4/7 | 14 |
| basilisk_brood | kind | 1 | OK | n | n | 0.08 advance:day | Y | 2/8 | 26 |
| basilisk_brood | kind | 2 | OK | n | n | 0.13 inspire@ruth_calder | Y | 0/8 | 15 |
| basilisk_brood | kind | 3 | OK | n | n | 0.20 carry_burden@elias_boone | Y | 0/6 | 15 |
| basilisk_brood | mixed | 1 | OK | n | n | 0.09 travel:route_ashford_city_glare | Y | 4/7 | 23 |
| basilisk_brood | mixed | 2 | OK | n | n | 0.14 carry_burden@gen_p_2_1 | Y | 2/7 | 14 |
| basilisk_brood | mixed | 3 | OK | n | n | 0.14 lie@gen_p_3_0 | Y | 3/5 | 14 |

## Feel / style-policy note
- Verified @ `ca882cd` (+`e74452d`): style-policy is weighted-random with rest/travel family weights; `listActions` emits `advance:*` family=`rest`, `travel:*` family=`travel`. Sim folder split did not break the matrix.
- Pick rate ~4.8% rest+travel is enough to prove the policy, **not** enough to keep any of 27 cells alive.

## Special-bar cite
`npx vitest run tests/sim/scenario/special-bar-gen.test.ts` → **6/6 pass** @ `ca882cd`.

## Playwright / manual
**Skipped** (conserve). Prior green @ `c91755e`: `npm run test:e2e:m3` **1/1**.

## Automated truth (this turn @ `ca882cd`)
| Command | Result |
|---------|--------|
| `npx vite-node scripts/run-playthrough-matrix.mts` | **OK** 27/27; burnoutRate **1.0** |
| rest/travel pick probe | **25/526** (13 rest + 12 travel) |
| `npm run test:bots` | **57/57** |
| special-bar | **6/6** |
| `npm run build` | **OK** |
| `npm test` / e2e | **skipped** (conserve; bots+special-bar+build green) |

## Forge / Probe next (not SHIP)
1. **Economy or stronger rest bias until burnoutRate &lt; 1.0** — weights fixed the 0-pick bug; recovery/costs still lose to method spam.  
2. Optional: spark-aware rest boost when spark is low (do not claim SHIP on policy alone).  
3. Re-run this gate **once** after the next economy/policy change.

## Commands
```bash
npx vite-node scripts/run-playthrough-matrix.mts
npm run test:bots
npx vitest run tests/sim/scenario/special-bar-gen.test.ts
npm run build
```
