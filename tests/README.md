# Tests

| Command | What it runs |
|---|---|
| `npm run check` | Data validation, typecheck, all unit tests. Run before every commit. |
| `npm run test:e2e` | Builds the game, then every browser spec in `tests/e2e` against `vite preview`. |
| `npm run check:all` | Both of the above. |
| `npm run test:e2e:smoke` | Build + the one-spec overworld smoke test. |
| `npm run test:bots` | Balance/playthrough bots only. |
| `npm run qa:shots` | The e2e suite, writing screenshots into the committed QA folders (`docs/qa`, `artifacts/25d`). |

Layout: `tests/sim` (pure simulation), `tests/ui`, `tests/render`, `tests/bots` (headless playthroughs),
`tests/e2e` (Playwright), `tests/scenarios` (authored moments).

## Browser tests

- Start a game with `startGame(page, { archetype })` from `tests/e2e/support/game.ts`. It opens the title,
  picks the inhabitant and waits for `window.__hearth`, the QA hook defined in
  `src/render/overworld-scene.ts`. It returns the page and console errors it collects; assert that list is
  empty at the end of the test. Drive the game through `hearth(page, (h) => …)` and real key presses.
- Write screenshots under `shotsDir(name, committedDir)`. Normal runs write to `test-results/` (ignored by
  git), so the tree stays clean. Only `npm run qa:shots` refreshes committed evidence.
- Environment settings (see `playwright.config.ts`):
  - `E2E_PORT` sets the preview port. Give each parallel checkout its own port.
  - `E2E_REUSE_SERVER=1` reuses a server that is already running.
  - `PW_CHROMIUM_PATH` points at a Chromium binary when Playwright's own download isn't present. In the
    cloud sandbox use `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Known failures

Five unit tests fail on `main` since the wilderness pass: `goods/wild-nodes`, `map/ladder/scatter`,
`map/nav` ×2, and the `map/stamp-raster` line cap. They are tracked as Foundation node K4. Don't add to
this list, and remove entries as they get fixed.
