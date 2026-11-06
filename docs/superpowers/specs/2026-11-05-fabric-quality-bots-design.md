# Fabric / worldgen quality bots (M2)

**Direction:** Niblet/Alex — M2 Fabric = dynamism + worldgen (headless). Playthrough matrix → M3.

## Multi-seed generator metrics
| Id | Meaning |
|----|---------|
| world_diversity | Pairwise distinctness of world fingerprints; flag near-duplicates |
| history_coherence | Structural/history consistency score (breaks = fail) |
| kin_connectedness | Kin graph connectivity (component size / density) |
| gap_spread | Coverage along city↔village gap axis |
| assertion_violation_rate | Interpolated behavior constraint failures |
| people_diversity | Distinct generated people within/across worlds |
| determinism | Same seed → identical world+lines |
| repeat_line_rate | Duplicate line id/text rate (anti-template) |

## API
`connectFabricApi()` feature-detects `src/sim` / `src/sim/fabric` exports (`createFabric`, `generateWorld`, `generatePeople`, `interpolateLine`, `assertVoice`, …). Missing → `API_PENDING`.

## Reports
`docs/qa/reports/m2-fabric-alive.md` — metrics + unique/alive verdict.
