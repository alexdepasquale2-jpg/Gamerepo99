# Playthrough bots — hybrid C (Probe)

**Status:** Approved by Niblet (hybrid C). Target: M2 playable-town bot report by Fri 8 AM ET.
**Skills:** using-superpowers, brainstorming (approach C locked), test-driven-development, verification-before-completion.

## Goal
Headless bots exercise the **public sim API** (no Phaser) across playable archetypes × play styles, measuring feel/balance. Playwright stays UI-smoke only.

## Non-goals
- No `if (archetypeId === …)` in bot or metrics code.
- No commits by Probe — batch handoff to Forge.
- Do not invent Forge’s sim internals; consume public exports only.

## Matrix
- Archetypes (data `m2Playable`): `marrow`, `ivy_quill`, `basilisk_brood`
- Styles (method-family policies, not branches): `savage`, `kind`, `mixed`
- Seeds: fixed list (e.g. 3–5) for reproducibility

## Metrics
| Id | Definition |
|----|------------|
| stuck | No meaningful state fingerprint change for `N` consecutive ticks while actions remain listed empty or identical |
| boredom | ≥ `N` ticks with zero *meaningful* choices (choice set size ≤1 or only no-ops) |
| method_dominance | Max method pick-rate and/or success-rate skew across a run / matrix |
| burnout_rate | Fraction of runs ending in burnout / succession open |
| hollow_vs_reignited | Counts of hollowness marks vs reignite-threshold crossings (from session events) |

Thresholds live in `tests/bots/thresholds.json` (data, not code).

## Public session contract (adapter)
Bots talk only to `BotSession`:

```ts
type BotSession = {
  start(opts: { seed: number; archetypeId: string }): void;
  listActions(): { id: string; family?: string }[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): {
    tick: number;
    spark: number;
    burnedOut: boolean;
    reignitedCount: number;
    hollowCount: number;
    fingerprint: string;
  };
  events(): { type: string; methodId?: string }[];
};
```

`connectBotSession()`:
1. If `src/sim` exports a play-session / methods API (Forge M2), wrap it.
2. Else return `null` and the runner emits `API_PENDING` for the matrix (harness still unit-tested via an in-test fake session).

Style policy picks among `listActions()` by family weights — never by archetype id.

## Layout
```
tests/bots/
  bot-session.ts      # types + connectBotSession
  style-policy.ts     # savage/kind/mixed
  metrics.ts          # pure aggregators
  run-matrix.ts       # matrix driver
  thresholds.json
  *.test.ts
docs/qa/PLAYTHROUGH_BOTS.md  # how to run + report path
docs/qa/reports/              # JSON/MD outputs
```

## Report
`docs/qa/reports/m2-playable-town-bots.md` (+ `.json`) summarizing matrix, metric breaches, API readiness.

## Verification
- `npx vitest run tests/bots` green (TDD)
- `npm test` still green
- Matrix command documents API_PENDING vs real until Forge lands session API
