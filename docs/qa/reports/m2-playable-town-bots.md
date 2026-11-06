# M2 playable-town bots report

> **Superseded for M3:** live Hybrid-C matrix + harsh verdict now live in [`m3-worth-playing.md`](./m3-worth-playing.md) @ `c91755e` (`SHIP-WITH-FIXES`). Matrix is **no longer `API_PENDING`**.

**Generated (legacy):** 2026-11-05 (America/New_York)  
**Harness:** hybrid C (headless sim bots + Playwright UI smoke)  
**Status (legacy):** was `API_PENDING` — **cleared** on M3 Task 8 (see m3 report)

## Summary
- Playthrough-bot harness under `tests/bots/` is live via `createPlaySession`.
- M3 gate report: `docs/qa/reports/m3-worth-playing.md`.

## Commands
```bash
npm run test:bots
npx vite-node scripts/run-playthrough-matrix.mts
npm test
npm run build
```
