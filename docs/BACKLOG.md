# Hearthfall Design Backlog

**Decision:** `docs/superpowers/specs/2026-11-05-design-backlog-design.md` (option C)  
**Plans:** M2 `plans/2026-11-05-last-spark-m2.md` · M3 `plans/2026-11-05-last-spark-m3.md`  
**Pillars:** founding-lore-gap · doctrine-legitimacy · wilderness-economy · async-legacy-npc · hoarder-notoriety  
**Team priority:** quality / depth outrank schedule. Rows tagged `depth-reviewed` keep depth; breadth-only work is deferred.  
**Status:** `todo` · `ready` · `in_progress` · `done` · `blocked` · `deferred`  
**Size:** `S` (<2h) · `M` (half-day) · `L` (full day)

| Pri | Item | Milestone | Size | Status | Notes |
|-----|------|-----------|------|--------|-------|
| 1 | Execute M2 plan Tasks 1–9 | M2 | L | ready | Fri 8 AM; quality bar binds |
| 2 | M2 Task 10 feel + memorable-moment tests (≥3/5) | M2 | M | ready | What makes this special A |
| 3 | Wire lines.json + lore hints into UI | M2 | S | ready | choices-that-matter lines |
| 4 | Juice bus events for Prism | M2 | S | ready | |
| 5 | Optional Ashford doctrine load (null-safe) | M2 | S | ready | no economy required |
| 5b | M2 special bar: first-10-min Probe checklist | M2 | S | ready | ≤2m choice / ≤4m consequence |
| 6 | Gap axis / representation / bridge | M3 | M | ready | §10 |
| 7 | Doctrine dawn tick + despair | M3 | M | ready | §11 |
| 8 | Doctrine acts expose/carry/voice | M3 | M | ready | |
| 9 | Doctrine packet spread | M3 | S | ready | |
| 10 | Wilderness economy LOD + stock flows | M3 | M | ready | §12; plan Task 8 |
| 11 | Travel days-while-world-ticks + encounters | M3 | M | ready | |
| 12 | Travel trades hire (carter/courier/gouger min) | M3 | M | ready | travel-trades.json |
| 13 | WorldRenderSnapshot for Prism (`heading: number` deg) | M3 | S | ready | decision note §6; no vec |
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
| 24 | Stash sites + dawn decay/theft (Ashford cellar) | M4 | M | ready | **depth-reviewed** hoarder §4; defer extra caches |
| 25 | Notoriety meter + attractor weights (core 4) | M4 | M | ready | **depth-reviewed**; full 7 attractors UI polish → M5 |
| 26 | One kingdom patron deal loop (mill trust) | M4 | M | ready | **depth-reviewed** patrons×doctrine |
| 27 | Balance / juice / showcase | M5 | M | todo | |
| 28 | World-file export/import (seed+deltas+imprint) | M5 | M | ready | **depth-reviewed** async §4; zero-cost files |
| 29 | Imprint → legacy NPC (tendencies→hooks) | M5 | M | ready | **depth-reviewed** async §5; no archetype branch |
| 30 | Graves / letters / marks from imported deltas | M5 | S | ready | **depth-reviewed** |
| 31 | Neglect/hoard succession + imprint flags | M5 | M | ready | **depth-reviewed** hoarder §7 × async |
| 32 | Remaining notoriety attractors + patron UI | M5 | M | ready | **depth-reviewed** deepen cast, not new systems |
| 33 | Discovery UX: file picker + legend/grave inspect | M6 | M | ready | **depth-reviewed** async discovery |
| 34 | Legacy NPC depth: memory/opinion/routine/goal/gossip | M6 | M | ready | **depth-reviewed** |
| 35 | Share sheet / drag-drop | M7 | S | deferred | breadth; local file path enough until depth lands |
| 36 | Curated starter legacy packs in-repo | M7 | M | deferred | breadth until import depth proven |
| 37 | Optional free static host index | M8 | L | blocked | breadth + **Needs Niblet+Alex clearance before anything public** |
| 38 | Save/audio/playable city pole | post | L | todo | |

**Idle pull:** 1–5b M2 (special bar) → 6–19 M3 → 20–26 M4 (incl. hoarder depth) → 27–32 M5 → 33–34 M6 → deferred 35–36 → 37 M8 (clearance).

## Completeness check
Every row has Pri, Milestone, Size, Status. Wilderness+travel+render folded in (`heading` = degrees only). Async + hoarder tagged **depth-reviewed**; breadth-only share packs/host deferred. M2 only: save `version` + optional `imprint`/`coin`.
