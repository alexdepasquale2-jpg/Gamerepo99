# PLAN

## Status
Runtime wiring fix: hearth rest now runs the full dawn pipeline (economy/caravans, doctrines, letters, unspoken, hoard, legacy, patrons); economy and dynamic dialogue enabled. Play generates 60 procedural residents to match the baked social web. Loaded-state juice forwarding restored. Build verified; tests/playthrough deliberately not rerun at Alex's request. This does not close the neglect/balance blockers or sign the M5 gate.
M5 on main (PRs #2,#4,#5,#8 + gap fixes #9–#14), 458 tests. M7 bots (#7) + perf (#6) + M6 plan (#3) merged.
M6 A (surfacing #17) + B (menus #16), mobile touch (#18), polish (#19), leader fix (#15) merged; build hosted.
Next: Alex signs `docs/qa/M5_GATE.md`; decide neglect→despair rule and balance numbers; then M6 surfacing (step 7).

## Next 5 steps (one per session, gate: `npm run validate && npm test && npm run build`)

1. ~~**Land M4.**~~ DONE. Team marks `docs/qa/M4_GATE.md` Go/Hold → PR branch → main → refresh `CLAUDE_HANDOFF.md` on wip.
   Small fix alongside: seed `state.towns` for every town so doctrine `town.standing` applies everywhere.
   Done when: main has M4, gate signed, 382+ green.

2. ~~**Write the M5 plan.**~~ DONE. `docs/superpowers/plans/m5/index.md` + one brief per task, from
   `specs/2026-11-05-hoarder-notoriety-design.md` and `specs/2026-11-05-async-legacy-npc-design.md`.
   Data already exists: `economy/{patrons,stash-sites,notoriety}.json`. No code.
   Done when: tasks A–C below have briefs with tests-first lists and acceptance checks.

3. ~~**M5 Task A: hoarder path + notoriety.**~~ DONE. Coin and stash sites (stash, protect, lose to danger).
   Notoriety cuts both ways: more eyes give more leverage and more road/stash danger.
   Neglect raises despair but never fails the run; it is a legitimate ending.
   Done when: a 30-dawn hoarder bot run ends cleanly with an ending, not a loss; notoriety drives encounters.

4. ~~**M5 Task B: kingdom patrons.**~~ DONE. Deal with a large polity for leverage and notoriety; patrons tie into
   doctrines (propaganda, perceived delivery). Change still comes only through interactions (no button spend).
   Done when: a patron deal shifts doctrine meters and notoriety, deterministically.

5. ~~**M5 Task C: generational play + async legacy.**~~ DONE. Succession hands the heir an ember, reputation echoes and
   rumors (via letters/rumors + unspoken). Export/import a versioned world file (seed + delta log + imprint);
   former PCs appear as legends, NPCs or graves.
   Done when: burnout → "Carry it on" continues with an heir; an exported file re-imports with the legend present.

## After M5 (steps 6–10)

6. ~~**Land M5.**~~ DONE except one evidence gap (neglect doesn't raise despair). Task A verified + pushed; then B and C run in parallel worktrees (own branch + PR each).
   Merge A → B → C, resolving overlaps in `doctrine-tick.ts`, `save.ts`, `types/runtime.ts`.
   Add `scripts/m5-depth-evidence.mts` (like M4's); gate doc + verdict. Done when: M5 on main, evidence `gaps: []`.

7. ~~**M6 plan + player-facing surfacing (Prism).**~~ DONE (#16, #17). Plan doc first. Then show what the sim already emits:
   reaction lines (Blessings and Burdens, letters, doctrine), despair desaturation per town, succession screen
   ("Your fire went out. Someone remembers it." / Carry it on / Let it rest), save/load menu using `SaveBlob`.
   Done when: a played 10-dawn session shows each M4/M5 event to the player through people, no popups.

8. **M6 juice + audio pass.** PARTIAL: overworld now fires reignite VFX; procedural sfx (src/render/sfx.ts, N mutes). Screenshots + size done (docs/qa/M6_JUICE_CHECK.md). Left: reignite flash looks weak (tune FEEL), listen/tune cues. Reignite VFX (`plans/2026-11-05-spark-reignite-vfx.md`), color return on reignite,
   free audio assets (credit in `CREDITS.md`). Merge or drop leftover `wip` art/patches here.
   Done when: Playwright screenshot check of a reignite + a despairing town; build size noted.

9. **M7 balance bots.** Matrix summary: docs/qa/reports/M7_BALANCE_SUMMARY.md (harsh x marrow/basilisk_brood still burn out; kind/hoarder too easy; baseline stale). Harness DONE (#7, #11); tuning pending Alex. Headless bots per playstyle (kind, harsh, hoarder, neglect) × archetypes × seeds,
   using `specs/2026-11-06-spark-pacing-balance.md`. Close the basilisk_brood × savage burnout pocket.
   Done when: matrix report, no archetype/playstyle stuck or trivially winning, all runs deterministic.

10. **M7 perf + bug sweep.** DONE: 150 dawns, tick p50 1.6ms/max 7.4ms, delta log 21KB, no bugs found. Perf profile DONE (#6). Profile 100+ dawns on the big world (dawn tick budget, delta-log size from M5).
    Fix found bugs with tests. Done when: dawn tick under budget, no open P1 bugs.
    M8 (public build) only after your clearance.

## Blockers
- None open. Neglect→despair resolved (+0.01/dawn per untouched town, grace 1 dawn, capped 0.6, never fails; `economy-lod.json` despair.neglect). Balance resolved via `scoring.json` spark.strainMulByTag (hard/shame_lean ×0.55 → ~11 dawns) and sparkGainAdjustByTag (gentle/presence −1). M5 gate: Go (Niblet, on Alex's delegation).
- Tests: 563/563 green, build green (verified on this branch).

## Economy sim roadmap (one phase per session; each phase deterministic, saved, tested; features stay light and NPC-driven first)

1. ~~**Named jobs + work yields.**~~ DONE. `data/items/jobs.json`, `sim/goods/jobs.ts`; a person's job derives from seed; work_alongside yields their job's goods.
2. ~~**Supply/demand core.**~~ DONE. `sim/economy/village-economy.ts`: per-town goods ledger; dawn production and processing by job recipes (`jobs.json`), household food and wear demand, shortage recorded (`townNeeds`), price rises when cover < 3 days (`priceAt`), player gifts/sales feed the ledger. New items: grain, flour, flax, clay, rope, nails, pots; jobs: miller, ropemaker, potter. Not yet wired: shortage->despair, needs-board display, tools gating gathers.
3. ~~**Logistics.**~~ DONE. `sim/economy/logistics.ts`: shortage posts a request (`openRequests`); the nearest town with surplus loads a cart (cap 6) down `planRoad` legs; roads cap at 3 carts, towns send 2 per dawn, max haul 8 days; carts can be lost (courier odds, worse on broken roads); arrival feeds the ledger. Cart position via `cartPosition` (not drawn yet). 30-dawn play probe: 4 towns, 98 delivered, 17 carts lost. Not yet: draw carts on the map, player escort/carry hooks, stash theft on carts, needs-board display.
4. ~~**Ambitions + build plans.**~~ DONE. `sim/economy/build-plans.ts` + `data/items/buildings.json` (10 kinds). Villagers roll an ambition (3%/dawn) for a building that fits their trade (else a house), claim a free abstract plot around the town centre (`claims`, no overlap, centre reserved), draw materials from the town ledger; gaps feed town need so prices rise and logistics ships goods; when goods are on site, labor runs and the building stands (x1.5 production for its trade in that town). Plans abandon after 40 stalled dawns and free their plot. The player helps by gifting the owner a needed item (goes to the site). 60-dawn play probe: 20 plans, 5 done, 4 abandoned. Not yet: hiring (phase 5), plots mapped to tiles/drawn, a UI to ask/answer help requests.
5. **Hiring + companies.** Plan owners hire idle jobholders (wages in coin); a company = owner + building + workers + ledger. Light: companies exist and produce, no player UI beyond gifts/work.
6. **Households + lineage.** Man+woman adult household, children, surnames chosen by the founder (ancestry name). Gifted children: rare roll gated by household warmth/flame ("high vibration") and goods security. Heirs inherit claims.
7. **Borders + claims.** Claim records become town/estate borders on the map; overlap creates disputes.
8. **Light polity layer.** Diplomacy (treaty/feud meters), war (raids that destroy goods/claims), technology (unlock recipes by built institutions), religion (shrine + creed that sets meters). Planned and claimed by NPCs only; no player verbs yet.
Rule: no phase ships without a 30-dawn deterministic run test and `npm run validate && npm test && npm run build`.
