# PLAN

## Status
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

8. **M6 juice + audio pass.** Reignite VFX (`plans/2026-11-05-spark-reignite-vfx.md`), color return on reignite,
   free audio assets (credit in `CREDITS.md`). Merge or drop leftover `wip` art/patches here.
   Done when: Playwright screenshot check of a reignite + a despairing town; build size noted.

9. **M7 balance bots.** Harness DONE (#7, #11); tuning pending Alex. Headless bots per playstyle (kind, harsh, hoarder, neglect) × archetypes × seeds,
   using `specs/2026-11-06-spark-pacing-balance.md`. Close the basilisk_brood × savage burnout pocket.
   Done when: matrix report, no archetype/playstyle stuck or trivially winning, all runs deterministic.

10. **M7 perf + bug sweep.** Perf profile DONE (#6). Profile 100+ dawns on the big world (dawn tick budget, delta-log size from M5).
    Fix found bugs with tests. Done when: dawn tick under budget, no open P1 bugs.
    M8 (public build) only after your clearance.

## Blockers
- Neglect→despair: spec §7 says despair rises when you never reignite, but LOD only raises it on starve/broken routes. Needs a rule (Alex).
- Balance numbers (harsh burnout ~6 dawns for basilisk_brood/marrow; gentle styles cost nothing) need Alex's OK.
