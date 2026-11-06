# Automated bots (Probe)

## Milestone split (Alex replan)
| Milestone | Bots | Report |
|-----------|------|--------|
| **M2 Fabric** | Generator quality — `tests/bots/fabric/` (world diversity, history, kin, gap, assertions, people distinctness, determinism, anti-template) | `docs/qa/reports/m2-fabric-alive.md` |
| **M3** First playable world | Playthrough matrix below (stuck/boredom/dominance/burnout/hollow) | playable-town / worth-playing (M3) |

Design (fabric): `docs/superpowers/specs/2026-11-05-fabric-quality-bots-design.md`  
Design (playthrough): `docs/superpowers/specs/2026-11-05-playthrough-bots-design.md`

---

# Playthrough bots (hybrid C) — **M3 gate**

**Status:** Live. `connectBotSession()` → `createPlaySession` boots the Hybrid-C matrix (no longer `API_PENDING`). M3 gate report: `docs/qa/reports/m3-worth-playing.md`. Probe commits own QA docs when Alex/Niblet ask.

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
  # M2 fabric / worldgen
  fabric-api.ts           # connectFabricApi feature-detect (src/sim/fabric.ts)
  fabric-metrics.ts       # world/people diversity, history, kin, gap, assertions, …
  fabric-run.ts           # multi-seed suite (API_PENDING | fake | live)
  fabric/fabric-thresholds.json
  fabric-*.test.ts
  # M3 playthrough
  bot-session.ts      # BotSession + connectBotSession feature-detect
  style-policy.ts     # savage/kind/mixed
  metrics.ts          # pure aggregators
  run-matrix.ts       # matrix driver
  thresholds.json
  *.test.ts
docs/qa/reports/m2-fabric-alive.md
docs/qa/reports/m2-playable-town-bots.md   # legacy name; M3 gate
```

## Report
`docs/qa/reports/m3-worth-playing.md` — M3 gate after each real matrix run; legacy `m2-playable-town-bots.md` points here.

## Forge handoff
Probe commits QA docs/reports (and Probe SCHEDULE tab) when Alex/Niblet request a gate run. Harness/`tests/bots/**` still lands via Forge when API-shaped. Reports: `m2-fabric-alive.md`, `m2-playable-town-bots.md` (legacy), `m3-worth-playing.md`.
