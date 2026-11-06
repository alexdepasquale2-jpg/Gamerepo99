# Hearthfall Design Backlog

**Decision:** `docs/superpowers/specs/2026-11-05-design-backlog-design.md` (option C)  
**Plans:** M2 `plans/2026-11-05-last-spark-m2.md` · M3 `plans/2026-11-05-last-spark-m3.md`  
**Lore / Doctrine / Wilderness / Async:** founding-lore-gap · doctrine-legitimacy · wilderness-economy · async-legacy-npc specs  
**Status:** `todo` · `ready` · `in_progress` · `done` · `blocked`  
**Size:** `S` (<2h) · `M` (half-day) · `L` (full day)  

| Pri | Item | Milestone | Size | Status | Notes |
|-----|------|-----------|------|--------|-------|
| 1 | Execute M2 plan Tasks 1–9 | M2 | L | ready | Fri 8 AM |
| 2 | M2 Task 10 feel + memorable moments | M2 | M | ready | |
| 3 | Wire lines.json + lore hints into UI | M2 | S | ready | |
| 4 | Juice bus events for Prism | M2 | S | ready | |
| 5 | Optional Ashford doctrine load (null-safe) | M2 | S | ready | no economy required |
| 6 | Gap axis / representation / bridge | M3 | M | ready | §10 |
| 7 | Doctrine dawn tick + despair | M3 | M | ready | §11 |
| 8 | Doctrine acts expose/carry/voice | M3 | M | ready | |
| 9 | Doctrine packet spread | M3 | S | ready | |
| 10 | Wilderness economy LOD + stock flows | M3 | M | ready | §12; plan Task 8 |
| 11 | Travel days-while-world-ticks + encounters | M3 | M | ready | |
| 12 | Travel trades hire (carter/courier/gouger min) | M3 | M | ready | travel-trades.json |
| 13 | WorldRenderSnapshot for Prism | M3 | S | ready | decision note §6 |
| 14 | Brood dual bodies | M3 | M | ready | Task 1 |
| 15 | Kinship packets + gap strain | M3 | M | ready | Task 2 |
| 16 | LOD towns | M3 | M | ready | Task 3 |
| 17 | Letters UI | M3 | M | ready | Task 4 |
| 18 | Hollow Ford | M3 | M | ready | Task 5 |
| 19 | M3 test suite (prop/gap/doctrine/economy) | M3 | M | ready | |
| 20 | Doctrine competition cascades | M4 | M | ready | |
| 21 | Wilderness procgen + caravan mobiles | M4 | M | ready | |
| 22 | Full succession multi-gen | M4 | M | ready | |
| 23 | history-tables + archetypes + relapse | M4 | M | ready | |
| 24 | Balance / juice / showcase | M5 | M | todo | |
| 25 | World-file export/import (seed+deltas+imprint) | M5 | M | ready | async-legacy-npc §4; zero-cost files only |
| 26 | Imprint → legacy NPC (tendencies→hooks, no archetype branch) | M5 | M | ready | §5 |
| 27 | Graves / letters / marks from imported deltas visible | M5 | S | ready | |
| 28 | Discovery UX: file picker + legend/grave inspect | M6 | M | ready | §6 |
| 29 | Legacy NPC depth: memory/opinion/routine/goal/gossip tables | M6 | M | ready | §7 |
| 30 | Share sheet / drag-drop / curated starter packs | M7 | M | todo | |
| 31 | Optional free static host index | M8 | L | blocked | **Needs Niblet+Alex clearance before anything public** |
| 32 | Save/audio/playable city pole | post | L | todo | |

**Idle pull:** 1–5 M2 → 6–19 M3 → 20–23 M4 → 24–27 M5 → 28–30 M6/M7 → 31 M8 (clearance).

## Completeness check
Every row has Pri, Milestone, Size, Status. M3 deepening (prop/LOD/history/UI/tests) already in spec; wilderness+travel+render folded in. Async legacy NPCs staged M5+; M2 only gets save `version` + reserved optional `imprint` slot (plan note).
