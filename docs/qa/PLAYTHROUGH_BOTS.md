# Automated playthrough bots (post-M1)

Goal: bots play The Last Spark and measure feel/balance. Report metrics to Niblet each run.

## Metrics
1. **Stuck states** — no meaningful state change for N ticks / no reachable actions.
2. **Boring stretches** — low event rate, repeated identical choices, long idle HUD.
3. **Method dominance** — one method used >> others across seeded runs (win-rate + pick-rate skew).

## Harness shape
- Headless sim preferred (`src/sim`) for speed; Phaser/Playwright for UI-path smoke.
- Seeded RNG (`src/sim/rng.ts`) for reproducibility.
- Suite: matrix of seeds × archetypes × opening methods.
- Artifacts: JSON metrics + optional screenshots under `tests/e2e/artifacts/playthrough/`.

## Status
- Scaffold after M1 verify lands.
- Do not block M1 smoke on this.
