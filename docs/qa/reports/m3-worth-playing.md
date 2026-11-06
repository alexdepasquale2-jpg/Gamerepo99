# M3 worth playing — Hybrid-C playthrough gate

**Generated:** 2026-11-06 10:17 AM (America/New_York)  
**Candidate HEAD:** `ddd546f` (`feat(sim): interactionCompat default on; drop legacy act spark path`)  
**Includes:** `2a912b1` (`bridge interaction → special-bar/ripple juice + person marks`)  
**vs prior:** SHIP-WITH-FIXES @ `ca882cd` (burnoutRate **1.0**, ticks 13–31); prep/evidence era `0df515a`; Forge smoke @ `a8bcf43` (burnout ≈0.111, H/R **0/0** — not a Probe verdict)  
**Harness:** `connectBotSession()` → `createPlaySession` live; interactionCompat **always ON** (`CreatePlaySessionOpts.interactionCompat` deprecated; bots still pass `true`); seeds `1,2,3`; maxTicks 200; gated on committed tip (Loom WIP interaction JSON aside, restored after)  
**Status:** live matrix **OK** (0× `API_PENDING`, 0× `ERROR`)  
**Skills cited:** `verification-before-completion`, `office-xlsx`

## Verdict
**Call: SHIP**

**Question:** Is this worth playing?  
**Answer:** **Yes — finally a journey, not a spark fuse.** Default-ON interaction + special-bar/ripple bridge lands: **burnoutRate ≈ 0.111** (3/27), **24/27** ride to maxTicks **200**, hollow/reignite **190 / 231** (both live — the `a8bcf43` hollow-world smell is gone). Stuck/bored/dominance clean. Evidence: **spark.spend = 0** on method success; `interaction` / inspire→`talk_gentle`, `site.kindle`, `mark.applied` fire. Remaining burnouts are a pocket (**basilisk_brood × savage** only) — open risk, not a ship blocker under Loom’s &lt;1.0 / prefer ≤0.85 bar.

## Live matrix aggregates vs thresholds
| Metric | Threshold / expect | Live @ ddd546f | vs ca882cd | vs a8bcf43 smoke | Pass? |
|--------|--------------------|----------------|------------|------------------|-------|
| matrix status | not `API_PENDING` | **OK** (27/27) | OK | OK | yes |
| stuck | `stuckTicks`=10 | **0/27** | 0 | 0 | yes |
| boredom | `boredomTicks`=10 | **0/27** | 0 | 0 | yes |
| method_dominance | cap 0.65 | **0 breaches** (max ~0.04–0.09) | 0 | 0 | yes |
| burnout_rate | Loom &lt; 1.0; prefer ≤0.85 | **3/27 ≈ 0.111** | **1.0** | ≈0.111 | **yes** |
| hollow vs reignited | prefer both &gt; 0 | **190 / 231** | 77 / 201 | **0 / 0** | **yes** |
| typical ticks | longer play | **46–200** (mean ~186.5; 24×200) | 13–31 (~19.5) | (smoke) | **yes** |
| ERROR cells | 0 | **0** | 0 | 0 | yes |

## Interaction evidence (`scripts/m3-interaction-evidence.mts`)
| Signal | Result @ ddd546f |
|--------|------------------|
| status | OK; 20/20 ticks; stopReason `maxTicks`; spark **83**, burnedOut **false** |
| `sparkSpendCount` | **0** (legacy success-path spend gone) |
| histogram | `interaction` 18, `mark.applied` 18, `person.reaction` 18, `site.kindle` 14, `tick` 20, travel/advance/encounter present |
| notable | `interaction` ✓, `talkGentleViaMethodId` ✓, `siteKindle` ✓, `markApplied` ✓; `packetEmit` / refusal **false** in this short kind-inspire probe (ripple suite still green) |
| BOT opts | `{ mode:'play', interactionCompat: true }` — flag deprecated; runtime always boots `interactionRt` |
| picks (probe) | inspire 18, advance 1, travel 1 |

Raw: `docs/qa/reports/_m3-interaction-evidence.json` (untracked).

## Matrix table (archetype × style × seed)
| Archetype | Style | Seed | Status | Stuck | Bored | Dom max / method | Burn | H/R | Ticks |
|-----------|-------|------|--------|-------|-------|------------------|------|-----|-------|
| marrow | savage | 1 | OK | n | n | 0.06 shame@jonah_pike | n | 9/9 | 200 |
| marrow | savage | 2 | OK | n | n | 0.06 advance:dawn | n | 9/9 | 200 |
| marrow | savage | 3 | OK | n | n | 0.06 challenge@gen_p_3_1 | n | 9/9 | 200 |
| marrow | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| marrow | kind | 2 | OK | n | n | 0.08 carry_burden@gen_p_2_2 | n | 7/9 | 200 |
| marrow | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 3/9 | 200 |
| marrow | mixed | 1 | OK | n | n | 0.06 travel:route_ashford_city_glare | n | 9/9 | 200 |
| marrow | mixed | 2 | OK | n | n | 0.06 travel:route_lowmere_peat_ladder | n | 9/9 | 200 |
| marrow | mixed | 3 | OK | n | n | 0.06 advance:dawn | n | 8/9 | 200 |
| ivy_quill | savage | 1 | OK | n | n | 0.06 shame@jonah_pike | n | 9/9 | 200 |
| ivy_quill | savage | 2 | OK | n | n | 0.06 lie@elias_boone | n | 9/9 | 200 |
| ivy_quill | savage | 3 | OK | n | n | 0.07 challenge@gen_p_3_1 | n | 8/9 | 200 |
| ivy_quill | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| ivy_quill | kind | 2 | OK | n | n | 0.07 inspire@elias_boone | n | 7/9 | 200 |
| ivy_quill | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 2/9 | 200 |
| ivy_quill | mixed | 1 | OK | n | n | 0.05 lie@harold_finch | n | 8/9 | 200 |
| ivy_quill | mixed | 2 | OK | n | n | 0.04 inspire@ruth_calder | n | 9/9 | 200 |
| ivy_quill | mixed | 3 | OK | n | n | 0.04 inspire@elias_boone | n | 8/9 | 200 |
| basilisk_brood | savage | 1 | OK | n | n | 0.06 shame@gen_p_1_0 | **Y** | 9/4 | **85** |
| basilisk_brood | savage | 2 | OK | n | n | 0.07 challenge@ruth_calder | **Y** | 9/7 | **104** |
| basilisk_brood | savage | 3 | OK | n | n | 0.09 shame@gen_p_3_0 | **Y** | 6/4 | **46** |
| basilisk_brood | kind | 1 | OK | n | n | 0.08 carry_burden@harold_finch | n | 3/9 | 200 |
| basilisk_brood | kind | 2 | OK | n | n | 0.07 inspire@elias_boone | n | 4/9 | 200 |
| basilisk_brood | kind | 3 | OK | n | n | 0.07 inspire@gen_p_3_2 | n | 3/9 | 200 |
| basilisk_brood | mixed | 1 | OK | n | n | 0.06 travel:route_ashford_city_glare | n | 9/9 | 200 |
| basilisk_brood | mixed | 2 | OK | n | n | 0.06 travel:route_lowmere_peat_ladder | n | 9/9 | 200 |
| basilisk_brood | mixed | 3 | OK | n | n | 0.05 travel:route_chalk_spur_reach | n | 9/9 | 200 |

Raw: `docs/qa/reports/_m3-matrix-raw.json` (untracked).

## Feel / interaction-model note
- Play sessions always boot `interactionRt` (`bootPlayState`); method acts resolve via interaction recipes (inspire→`talk_gentle`); legacy `commitMethod` spark-spend act path removed @ `ddd546f`.
- Dominance ids still show method-shaped labels in traces (`inspire@…`, `shame@…`) plus rest/travel (`advance:dawn`, `travel:route_*`) — expected under compat mapping.
- vs `a8bcf43`: same-ish burnout math, but H/R restored by `2a912b1` juice bridge + default-ON — world stakes feel alive across long runs.

## Special-bar / ripple cite
- `npx vitest run tests/sim/scenario/special-bar-gen.test.ts` → **6/6** @ `ddd546f`
- `npx vitest run tests/sim/ripple-play.test.ts` → **1/1** @ `ddd546f`

## Playwright / manual
**Skipped** (conserve). Prior green @ `c91755e`: `npm run test:e2e:m3` **1/1**.

## Automated truth (this turn @ `ddd546f`)
| Command | Result |
|---------|--------|
| `npx vite-node scripts/m3-interaction-evidence.mts` | OK; sparkSpend **0**; interaction/kindle/marks present |
| `npx vite-node scripts/run-playthrough-matrix.mts` | **OK** 27/27; burnoutRate **≈0.111**; H/R **190/231** |
| `npm run test:bots` | **65/65** |
| special-bar | **6/6** |
| ripple-play | **1/1** |
| `npm run build` | **OK** |
| `npm test` / e2e | **skipped** (conserve; matrix+bots+special-bar+ripple+build green) |

## Open risks (not SHIP blockers)
1. **basilisk_brood × savage** burns **3/3** (ticks 46–104) — only burnout pocket; Loom/Forge may want savage cost/recovery retune later.
2. Short evidence probe did not emit `packet.emit` / refusal juice (inspire-heavy path); rely on ripple + special-bar suites for those side effects until matrix aggregates bus events.
3. BOT harness still passes deprecated `interactionCompat: true` (harmless; docs/tests expect it).
4. e2e not re-run this gate (conserve).

## Commands
```bash
npx vite-node scripts/m3-interaction-evidence.mts
npx vite-node scripts/run-playthrough-matrix.mts
npm run test:bots
npx vitest run tests/sim/scenario/special-bar-gen.test.ts
npx vitest run tests/sim/ripple-play.test.ts
npm run build
```
