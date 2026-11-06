# Interaction pacing retune (2026-11-06)

**HEAD:** ≥ `bea8366`.  
**Scope:** `src/data/systems/interactions/` catalog `baseStrain` / `sparkGain` + scoring `pacing` only. No `src/sim` / `src/render`.

## Middle ground (Niblet)

Keep kind replenishment (`work_alongside` 2/4, `talk_gentle` 1/1 and other kind-side retunes). Restore savage/civic cost on `stand_up` **4/2**, `talk_hard` **2/0**, `introduce` **2/0**.

## Strain / gain vs committed catalog

| id | committed | now (net) |
|----|-----------|-----------|
| talk_gentle | 1/0 (−1) | **1/1 (0)** |
| talk_hard | 2/0 (−2) | **2/0 (−2)** restored |
| talk_hard_shame | 2/0 (−2) | **1/0 (−1)** |
| favor_ask | 2/0 (−2) | **1/0 (−1)** |
| favor_do | 3/2 (−1) | **2/2 (0)** |
| gift_give | 2/1 (−1) | **2/2 (0)** |
| work_alongside | 3/3 (0) | **2/4 (+2)** |
| introduce | 2/0 (−2) | **2/0 (−2)** restored |
| stand_up | 4/2 (−2) | **4/2 (−2)** restored |
| show_up / promise_* / trade / empty_cheer | unchanged | unchanged |

## Live Hybrid-C matrix (27 cells, maxTicks 200)

| | Committed-catalog baseline* | Full kind retune | **Middle ground** |
|--|----------------------------:|-----------------:|------------------:|
| burnoutRate | 0.111 (3/27 brood savage) | 0.0 | **0.074** (2/27) |
| median lastTick | 200 | 200 | **200** |
| min lastTick | 46 | 200 | **47** |
| burnouts | basilisk_brood savage | none | **basilisk_brood savage only** |

\*Same HEAD, pre–middle-ground catalog. Target band **5–15%**, mostly savage — **hit**.

## Examples

`examples.json` **spark** expects updated for middle-ground nets (A ends 91; B ends 86 after restored `stand_up`). TouchScore / flame / trust / reignite unchanged; validator replays A/B/C.

## Out of scope

Hooks, player.sparkStart, bot style weights, Forge sim.
