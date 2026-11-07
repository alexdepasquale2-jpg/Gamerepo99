# PLAN

## Status
M4 merged to main (PR #1). Step 2 done: M5 plan in docs/superpowers/plans/m5/.

## Next 5 steps (one per session, gate: `npm run validate && npm test && npm run build`)

1. ~~**Land M4.**~~ DONE. Team marks `docs/qa/M4_GATE.md` Go/Hold → PR branch → main → refresh `CLAUDE_HANDOFF.md` on wip.
   Small fix alongside: seed `state.towns` for every town so doctrine `town.standing` applies everywhere.
   Done when: main has M4, gate signed, 382+ green.

2. ~~**Write the M5 plan.**~~ DONE. `docs/superpowers/plans/m5/index.md` + one brief per task, from
   `specs/2026-11-05-hoarder-notoriety-design.md` and `specs/2026-11-05-async-legacy-npc-design.md`.
   Data already exists: `economy/{patrons,stash-sites,notoriety}.json`. No code.
   Done when: tasks A–C below have briefs with tests-first lists and acceptance checks.

3. **M5 Task A: hoarder path + notoriety.** Coin and stash sites (stash, protect, lose to danger).
   Notoriety cuts both ways: more eyes give more leverage and more road/stash danger.
   Neglect raises despair but never fails the run; it is a legitimate ending.
   Done when: a 30-dawn hoarder bot run ends cleanly with an ending, not a loss; notoriety drives encounters.

4. **M5 Task B: kingdom patrons.** Deal with a large polity for leverage and notoriety; patrons tie into
   doctrines (propaganda, perceived delivery). Change still comes only through interactions (no button spend).
   Done when: a patron deal shifts doctrine meters and notoriety, deterministically.

5. **M5 Task C: generational play + async legacy.** Succession hands the heir an ember, reputation echoes and
   rumors (via letters/rumors + unspoken). Export/import a versioned world file (seed + delta log + imprint);
   former PCs appear as legends, NPCs or graves.
   Done when: burnout → "Carry it on" continues with an heir; an exported file re-imports with the legend present.

## Blockers
- None. Open questions are listed in the M5 plan index and task files.
