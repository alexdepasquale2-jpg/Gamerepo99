# M3 worth playing — Hybrid-C playthrough gate

**Generated:** 2026-11-06 08:07 AM (America/New_York)  
**Candidate HEAD:** `1db4736` (`fix(m3): travel days net +2 spark per Loom pacing`)  
**Stack under tip:** `1db4736` ← `78536ee` economy lengthen; prior gate `SHIP-WITH-FIXES` @ `c91755e` / report commit `3c75130`. Verified against `1db4736` via clean worktree (not Prism tip `8105206`).  
**Harness:** `connectBotSession()` → `createPlaySession` live; seeds `1,2,3`; maxTicks 200  
**Status:** live matrix **OK** (0× `API_PENDING`, 0× `ERROR`)  
**Skills cited:** `using-superpowers`, `verification-before-completion`, `office-xlsx`

## Verdict
**Call: SHIP-WITH-FIXES**

**Question:** Is this worth playing?  
**Answer:** **Longer fuse, still not a journey.** Forge’s lengthen is real (costs 6/4/4/4/5, sparkStarts 88/90/85, dawn/travel recovery, succession ≤20): typical ticks rose ~3–10 → **13–20** (mean ~16), hollow/reignite **74/168** (was 43/95). Stuck/bored/dominance still clean. But matrix **burnoutRate = 1.0** again (27/27) — Loom wanted **&lt; 1.0**. Root cause this pass: `listActions` **does** expose `advance:dawn` / `advance:day` (family `rest`) and `travel:<routeId>` every tick, yet style policies only pick max-weight savage/kind/mixed methods (rest/travel weight default 1 → **0/441 picks**). Economy alone can’t clear the gate while bots never rest or travel.

## Live matrix aggregates vs thresholds
| Metric | Threshold / expect | Live @ 1db4736 | vs prior @ c91755e | Pass? |
|--------|--------------------|----------------|--------------------|-------|
| matrix status | not `API_PENDING` | **OK** (27/27) | OK | yes |
| stuck | `stuckTicks`=10 | **0/27** | 0 | yes |
| boredom | `boredomTicks`=10 | **0/27** | 0 | yes |
| method_dominance | cap 0.65 | **0 breaches** (max ~0.10–0.27) | 0 | yes |
| burnout_rate | Loom &lt; 1.0 | **27/27 = 1.0** | was 1.0 | **harsh fail** |
| hollow vs reignited | (observe) | **74 / 168** | 43 / 95 | moves ↑ |
| typical ticks | longer play | **13–20** (mean ~16.3) | ~3–10 | improved |
| rest/travel listed | exposed | **yes** (dawn/day/travel every tick) | no | yes |
| rest/travel picked | used by bots | **0/441** | n/a | **fail** |
| ERROR cells | 0 | **0** | 0 | yes |

## Matrix table (archetype × style × seed)
| Archetype | Style | Seed | Status | Stuck | Bored | Dom max / method | Burn | H/R | Ticks |
|-----------|-------|------|--------|-------|-------|------------------|------|-----|-------|
| marrow | savage | 1 | OK | n | n | 0.20 lie@gen_p_1_2 | Y | 5/5 | 15 |
| marrow | savage | 2 | OK | n | n | 0.14 challenge@gen_p_2_1 | Y | 5/7 | 14 |
| marrow | savage | 3 | OK | n | n | 0.20 challenge@elias_boone | Y | 4/6 | 15 |
| marrow | kind | 1 | OK | n | n | 0.15 carry_burden@gen_p_1_2 | Y | 0/8 | 20 |
| marrow | kind | 2 | OK | n | n | 0.10 carry_burden@harold_finch | Y | 0/8 | 20 |
| marrow | kind | 3 | OK | n | n | 0.21 inspire@elias_boone | Y | 0/6 | 19 |
| marrow | mixed | 1 | OK | n | n | 0.11 lie@gen_p_1_2 | Y | 2/7 | 18 |
| marrow | mixed | 2 | OK | n | n | 0.13 challenge@gen_p_2_1 | Y | 5/6 | 15 |
| marrow | mixed | 3 | OK | n | n | 0.19 shame@elias_boone | Y | 3/6 | 16 |
| ivy_quill | savage | 1 | OK | n | n | 0.16 lie@gen_p_1_2 | Y | 5/6 | 19 |
| ivy_quill | savage | 2 | OK | n | n | 0.12 challenge@gen_p_2_1 | Y | 5/7 | 16 |
| ivy_quill | savage | 3 | OK | n | n | 0.17 challenge@elias_boone | Y | 5/6 | 18 |
| ivy_quill | kind | 1 | OK | n | n | 0.17 carry_burden@gen_p_1_2 | Y | 0/8 | 18 |
| ivy_quill | kind | 2 | OK | n | n | 0.11 carry_burden@harold_finch | Y | 0/7 | 18 |
| ivy_quill | kind | 3 | OK | n | n | 0.22 inspire@elias_boone | Y | 0/6 | 18 |
| ivy_quill | mixed | 1 | OK | n | n | 0.11 lie@gen_p_1_2 | Y | 2/7 | 19 |
| ivy_quill | mixed | 2 | OK | n | n | 0.12 challenge@gen_p_2_1 | Y | 5/7 | 17 |
| ivy_quill | mixed | 3 | OK | n | n | 0.17 shame@elias_boone | Y | 5/6 | 18 |
| basilisk_brood | savage | 1 | OK | n | n | 0.21 lie@gen_p_1_2 | Y | 5/4 | 14 |
| basilisk_brood | savage | 2 | OK | n | n | 0.15 challenge@gen_p_2_1 | Y | 6/6 | 13 |
| basilisk_brood | savage | 3 | OK | n | n | 0.21 challenge@elias_boone | Y | 4/5 | 14 |
| basilisk_brood | kind | 1 | OK | n | n | 0.20 carry_burden@gen_p_1_2 | Y | 0/7 | 15 |
| basilisk_brood | kind | 2 | OK | n | n | 0.13 carry_burden@harold_finch | Y | 0/7 | 15 |
| basilisk_brood | kind | 3 | OK | n | n | 0.27 inspire@elias_boone | Y | 0/5 | 15 |
| basilisk_brood | mixed | 1 | OK | n | n | 0.14 lie@gen_p_1_2 | Y | 2/5 | 14 |
| basilisk_brood | mixed | 2 | OK | n | n | 0.14 challenge@gen_p_2_1 | Y | 4/6 | 14 |
| basilisk_brood | mixed | 3 | OK | n | n | 0.21 shame@elias_boone | Y | 2/4 | 14 |

## Feel / style-policy note (harsh)
- Forge claims verified in data/code at `1db4736`: method sparkCosts 6/4/4/4/5; sparkStarts 88/90/85 (+ player 88); `advance:dawn`/`advance:day`/`travel:*` in `listActions`; succession at `emberZoneBelow` ≤20.
- Rest/travel **appear** every tick; bots **never** pick them (`tests/bots/style-policy.ts` weights only savage/kind/mixed/noop — rest/travel fall to weight 1 and lose to preferred family 10).
- So burnoutRate 1.0 here is a **gate finding** (bot weighting / action preference), not proof the lengthen did nothing. Runs are ~2× longer; still always die without rest.

## Special-bar cite
`npx vitest run tests/scenarios/special-bar-gen.test.ts` → **6/6 pass** @ `1db4736`.

## Playwright / manual
**Skipped this re-run** (conserve). Prior green @ `c91755e`: `npm run test:e2e:m3` **1/1**.

## Automated truth (this turn @ `1db4736`)
| Command | Result |
|---------|--------|
| `npx vite-node scripts/run-playthrough-matrix.mts` | **OK** 27/27; burnoutRate **1.0** |
| `npm run test:bots` | **54/54** |
| `npm test` | **248/248** |
| `npm run build` | **OK** |
| special-bar | **6/6** |
| `npm run test:e2e:m3` | **skipped** (prior 1/1 @ c91755e) |

## Forge / Probe next (not SHIP)
1. **Style policy (or economy that survives method-only play):** weight `rest`/`travel` so kind/mixed sometimes dawn/travel — or cut costs / raise recovery until method-spam burnoutRate &lt; 1.0.  
2. Confirm succession fires in matrix when spark ≤20 (offer reachable before hard zero).  
3. Re-run this gate once after either fix — do not claim SHIP while burnoutRate stays 1.0.

## Commands
```bash
npx vite-node scripts/run-playthrough-matrix.mts
npm run test:bots
npx vitest run tests/scenarios/special-bar-gen.test.ts
npm test && npm run build
```
