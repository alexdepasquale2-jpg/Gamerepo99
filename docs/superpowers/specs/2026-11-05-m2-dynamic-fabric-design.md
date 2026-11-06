# M2 Dynamic Fabric — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Folds in:** `2026-11-05-baked-dynamism-design.md` (AI-like lines, no runtime AI)  
**Milestone:** **M2 Fabric** (new numbering) — engine + worldgen; not yet a playable walk
**Plan:** `plans/m2/index.md` (stub: `plans/2026-11-05-m2-fabric.md`)

---

## 1. Context

Quality and dynamism before a closed Ashford loop. M2 ships a **prebaked dynamism engine** and a **seeded world generator**. Verified headlessly (determinism + coherence + debug dump). Playable walk = **M3**.

Ashford is **not special** — one seeded settlement / possible generator output. Its handwritten people & lines become **authored anchors** inside the fabric.

Constraints: free toolchain; pure `src/sim`; no LLM; no archetypeId branches; Brood `activeBodiesMax: 1` (Forge 595d722); reuse Forge rng/types/loader/hooks/inhabitant; keep Task 6 methods + `setReactionLineSelector`; `createPlaySession` for Probe.

---

## 2. Options

### A — Keep authored Ashford scripts; add fabric later  
**−** Wrong milestone order; delays dynamism.

### B — Runtime LLM for people/lines  
**−** Cost, nondeterminism, breaks seeds.

### C — Baked anchors + seeded gen + interpolation + assertions *(recommended)*  
Offline/authored tables + deterministic worldgen; continuous state blends fragments; coherence layer; Ashford cast = anchors.

---

## 3. Decision

**Choose C.**

---

## 4. Pillars

### (1) Seeded procedural people
From seed + town profile: personality **state vector**, wound, voice anchor, kin/friend/pen-pal edges, stalled acts / history beats. Authored people (`authored: true` or `anchor: true`) **skip overwrite** — used as seeds/anchors.

### (2) Baked anchors + deterministic interpolation
`voice-anchors`, `reaction-curves`, `line-fragments` (canonical). Interpolation driven by continuous state: spark, trust, marks, doctrine legitimacy, notoriety, kin strain — same as baked-dynamism note. Pluggable via `setReactionLineSelector` / methods+hooks.

### (3) Assertion / coherence layer
`voice-constraints` + memory checks; reject contradicting fragments → fallback authored alone-slot fragment. Worldgen asserts: every settlement has ≥1 civic_voice if town size≥hamlet; kin graph connected components bounded; no orphan facilities; gapAxis in range.

### (4) Line / reaction selection
**Canonical source: `line-fragments.json`** (lives under `data/dialogue/` after Tidy move).  
**`lines.json` retires** after consumers migrate — content already mirrored as `authored_anchor` alone-slot fragments. Until migration complete, `lines.json` may remain as deprecated mirror; validator requires fragment coverage ≡ old lines coverage.

### (5) Generated town / world history
Seed → settlements along **gap axis** (village↔city), doctrines, biomes, routes, facilities, kin+friend+pen-pal links, short history event list per town. Debug: `dumpWorld(seed)` JSON/text inspector.

---

## 5. Final `src/data` layout (Tidy move — Forge git-mv after Task 6)

| New path | Contents |
|----------|----------|
| `dialogue/` | `line-fragments.json`, `voice-anchors.json`, `reaction-curves.json`, `voice-constraints.json`, `letters.json` (templates) |
| `people/` | `people.json`, `archetypes.json`, `traits.json`, `kinship.json`, `proofs.json` |
| `world/` | `towns.json`, `links.json`, `map.json`, `biomes.json`, `routes.json`, `road-encounters.json`, `history-tables.json` (new) |
| `economy/` | `economy-resources.json`, `facilities.json`, `travel-trades.json`, `stash-sites.json`, `notoriety.json`, `patrons.json` |
| `systems/` | `methods.json`, `wounds.json`, `marks.json`, `events.json`, `time.json`, `ripples.json`, `doctrines.json`, `player.json`, `scenarios/` (one file per scenario + `index.json`) |
| `hooks/` | existing split (unchanged category files) |

### Old → new mapping

| Old (flat `src/data/`) | New |
|------------------------|-----|
| `lines.json` | **retire** → content in `dialogue/line-fragments.json` |
| `line-fragments.json` | `dialogue/line-fragments.json` |
| `voice-anchors.json` | `dialogue/voice-anchors.json` |
| `reaction-curves.json` | `dialogue/reaction-curves.json` |
| `voice-constraints.json` | `dialogue/voice-constraints.json` |
| `letters.json` | `dialogue/letters.json` |
| `people.json` | `people/people.json` |
| `archetypes.json` | `people/archetypes.json` |
| `traits.json` | `people/traits.json` |
| `kinship.json` | `people/kinship.json` |
| `proofs.json` | `people/proofs.json` |
| `towns.json` | `world/towns.json` |
| `links.json` | `world/links.json` |
| `map.json` | `world/map.json` |
| `biomes.json` | `world/biomes.json` |
| `routes.json` | `world/routes.json` |
| `road-encounters.json` | `world/road-encounters.json` |
| `economy-resources.json` | `economy/economy-resources.json` |
| `facilities.json` | `economy/facilities.json` |
| `travel-trades.json` | `economy/travel-trades.json` |
| `stash-sites.json` | `economy/stash-sites.json` |
| `notoriety.json` | `economy/notoriety.json` |
| `patrons.json` | `economy/patrons.json` |
| `methods.json` … `player.json`, `scenarios/` (one file per scenario + `index.json`), `doctrines.json` | `systems/` |
| `hooks/` | `hooks/` (stay) |

**Validator:** today still flat paths. After Forge git-mv, `scripts/validate/load.mjs` must recurse subfolders (or explicit new REQUIRED paths). Plan Task 0 documents the switch.

---

## 6. Runtime shape (sim)

```ts
type PersonStateVector = {
  warmth: number; bite: number; piety: number; secrecy: number; weariness: number;
  // continuous drives mirrored for curves:
  flame01: number; trust: number; hollowness: number; // …
};

generateWorld(seed: number, opts?: { anchorTownIds?: string[] }): WorldGenResult
dumpWorld(world): string | object
assertCoherence(world): { ok: boolean; violations: string[] }
pickReactionLine via setReactionLineSelector — blend when features.bakedDynamismLines else authored alone fragment
```

`createPlaySession` remains Probe entry (M3 play uses it; M2 may expose `createWorldSession` or same factory with `mode: 'inspect'`).

---

## 7. Staging

| Milestone | Ship |
|-----------|------|
| **M2 Fabric** | Gen + anchors + interpolation + assertions + dump; headless tests; Ashford cast as anchors |
| **M3** | Walk generated world; methods/marks/spark/succession/travel/encounters/ripples; Probe gate |
| **M4** | Off-screen economy, caravans, doctrine competition, letters at scale |
| **M5** | Hoarder/kingdom, legacy NPCs, async files, generational |
| **M6–M8** | Feel, harden, showcase |

---

## 8. Self-review

No LLM. Determinism required. Fragments canonical. Ashford demoted to anchor. Reuses Forge selector seam. No archetype branches.

