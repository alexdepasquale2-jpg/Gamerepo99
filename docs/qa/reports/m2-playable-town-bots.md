# M2 playable-town bots report

**Generated:** 2026-11-05 (America/New_York)  
**Harness:** hybrid C (headless sim bots + Playwright UI smoke only)  
**Status:** `API_PENDING`

## Summary
- Playthrough-bot harness is **ready** under `tests/bots/`.
- `connectBotSession()` feature-detects Forge exports (`createPlaySession`, `createBotSession`, `createPlayableSession`, `createMethodSession`). **None present yet** → live matrix cells marked `API_PENDING`.
- Unit tests green via in-test fake session (metrics path exercised).
- Target: playable-town bot report by **Fri 8:00 AM ET**.

## Matrix (will run when API lands)
| Archetype | Style | Seeds | Status |
|-----------|-------|-------|--------|
| marrow | savage / kind / mixed | 1,2,3 | API_PENDING |
| ivy_quill | savage / kind / mixed | 1,2,3 | API_PENDING |
| basilisk_brood | savage / kind / mixed | 1,2,3 | API_PENDING |

## Metrics (definitions ready; no live numbers)
| Metric | Threshold key | Live value |
|--------|---------------|------------|
| stuck | `stuckTicks` = 10 | n/a |
| boredom | `boredomTicks` = 10 | n/a |
| method_dominance | `methodDominanceCap` = 0.65 | n/a |
| burnout_rate | — | n/a |
| hollow_vs_reignited | — | n/a |

## Blocker
Forge must export a public play-session factory from `src/sim` matching `BotSession` (see design spec). Until then, re-run `npm run test:bots` after the export lands and regenerate this report.

## Commands
```bash
npm run test:bots
npm test
npm run build
```

---

## Quality gate note
Per `docs/qa/QUALITY_GATE.md`, M2 also requires `docs/qa/reports/m2-worth-playing.md` after a **live** matrix (not API_PENDING). That verdict is currently **blocked** on Forge `createPlaySession`.
