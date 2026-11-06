# M3 worth playing — Hybrid-C playthrough gate

**Generated:** 2026-11-06 10:30 AM (America/New_York)  
**Candidate HEAD:** `126b8a6` (`docs(schedule): M2/M3 done, M4 started`)  
**Interaction SHIP baseline:** `ddd546f` (interactionCompat default-ON) + `2a912b1` (special-bar/ripple juice bridge)  
**Loom strain retune:** `04c7421` (`data(interactions): Loom middle-ground pacing retune (burnout ~0.074)`)  
**Render tip under e2e:** includes `c58142c` / `6379017` prism density (uniform artScale 2, CC0/town-palette trees, meadow density)  
**vs prior Probe SHIP:** `ddd546f` burnoutRate **≈0.111** (3/27); this follow-up **≈0.074** (2/27) after Loom retune — still in Niblet **5–15%** band  
**Harness:** `connectBotSession()` → `createPlaySession` live; interactionCompat always ON; seeds `1,2,3`; maxTicks 200  
**Status:** live matrix **OK** (0× `API_PENDING`, 0× `ERROR`)  
**Skills cited:** `verification-before-completion`, `office-xlsx`

## Verdict
**Call: SHIP** (unchanged — post-SHIP follow-up confirms; **no re-HOLD**)

**Question:** Is this worth playing?  
**Answer:** **Yes.** Default-ON interaction + juice bridge still lands a journey. Loom middle-ground retune trims burnout to **≈0.074** (2/27) inside the **5–15%** target. Stuck/bored/dominance clean. Hollow/reignite **193 / 234**. Evidence modes now cover **packet.emit / packet.deliver** and **refusal.coal_flicker** with **spark.spend = 0**. e2e green on prism density tip. Basilisk×savage remains an **open risk** (2/3 burn) — **not a re-HOLD**.

## Live matrix aggregates vs thresholds
| Metric | Threshold / expect | Live @ 126b8a6 (+Loom 04c7421) | vs ddd546f SHIP | Pass? |
|--------|--------------------|--------------------------------|-----------------|-------|
| matrix status | not `API_PENDING` | **OK** (27/27) | OK | yes |
| stuck | `stuckTicks`=10 | **0/27** | 0 | yes |
| boredom | `boredomTicks`=10 | **0/27** | 0 | yes |
| method_dominance | cap 0.65 | **0 breaches** (max ~0.04–0.09) | 0 | yes |
| burnout_rate | Loom prefer **5–15%** (0.05–0.15); bar &lt;1.0 | **2/27 ≈ 0.074** | ≈0.111 | **yes** |
| hollow vs reignited | prefer both &gt; 0 | **193 / 234** | 190 / 231 | **yes** |
| typical ticks | longer play | **47–200** (25×200; 2 burns) | 46–200 | **yes** |
| ERROR cells | 0 | **0** | 0 | yes |

## Interaction evidence (`scripts/m3-interaction-evidence.mts --mode all`)
| Signal | Result @ 126b8a6 |
|--------|------------------|
| status | **OK**; modes kindle+packet+refusal all ok |
| `sparkSpendCount` | **0** |
| coverage | `packetEmit` **true**, `packetDeliver` **true**, `refusalCoalFlicker` **true**, `siteKindle` **true**, `markApplied` **true**, `interaction` **true** |
| kindle | connectBotSession short inspire/advance/travel (seed 42) — interaction/kindle/marks |
| packet | createPlaySession seed 11; kin-edge inspire (ripple-play mirror) → emit+deliver |
| refusal | createPlaySession seed 42; `shame@jonah_pike` → `refusal.coal_flicker` |
| BOT opts | `{ mode:'play', interactionCompat: true }` (flag deprecated; runtime always boots interactionRt) |

Raw: `docs/qa/reports/_m3-interaction-evidence.json` (untracked).

## Matrix table (archetype × style × seed)
| Archetype | Style | Seed | Status | Stuck | Bored | Dom max / method | Burn | H/R | Ticks |
|-----------|-------|------|--------|-------|-------|------------------|------|-----|-------|
| marrow | savage | 1 | OK | n | n | 0.07 shame@jonah_pike | n | 9/9 | 200 |
| marrow | savage | 2 | OK | n | n | 0.05 lie@clara_whitby | n | 9/9 | 200 |
| marrow | savage | 3 | OK | n | n | 0.06 challenge@gen_p_3_1 | n | 9/9 | 200 |
| marrow | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| marrow | kind | 2 | OK | n | n | 0.08 carry_burden@gen_p_2_2 | n | 7/9 | 200 |
| marrow | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 4/9 | 200 |
| marrow | mixed | 1 | OK | n | n | 0.05 inspire@jonah_pike | n | 8/9 | 200 |
| marrow | mixed | 2 | OK | n | n | 0.04 inspire@ruth_calder | n | 9/9 | 200 |
| marrow | mixed | 3 | OK | n | n | 0.04 inspire@elias_boone | n | 9/9 | 200 |
| ivy_quill | savage | 1 | OK | n | n | 0.06 shame@jonah_pike | n | 9/9 | 200 |
| ivy_quill | savage | 2 | OK | n | n | 0.05 lie@elias_boone | n | 9/9 | 200 |
| ivy_quill | savage | 3 | OK | n | n | 0.06 lie@elias_boone | n | 9/9 | 200 |
| ivy_quill | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| ivy_quill | kind | 2 | OK | n | n | 0.08 carry_burden@gen_p_2_2 | n | 7/9 | 200 |
| ivy_quill | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 4/9 | 200 |
| ivy_quill | mixed | 1 | OK | n | n | 0.04 inspire@jonah_pike | n | 8/9 | 200 |
| ivy_quill | mixed | 2 | OK | n | n | 0.04 inspire@ruth_calder | n | 9/9 | 200 |
| ivy_quill | mixed | 3 | OK | n | n | 0.04 inspire@elias_boone | n | 9/9 | 200 |
| basilisk_brood | savage | 1 | OK | n | n | 0.08 shame@jonah_pike | **Y** | 9/6 | **99** |
| basilisk_brood | savage | 2 | OK | n | n | 0.05 lie@clara_whitby | n | 9/8 | 200 |
| basilisk_brood | savage | 3 | OK | n | n | 0.09 shame@gen_p_3_0 | **Y** | 5/4 | **47** |
| basilisk_brood | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| basilisk_brood | kind | 2 | OK | n | n | 0.08 carry_burden@gen_p_2_2 | n | 4/9 | 200 |
| basilisk_brood | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 4/9 | 200 |
| basilisk_brood | mixed | 1 | OK | n | n | 0.04 inspire@jonah_pike | n | 9/9 | 200 |
| basilisk_brood | mixed | 2 | OK | n | n | 0.04 inspire@ruth_calder | n | 9/9 | 200 |
| basilisk_brood | mixed | 3 | OK | n | n | 0.04 inspire@elias_boone | n | 7/9 | 200 |

Raw: `docs/qa/reports/_m3-matrix-raw.json` (untracked).

## Feel / interaction-model note
- Play sessions always boot `interactionRt`; method acts resolve via interaction recipes; legacy `commitMethod` spark-spend act path removed @ `ddd546f`.
- Loom `04c7421` middle-ground pacing retune: burnout pocket shrinks (3→2 basilisk×savage burns); overall rate **≈0.074** in 5–15% band.
- Evidence script now has `--mode kindle|packet|refusal|all` so packet/refusal juice is Probe-visible without relying only on vitest cites.

## Special-bar / ripple cite
- `npx vitest run tests/sim/scenario/special-bar-gen.test.ts` → **6/6** @ `126b8a6`
- `npx vitest run tests/sim/ripple-play.test.ts` → **1/1** @ `126b8a6`

## Playwright / screenshots (prism density tip)
| Surface | Result @ `126b8a6` (includes `c58142c`/`6379017`) |
|---------|--------------------------------------------------|
| `npm run test:e2e:m3` (m3-overworld-smoke) | **1/1** PASS (~3s) |
| `tests/e2e/m3-25d-screenshot.spec.ts` | **1/1** PASS (~7.5s) |
| `artifacts/25d/` | Present: `overworld-boot.png`, `overworld-canvas.png`, `overworld-walk-east.png`, `prism-overworld-boot.png`, `prism-overworld-canvas.png`, `prism-overworld-walk-east.png`, `prism-scale-after.png` (+ older `prism-scale-before.png`). Visual spot-check: meadow flowers/grass density, uniform artScale trees+building, hero spawned, HUD “2.5D overworld” + settlements — no obvious blank/broken canvas. |

## Automated truth (this follow-up @ `126b8a6`)
| Command | Result |
|---------|--------|
| `npx vite-node scripts/m3-interaction-evidence.mts --mode all` | OK; packetEmit+Deliver+refusalCoalFlicker; sparkSpend **0** |
| `npx vite-node scripts/run-playthrough-matrix.mts` | **OK** 27/27; burnoutRate **≈0.074**; H/R **193/234** |
| `npm run test:bots` | **65/65** |
| special-bar | **6/6** |
| ripple-play | **1/1** |
| `npm run test:e2e:m3` | **1/1** |
| m3-25d screenshots | **1/1** + artifacts present |

## Open risks (not SHIP blockers / not re-HOLD)
1. **basilisk_brood × savage** burns **2/3** (ticks 47–99) — smaller pocket than @ ddd546f (3/3); still open risk for Loom/Forge, **not a re-HOLD**.
2. BOT harness still passes deprecated `interactionCompat: true` (harmless).
3. M4 living-world gate is **DRAFT checklist only** (`docs/qa/M4_GATE.md`) — no M4 verdict.

## Commands
```bash
npx vite-node scripts/m3-interaction-evidence.mts --mode all
npx vite-node scripts/run-playthrough-matrix.mts
npm run test:bots
npx vitest run tests/sim/scenario/special-bar-gen.test.ts
npx vitest run tests/sim/ripple-play.test.ts
npm run test:e2e:m3
npx playwright test tests/e2e/m3-25d-screenshot.spec.ts
```
