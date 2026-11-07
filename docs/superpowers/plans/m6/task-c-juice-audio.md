# Task C: Reignite VFX, audio, leftover `wip` art

> Part of [M6 Feel & Polish](./index.md). Spec: `plans/2026-11-05-spark-reignite-vfx.md`, `docs/art/UI_JUICE_SPEC.md`, `docs/art/ASSET_SHORTLIST.md`.

**Goal:** Finish the reignite moment, add free audio, and settle the leftover `wip` branch work.

**Current state:** `src/render/spark-fx/{reignite,spend,refusal,burnout,shared}.ts` and `feel.ts` already subscribe to bus events `vfx.spark_spent|reignite|refusal|burnout`. Remaining from the VFX plan: color wash, cost-to-self, hit-stop, bloom, frame capture, `UI_JUICE_SPEC.md` update.

## `wip` branch disposition (`origin/wip:wip-patches/`)

| Patch | Touches | Recommendation |
|-------|---------|----------------|
| `prism_despair-reignite-wip.patch` | `render/{feel,overworld-scene,sheet-frames}.ts`, `painters/overworld-paint.ts`, new `warmth-palette.ts`, `tests/render/warmth-palette.test.ts`, `m3-25d-screenshot.spec.ts` | **Adopt selectively**: seed of Task A's `despair-tint` and the color wash. Port by hand onto current render files; do not `git apply` blind. |
| `archive_stash-1.patch` | same render files plus `sim/interaction/*`, `load-data.ts`, `play-session*`, `sim/index.ts`, interaction tests | **Drop the sim parts** (superseded by interaction migration and M4/M5); lift only render/warmth parts not already in patch 3. |
| `archive_stash-2.patch` | `sim/dyn/line-select.ts`, `sim/method-reactions.ts` plus render parts | **Drop**; skim `line-select` for any reaction-line idea worth Task A. |

Record the decision in `docs/art/WIP_DISPOSITION.md`; remove `wip-patches/` from `wip` only with Alex's OK.

**Files:**
- Modify: `src/render/spark-fx/reignite.ts`, `shared.ts`, `src/render/feel.ts`, `docs/art/UI_JUICE_SPEC.md` (add audio section), `CREDITS.md` (new Audio table)
- Create: `src/render/warmth-palette.ts` (from patch 3), `src/audio/{audio-bus,cues,index}.ts` (WebAudio wrapper; cue id -> file; master/music/sfx gain; mute persisted via try/catch localStorage), `assets/audio/*.ogg`
- Tests: `tests/audio/cues.test.ts`, `tests/render/spark-fx-reignite.test.ts`, `tests/render/warmth-palette.test.ts`, `tests/e2e/m6-reignite.spec.ts`

## Tests first

1. Every cue id maps to an existing file under `assets/audio/`, and every file has a `CREDITS.md` row (script-checked; fails on a missing credit).
2. Credits rows list only `CC0`, `CC-BY 4.0`, or public domain (grep test).
3. Audio bus is a no-op without `AudioContext` or before a user gesture (no throw); mute persists.
4. Juice id -> cue table covers Task A's adapter list (spark spend, reignite, refusal flicker, burnout, packet deliver, doctrine collapse, theft); ambient loop warms with `despairTint`.
5. Reignite timeline (FEEL): particles -> wash -> hit-stop -> settle; durations from `FEEL`; a reduced-motion flag shortens shake and hit-stop.
6. Playwright: trigger reignite on a despairing town; screenshots at t=0, mid, end show saturation rising; no console errors with audio blocked.

## Acceptance

- Reignite reads as the game's best moment in the captured frames; audio plays after a gesture and is mutable; credits complete; `wip` decision documented. `npm run validate && npm test && npm run build && npx playwright test tests/e2e/m6-reignite.spec.ts` green.

## Out of scope

Original composed music, voice, new art kits beyond `wip` leftovers (art shortlist stays in M3 docs), mastering, perf budgets (M7).

## Open questions

- Audio source: suggest Kenney (CC0) and OpenGameArt CC0 packs; needs shortlist sign-off before import.
- `archive_stash-1` carries sim changes that may conflict with merged interaction migration; confirm the drop with whoever stashed it.
- Is deleting patches from `origin/wip` allowed, or is `wip` frozen?
