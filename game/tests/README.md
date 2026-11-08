# game/tests

Tests for the v2 game in `game/`. The old game's tests (root `tests/`, root `playwright.config.ts`) are separate.

## e2e (Playwright): `game/tests/e2e/*.spec.ts`

```sh
npm run game:e2e                      # build game/ to a temp dir, serve it, run every spec
npm run game:e2e -- trunk-road        # one spec by name
GAME_E2E_PORT=5410 npm run game:e2e   # another port (parallel worktrees)
```

`game/playwright.config.ts` builds with `npm run game:build -- --outDir <tmp>` and serves that build with
`vite preview`, so the specs test what ships. It only matches `*.spec.ts` (vitest owns `*.test.ts`).

| Env | Meaning |
| --- | --- |
| `GAME_E2E_PORT` | server port (default 4183) |
| `GAME_E2E_OUT` | build dir (default `<tmp>/last-spark-game-e2e-<port>`) |
| `GAME_E2E_REUSE=1` | reuse a server already on the port (no rebuild) |
| `GAME_E2E_WORKERS` | parallel browsers (default 2) |
| `PW_CHROMIUM_PATH` | Chromium to launch; otherwise a preinstalled headless shell under `/opt/pw-browsers` if present (never run `playwright install` in the container) |

### How the specs drive the game

- `support.ts` holds the shared bits: the `test` export fails any spec that hits an uncaught page error;
  `bootToPlay` walks the title flow with Enter (Continue when a save exists, else New game → first
  inhabitant → the known world) until `window.__hearth.dev` is up; `dev(page, name, ...args)` calls a QA
  hook; `hearth(page, fn)` runs a function against `window.__hearth` (`session` = the PlaySession).
- Hooks set the stage (teleport, open a ring or the road sheet); the act itself goes through the real DOM
  (ring chips `.ix-chip[data-id]`, sheet buttons `[data-id]`, the touch bar `#hf-touch`), so a dead button
  fails a spec.
- Crossing districts restarts the Phaser game around the same session: wait on `session.district()` and
  `dev.towns()` (see `crossTrunkRoad`), not on a fixed delay.

| Spec | Covers |
| --- | --- |
| `boot` | title menu, Enter-only flow into play on day 1 |
| `person` | a person's ring (Speak → Speak gently), their reply bubble, spark moves |
| `wild-prop` | a tree/rock prop's ring, its verb changes spark or the satchel, once a day |
| `trunk-road` | signpost trunk road out and back, arrival lines, home towns and people restored |
| `realm-map` | the map's realm tab draws, tapping picks another district |
| `room` | enter and leave a building's room |
| `save-load` | saveBlob/loadBlob inside a foreign district; reload → Continue lands there |
| `phone` | Pixel 7 viewport with touch: the touch bar, tap to walk, the Act button opens a ring |
