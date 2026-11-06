# Forge commit batch — Probe playthrough bots (no Probe commit)

Please commit when convenient (single batch):

- tests/bots/** (harness + tests + thresholds.json)
- docs/qa/PLAYTHROUGH_BOTS.md
- docs/qa/reports/m2-playable-town-bots.md
- docs/superpowers/specs/2026-11-05-playthrough-bots-design.md
- docs/qa/FORGE_COMMIT_BATCH_bots.md (this file; optional)
- package.json (`test:bots` script)
- vitest.config.ts

Also needed for live matrix (separate Forge work): export `createPlaySession` (or listed aliases) from `src/sim` matching `BotSession` in `tests/bots/bot-session.ts`.
