# Automated playthrough bots (hybrid C)

**Status:** Harness ready. Live matrix is `API_PENDING` until Forge exports an M2 play-session factory from `src/sim` (e.g. `createPlaySession`).

Design: `docs/superpowers/specs/2026-11-05-playthrough-bots-design.md`

## Goal
Headless bots exercise the **public sim API** (no Phaser) across playable archetypes × play styles, measuring feel/balance. Playwright stays UI-smoke only (`npm run test:e2e:m1`).

## How to run
```bash
# Unit harness (style policy, metrics, adapter null-today, fake-session path)
npm run test:bots
# or
npx vitest run tests/bots

# Full suite (includes bots once harness lands)
npm test
```

## Matrix
| Axis | Values |
|------|--------|
| Archetypes | `marrow`, `ivy_quill`, `basilisk_brood` |
| Styles | `savage`, `kind`, `mixed` (family-weight policies — **no archetype id branches**) |
| Seeds | from `tests/bots/thresholds.json` → `defaultSeeds` |

When `connectBotSession()` returns null, `runMatrix()` marks every cell `API_PENDING`. Unit tests still exercise metrics via an in-test fake session.

## Metrics
1. **stuck** — fingerprint unchanged for `stuckTicks` while actions empty/identical
2. **boredom** — `meaningfulChoices ≤ 1` for `boredomTicks`
3. **method_dominance** — max pick-rate vs `methodDominanceCap`
4. **burnout_rate** — fraction of runs ending burned out
5. **hollow_vs_reignited** — summed hollow vs reignite counts

Thresholds: `tests/bots/thresholds.json` (data, not code).

## Layout
```
tests/bots/
  bot-session.ts      # BotSession + connectBotSession feature-detect
  style-policy.ts     # savage/kind/mixed
  metrics.ts          # pure aggregators
  run-matrix.ts       # matrix driver
  thresholds.json
  *.test.ts
docs/qa/reports/m2-playable-town-bots.md
```

## Report
`docs/qa/reports/m2-playable-town-bots.md` — update after each real matrix run; send summary to Niblet.

## Forge handoff
Probe does not commit. Batch for Forge includes everything under `tests/bots/`, `docs/qa/PLAYTHROUGH_BOTS.md`, `docs/qa/reports/m2-playable-town-bots.md`, `package.json` (`test:bots`), and `vitest.config.ts` (bots no longer excluded).
