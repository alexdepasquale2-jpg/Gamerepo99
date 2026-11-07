# Hearthfall: Claude Code handoff

Check out `main` after PR #1 merges (this file lives on `wip`). Run from the repo root: `claude` then paste "Read CLAUDE_HANDOFF.md and do Task 1." Do one task per session.

## State (Nov 7, 2026)
- M4 is code-complete and gated GO. It is in PR #1 (`ccr-2d087683-rpgezr` → main), built on clean main (no wip art/patches). 383 tests green.
- Done: M1–M4 — economy LOD, social web, Blessings and Burdens, caravans, doctrine (+player acts), letters/rumors, seeded names, earnable civic_voice.
- `PLAN.md` on the PR branch holds the next 5 steps. Read it after the PR merges to main.
- Read first: `docs/STRUCTURE.md`, `docs/DESIGN.md`, `docs/superpowers/specs/2026-11-05-hoarder-notoriety-design.md`, `docs/superpowers/specs/2026-11-05-async-legacy-npc-design.md`.

## Rules
- TypeScript, Vite, Phaser 3 and Vitest. Free tools and assets only.
- The sim is deterministic: use seeded RNG (`sessionRng.derive(...)`). Never use `Math.random`, and never write `archetypeId ===` in `src/sim/`.
- Use no runtime AI or LLM. Use data tables only.
- Keep files under ~400 lines. Write tests first (TDD).
- Change in the world comes through interactions, never through spending a resource like a button press.
- Gate: `npm run validate && npm test && npm run build` must be all green before you commit.

## Task 1: write the M5 plan (no code)
`docs/superpowers/plans/m5/index.md` + one brief per task (A hoarder path + notoriety, B kingdom patrons, C generational play + async legacy), each with a tests-first list and acceptance checks. Data already exists: `src/data/economy/{patrons,stash-sites,notoriety}.json`.

## Tasks 2–4: M5 A, B, C in order (one per session). See `PLAN.md`.

## Push
`git push origin main` (remote is https://github.com/alexdepasquale2-jpg/Gamerepo99). Never put tokens in the remote URL.
