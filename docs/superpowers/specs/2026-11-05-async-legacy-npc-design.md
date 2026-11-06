# Asynchronous Legacy NPCs — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Alex — async multiplayer only (no co-op); stumble into worlds others touched

---

## 1. Context

Players never play together. They can **import worlds others exported** and find former player characters living on as:

- **Legends** (rumor / standing / doctrine echoes)  
- **NPCs** driven by recorded method tendencies & choices  
- **Graves, letters, marks** left on people and places  

**Constraint: zero cost.** Start with **import/export world files** only. Free hosting = **M8 option**, requires **Niblet + Alex clearance** before anything public.

Must not break M2: only a **save `version` field** + **reserved optional `imprint` slot** noted in M2 plan.

No archetype branching — imprint → trait/hook weights like any inhabitant.

---

## 2. Options

### A — Live relay / always-online async
**−** Cost, accounts, moderation; violates zero-cost start.

### B — Steam Workshop-only  
**−** Platform lock; not free-toolchain first.

### C — Versioned world files (seed + delta log + imprint) + local import *(recommended)*  
Deterministic replay of deltas onto seed; former PC becomes NPC via `ProtagonistImprint` → methodTendencies + bondMemories. Discovery via file pick / drag-drop / optional later M8 index. Depth via memory/opinion/routine/goal/gossip tables driven by imprint + existing people systems.

---

## 3. Decision

**Choose C.**

---

## 4. World-snapshot format

```typescript
/** File: *.hearthworld.json (or .hearthworld.zip of json) */
export interface HearthWorldFile {
  format: 'hearthfall.world';
  version: number;           // current = 1
  createdAt: string;         // ISO
  exporterName?: string;     // optional display, not identity auth
  seed: number;
  contentHash: string;       // hash of seed + contentPackIds + deltas (deterministic check)
  contentPackIds: string[];  // data pack versions e.g. ['core@1']
  deltas: WorldDelta[];      // ordered event log
  imprint: ProtagonistImprint | null;
}

export type WorldDelta =
  | { t: 'day'; day: number }
  | { t: 'reignite'; personId: string; methodId: string; marks?: string[]; day: number }
  | { t: 'doctrine'; townId: string; patch: Record<string, number>; day: number }
  | { t: 'route'; routeId: string; broken?: boolean; condition?: number; day: number }
  | { t: 'letter'; packet: object; day: number }
  | { t: 'grave'; personId: string; epitaphId?: string; day: number }
  | { t: 'custom'; key: string; payload: unknown; day: number };

export interface ProtagonistImprint {
  slot: 'reserved';           // M2 reserved optional
  displayName: string;
  speciesTags: string[];
  embodimentTraitId?: string;
  methodTendencies: Record<string, number>; // methodId → 0..1 frequency/affinity
  refusalHookIds: string[];
  notableChoices: { day: number; kind: string; summary: string }[];
  bonds: { personId: string; weight: number; lastMethod?: string }[];
  marksLeft: { personId: string; markId: string; stacks: number }[];
  legendSeed: string;        // for rumor line templates
}
```

### Determinism
`boot(seed, contentPackIds)` then apply `deltas` in order with seeded RNG resets per day boundary. Same file → same world.

### Migration rules
- `version < CURRENT`: run `migrations[v]` sequentially (pure functions).  
- Unknown delta `t`: skip if `compatible:true` flag on file else refuse import with message.  
- Missing contentPack: refuse or load with `degraded:true` (M5+).

M2 save stub:

```typescript
export interface M2SaveFile {
  version: 1;
  imprint?: ProtagonistImprint | null; // reserved optional — unused until M5
  // ... existing state
}
```

---

## 5. Imprint → NPC (no archetype branches)

On import, create inhabitant:

```
npc = assembleFromImprint(imprint)
npc.tags += ['legacy_player', 'legend_candidate']
npc.methodWeights = imprint.methodTendencies  // NPC AI picks methods with this distribution when acting on others in LOD
npc.hooks += mapTendenciesToHooks(imprint)    // e.g. high shame tendency → prefer savage family weights in data table — NOT if(archetype)
```

LOD: legacy NPCs run simplified “act on neighbor” using same method resolve as player but budget-capped. Graves from burnout deltas. Letters already in delta log.

---

## 6. Discovery

| Milestone | How |
|-----------|-----|
| **M5** | Import/export UI; “Load touched world” file picker; list graves/legends in town inspect |
| **M6** | Share sheet copy path; QR/file drag |
| **M7** | Curated starter legacy packs in-repo (fictional) |
| **M8** | Optional free static host index — **needs Niblet+Alex clearance before public** |

Nobody co-habits a live session.

---

## 7. Depth — NPCs that feel real

| Layer | Source |
|-------|--------|
| Memory of player | `bonds[]` + `notableChoices` → inspect lines / gossip |
| Opinions | derived from marksLeft + methodTendencies (savage→wary of kindness, etc.) via data tables |
| Routines | site + lifeLoop from person seed + imprint species |
| Goals | stalledAct / doctrine promises they touched in deltas |
| Gossip | letters + rumor packets generated from `legendSeed` |

Use existing `lines.json` templates with `{legacyName}` placeholders.

---

## 8. Staging

| Milestone | Ship |
|-----------|------|
| **M2** | Save `version:1` + optional `imprint: null` reserved (plan note only / type stub) |
| **M5** | Export/import world file; imprint→NPC; graves/letters visible |
| **M6–7** | Depth tables; share UX |
| **M8** | Free host option — clearance gated |

---

## 8b. Hoarder / neglect imprint

If `reigniteCount===0` and peak coin meets threshold (`notoriety.hoardLegacy`), imprint gains `flags: ['hoard_legacy']` and ending id `ash_hoard` — see `2026-11-05-hoarder-notoriety-design.md`. Same export format; no co-op.

## 9. Self-review

Zero cost path clear. No co-op netcode. Deterministic. No archetype switches. M2 untouched except version+imprint slot.

