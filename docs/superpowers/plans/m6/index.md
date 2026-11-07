# M6 Feel & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After M5's depth systems (headless only), make the game *felt*: surface what the sim already emits through people and color, give saves/menus/world files a UI, and add reignite VFX plus free audio. Owner per DESIGN.md line 294: Prism.

**Architecture:** Presentation only. Renderer and `src/ui/` subscribe to the existing juice/bus events (`pushJuice` in `src/sim/`; spark FX in `src/render/spark-fx/`). No new sim rules. Any sim read goes through `src/sim/index.ts` exports or `world-render-snapshot.ts`.

**Sources (do not contradict):** `docs/DESIGN.md` §2.6 (LOCKED succession copy), line 294; `docs/art/{UI_JUICE_SPEC,VISUAL_LANGUAGE,STYLE_SPEC_2.5D,PALETTE}.md`; `plans/2026-11-05-spark-reignite-vfx.md`, `-generated-world-visual-language.md`, `-overworld-art-shortlist.md`, `-overworld-asset-manifest.md`; M5 specs (async legacy, hoarder).

## Decision

| | Approach | Trade-off |
|---|----------|-----------|
| A | HUD toasts/popups for sim events | Violates "people not popups" |
| B | **Event-to-presentation adapter: juice id -> reaction line / tint / sound cue** *(chosen)* | One table, testable headless, art/audio swap freely |
| C | Rewrite scenes first | Big risk, no new value |

## Global rules (every task)

- Surfacing via people (inspect lines, gossip, tells, color), never popups. Neglect/quitting is never shamed.
- Determinism untouched: presentation must not mutate `SimState` or add `Math.random` to sim paths.
- No runtime AI. Files < ~400 lines.
- Only CC0/free assets, every one credited in `CREDITS.md` with author, license, URL, status.
- Every visual change has a Playwright screenshot check (Chromium preinstalled; `playwright.config.ts` runs `tests/e2e` against `npm run preview` on 4173, 1280x800, workers 1).

## Task order

1. [Task A: Surfacing](./task-a-surfacing.md) (reaction lines, despair color, succession screen)
2. [Task B: Saves and menus](./task-b-saves-menus.md) (independent of A; succession buttons hook into A's screen)
3. [Task C: Juice and audio](./task-c-juice-audio.md) (needs A's event adapter for cue mapping)

## Gate

```
npm run validate && npm test && npm run build
npx playwright test tests/e2e
```

Screenshots written to `docs/qa/reports/m6/` and eyeballed against `docs/art/mockups`.

## Out of scope

Balance/bots/perf -> M7. Static host/index/showcase -> M8 (needs Niblet+Alex). Cloud saves, co-op, new content, runtime AI.

## Cross-task open questions (flagged, not resolved)

1. DESIGN.md line 294 names Prism as M6 owner, and the M5 index defers import/export UI to M6; confirm M6 owns the M5 async import/export UI (Task B assumes yes), though the async spec §6 places it in M5.
2. An older M5 outline remaps polish to M6 and showcase to M8; this plan follows DESIGN.md.
3. Audio is not mentioned in `UI_JUICE_SPEC.md`; the cue list is proposed here and needs sign-off.
