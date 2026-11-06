# The Last Spark

Walk into towns that have lost the will to live and reignite people one by one.
Every method you use costs some of your own spark.

This repo is the browser prototype (TypeScript + Vite + Phaser 3).
Milestone 1 is the scaffold: pure simulation core, seeded RNG, event bus, and a wander demo.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually http://localhost:5173).
You should see a tile map with a few people wandering.

## Test

```bash
npm test
```

Vitest covers deterministic tick, seeded RNG, and the event bus (subscribe / emit / unsubscribe).

## E2E (Playwright)

```bash
npx playwright install chromium   # once
npm run test:e2e:m1               # M1 smoke (build + preview)
npm run verify:m1                 # unit + build + M1 smoke
```

See `docs/qa/PROBE_M1_VERIFY.md`.

## Build

```bash
npm run build
```

## Layout

See `docs/STRUCTURE.md`. Simulation lives in `src/sim` (no Phaser, no DOM, no `Math.random`).
Content JSON is in `src/data`. Phaser scenes are in `src/render`.

## Data validation

```bash
npm run validate-data
```
