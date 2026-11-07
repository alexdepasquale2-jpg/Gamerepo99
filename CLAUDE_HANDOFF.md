# Hearthfall: Claude Code handoff

Check out `wip` first (`git checkout wip`). Run from the repo root: `claude` then paste "Read CLAUDE_HANDOFF.md and do Task 1." Do one task per session.

## State (Nov 6, 2026)
- Branches: `main` is the working game, and `wip` holds unfinished work (including patches in `wip-patches/`). Keep only these two long-lived branches. Use one short-lived feature branch per task, then merge it into main and delete it.
- `main` @ 0694679: `npm test` 332/332, build OK.
- Done: M1 to M3, M4 Task A economy LOD (`tickEconomyLod`), and the social-graph 05 weave, centrality and falloff (`src/sim/social/`).
- Loom's data for 06 is on main: `src/data/people/unspoken/`, `src/data/dialogue/fragments/unspoken/` and `scripts/validate/unspoken.mjs`.
- Read first: `docs/STRUCTURE.md`, `docs/DESIGN.md` and `docs/superpowers/specs/2026-11-06-social-graph/` (06 is authoritative).

## Rules
- TypeScript, Vite, Phaser 3 and Vitest. Free tools and assets only.
- The sim is deterministic: use seeded RNG (`sessionRng.derive(...)`). Never use `Math.random`, and never write `archetypeId ===` in `src/sim/`.
- Use no runtime AI or LLM. Use data tables only.
- Keep files under ~400 lines. Write tests first (TDD).
- Change in the world comes through interactions, never through spending a resource like a button press.
- Gate: `npm run validate && npm test && npm run build` must be all green before you commit.

## Task 1: social-graph 06 Blessings and Burdens runtime
Implement it per §10 and §11 of `06-blessings-and-burdens.md`.
- Add `src/sim/social/unspoken.ts`, `unspoken-types.ts` and `tests/sim/social/unspoken.test.ts`.
- Encode: a successful `resolveInteraction` that matches `encodeFrom` creates an UnspokenInstance.
- Decay: after `halfLifeDays`, weight is about half. A weight that falls below epsilon fades without coming to pass.
- Come to pass: this runs at dawn AFTER `tickEconomyLod`. Each instance is consumed exactly once.
- The carrier is never the player. Results surface only through `person.reaction`, `packet.emit` or `letter.*`, never through UI popups.
- Tuning: `blessingBias` is clamped to ±0.10.
- Load the tables in load-data, export them from the social and sim indexes, and persist the instances and tuning in save files and snapshots.
- Out of scope: render, caravans, doctrine and letters.

## Task 2 (only after Task 1 is merged): packet-02 caravans
Follow the finalized packet-02 brief in the docs. Caravans run return legs, and damaged routes slow them in proportion to the damage. The break effect fires once, Ashford receives cargo, and `maxConcurrent` defaults to 2.

## Task 3: Doctrine module, then Task 4: Letters module
Together these close the M4 living-world gate (`docs/qa/M4_GATE*`, `scripts/m4-living-world-evidence.mts`).

## Push
`git push origin main` (remote is https://github.com/alexdepasquale2-jpg/Gamerepo99). Never put tokens in the remote URL.
