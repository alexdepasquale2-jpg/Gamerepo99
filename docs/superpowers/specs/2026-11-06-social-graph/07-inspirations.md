# 07 — Narrative inspirations (RimWorld · DF · Songs of Syx)

**Date:** 2026-11-06  
**Skill:** brainstorming  
**Spine:** [index](./index.md) · [web model](./01-model.md) · [propagation](./02-propagation.md) · [worldgen](./03-worldgen.md) · [integration](./04-integration.md) · [Blessings and Burdens](./06-blessings-and-burdens.md) · [fabric](../2026-11-05-m2-dynamic-fabric-design.md) · [interactions](../2026-11-06-interaction-model.md)  
**Constraints:** Deterministic · prebaked · **no runtime AI** · no `archetypeId` branches · bounded tuning (caps/rates) · files &lt; 400 lines

---

## 1. Context

Alex wants the narrative engine to draw on three games without cloning their runtimes:

1. **RimWorld storyteller** — a director that reads sim state and paces tension by picking events.  
2. **Dwarf Fortress** — deep generated history and legends; personal memories and grudges; thoughts/needs driving mood; emergent tragedy.  
3. **Songs of Syx** — large populations whose needs, classes, and unrest drive the story.

We already have the **web** (people/edges/hops/centrality), **Blessings and Burdens** (unspoken → comes to pass as Blessing or Burden), and **fabric** (anchors, gap-poles, history beats, reaction-curves, marks, assertions). This doc maps each inspiration onto those three, with data files, bounds, deliberate skips, and Forge test hooks.

## 2. Options

| | Approach | Trade-off |
|---|----------|-----------|
| A | Three parallel systems (storyteller + memory DB + unrest sim) | Clear 1:1 with sources; fights spark pacing; triple maintenance |
| B | **One Tension Director over web + unspoken + fabric meters** *(chosen)* | Single spine; reuses walkers; denser tables |
| C | Dawn LOD + interaction outcomes only (no director) | Simplest; fails RimWorld pacing bar |

**Decision: B.** One **Tension Director** scores a prebaked beat catalog from web topology, unspoken heat, and fabric/town meters, then fires at most one major beat per dawn window. DF memories/grudges = unspoken classes + rival/debt edges + history beats. SoS needs/classes/unrest = authored need curves aggregated to town meters that feed the same director score.

## 3. Shared spine — Tension Director

```
dawn (after tickEconomyLod, with or after unspoken come-to-pass pass):
  tension = scoreTension(state)          // data weights, clamped
  candidates = beats where requireTags ⊆ state.tags
               AND cooldownOk AND not excludedByAssertions
  weight(b) = b.baseWeight * fit(b, tension, web, unspoken, town)
  pick via sessionRng.derive(seed, day, 'tensionBeat') among top-K
  apply beat.effects; may encode unspoken / walk cascade / emit rumor
```

`scoreTension` (data `systems/tension-director.json`):

| Signal | Source | Typical weight |
|--------|--------|----------------|
| Mean town.despair (player-visible towns) | fabric / economy LOD | + |
| Active unspoken weight (esp. burden-leaning) | 06 | + |
| Recent Blessing rate (rolling N days) | 06 | − (relief) |
| Influential rival-edge density | web centrality × rival | + |
| Days since last major beat | director state | + (hunger) |
| Player spark near burnoutAt | interaction pacing | + (caution: cap so we do not pile on) |

Caps: `tension ∈ [0, 1]`; at most **1** `major` beat / dawn; `minor` whispers ≤ 2; never fire if spark ≤ burnoutAt unless beat tagged `mercy_only`.

No archetypeId reads — beats filter on tags, marks, edge kinds, town meters, centrality flags only.

---

## 4. RimWorld storyteller → Tension Director

### Idea

A director reads colony state (mood, wealth, threats) and picks incidents on a paced curve (Cassandra/Phoebe/Randy styles). Tension rises, then events release or spike it.

### Map to our systems

| RimWorld | Ours |
|----------|------|
| Storyteller personality | Authored `directorProfileId` in seed / scenario (Phoebe-calm, Cassandra-steady, Randy-spiky) — **data rows**, not code branches on archetype |
| Incident queue | `systems/tension-beats.json` catalog |
| Colony wealth / mood | town despair, clearVitality, mean flame01, unspoken burden weight |
| Raid / gift / visitor | Beats that spawn road encounter tags, caravan favor, letter, or doctrine pressure — mount existing M4 hooks |
| Storyteller AI | **Forbidden** — table weights + rng from seed+day only |

Director does **not** invent text; it picks beat ids → fragment / letter / encounter templates already authored.

### Data files & fields

```ts
// systems/tension-director.json
type DirectorProfile = {
  id: string;                    // calm | steady | spiky
  majorIntervalDays: [number, number]; // min,max soft target
  tensionHungerPerDay: number;
  mercyWhenSparkBelow: number;   // usually = burnoutAt from pacing
  maxMinorPerDawn: number;       // ≤2
};

// systems/tension-beats.json
type TensionBeat = {
  id: string;
  tier: 'minor' | 'major';
  baseWeight: number;
  preferTension: [number, number]; // fire when tension in band
  requireTagsAny?: string[];
  forbidTagsAny?: string[];
  web: { preferInfluential?: boolean; edgeKindsAny?: string[]; maxHops?: number };
  unspoken: { preferLeaning?: 'blessing' | 'burden' | 'any'; minTownWeight?: number };
  effects: {
    encodeUnspokenClassId?: string;
    cascade?: 'help' | 'harm' | 'none';
    encounterDensityMul?: number;
    letterTemplateId?: string;
    rumorFragmentIds?: string[];
    despairDelta?: number;       // capped ≤0.02 unless LOD owns starve
    tagsAdd?: string[];
  };
  cooldownDays: number;
};
```

### Determinism & bounds

- Same seed + same interaction/dawn log ⇒ same beat multiset.  
- `preferTension` bands + top-K then rng among equals (lowest beat id tie-break before rng).  
- Despair deltas from beats ≤ 0.02; major beat cooldown ≥ profile.min.  
- Bounded tuning (optional): `profile.tensionHungerPerDay` ±10% max via `BlessingsBurdensTuning`-style rate, or **freeze profiles** (recommended v1 — freeze).

### Deliberately skip

- Randy true-random incident spam; wealth-scaling raid points; pawn-downed emergency chains; UI storyteller picker mid-run.  
- Runtime “AI director” models.

### Forge test hooks

1. Fixture day with tension=0.2 under `calm` → only `minor` candidates; no `major`.  
2. Force tension=0.85 + eligible major → exactly one major; second dawn blocked by cooldown.  
3. Spark ≤ burnoutAt → only `mercy_only` beats.  
4. Determinism: replay log ⇒ identical beat ids.  
5. No import of ML/LLM; tables only.

---

## 5. Dwarf Fortress → history, unspoken, mood

### Idea

Worldgen lays deep history; individuals carry memories and grudges; thoughts and unmet needs swing mood; tragedy emerges from intersecting systems (not scripted cutscenes).

### Map to our systems

| DF | Ours |
|----|------|
| World history / legends | Fabric **history beats** + web-first weave (03); legends = beat ids + fragment cycles, not a separate wiki sim |
| Personal memories | **UnspokenInstance** deposits (06); encode from interactions |
| Grudges | `rival` / `debt` edges + burden-leaning unspoken classes (`unspoken_shame_scar`, betrayal) |
| Thoughts / needs → mood | Fabric **reaction-curves** + marks (hollowness, resentment, fragile_hope) driven by need pressure tables |
| Emergent tragedy | Tension beat + Burden come-to-pass + bad cascade on kin — composed, not authored as one mega-event |
| Legends mode browsing | Out of scope for play; optional Loom dump later |

Needs (data): small set — `food`, `shelter`, `kin_contact`, `dignity`, `work_meaning`. Pressure writes mark stacks / flame01; never free text thoughts.

### Data files & fields

| File | Role |
|------|------|
| `world/history/` beats (existing) | Era rival/debt/friendship seeds at weave |
| `systems/unspoken-classes.json` | Memory classes (favor, shame, promise, …) |
| `systems/come-to-pass-outcomes.json` | Blessing/Burden resolutions |
| `systems/need-pressures.json` | `{ needId, markId?, flame01Delta, despairTownMul, tagsAdd }` |
| `people/social-centrality.json` | Who carries legends/rumors |

```ts
type NeedPressure = {
  id: string;                    // food | kin_contact | dignity | ...
  sample: 'town_stock' | 'presence' | 'mark' | 'edge_kind';
  threshold: number;
  perDawn: { flame01?: number; marksAdd?: { markId: string; stacks?: number }[]; townDespair?: number };
  cap: { townDespair?: number; markStacks?: number }; // hard caps
};
```

### Determinism & bounds

- History weave fixed per seed (03).  
- Need pressures apply after economy LOD; despair adds share LOD caps.  
- Unspoken half-life + active-instance cap (06) bound memory count.  
- No mid-run legend regen; introductions may add edges only.

### Deliberately skip

- Full DF historical figure chronicle UI; poetic sentence generation; syndrome/poison thought spam; necromancy/megabeast scripts; personality facet matrices beyond existing state vector.

### Forge test hooks

1. History beat on fixture seed creates ≥1 rival or debt edge.  
2. `talk_hard_shame` encodes burden-leaning unspoken; come-to-pass can yield `grudge_retold`.  
3. Need `kin_contact` below threshold for N dawns adds mark, capped.  
4. Tragedy composition: promise_break → rival edge → director major beat eligible via tags — deterministic order.  
5. Assertions still reject illegal fragments after need-driven mood swing.

---

## 6. Songs of Syx → populations, class, unrest

### Idea

Large pops with classes and needs; when needs fail, unrest rises and drives raids, coups, migration — story from demographics, not hero scripts.

### Map to our systems

| SoS | Ours |
|-----|------|
| Population / class | People nodes + optional `communityId` (03 offline bake); facility workers / travel trades already class-ish via jobs |
| Needs | Same `need-pressures.json` as DF map; aggregate to **townUnrest01** |
| Unrest → events | townUnrest01 feeds Tension Director + doctrine collapse (M4 C) + contagious despair walk (02) |
| Scale | Soft: focus on towns on web paths player touches; gap-poles stay sparse (fabric) |

```ts
// systems/town-unrest.json
type TownUnrestRules = {
  blend: { despair: number; needFailRate: number; burdenUnspoken: number; rivalDensity: number };
  unrest01Clamp: [0, 1];
  tagsAt: { soft: number; hard: number }; // e.g. 0.4 → tag unrest_soft; 0.7 → unrest_hard
  directorMul: number;           // multiplies major beat weights when unrest_hard
  doctrineExposurePerDawn?: number; // capped
};
```

Unrest is a **derived meter** each dawn (not a second sim). Classes are tags on people/jobs (`tag:labor`, `tag:clerk`, `tag:guard`) — filter beats/needs by tag, **never** `archetypeId ===`.

### Data files & fields

- `systems/town-unrest.json` — blend + thresholds  
- `systems/need-pressures.json` — shared  
- `economy/*` LOD stock already feeds `food`/`shelter` samples  
- Director beats tagged `requireTagsAny: ['unrest_hard']` for coups/flight rumors

### Determinism & bounds

- unrest01 pure function of meters + unspoken weights + rival density.  
- doctrineExposure from unrest ≤ small cap (align M4 C).  
- Director still ≤1 major/dawn even at unrest_hard (weight↑, not spam).

### Deliberately skip

- Pixel-pop pathfinding armies; full class warfare tech tree; city-builder happiness panels; 10k-agent utility AI.

### Forge test hooks

1. Starve LOD raises despair → unrest01 crosses soft tag; director minor pool gains unrest beats.  
2. High rival density + burden unspoken → unrest_hard; major coup-rumor beat eligible.  
3. Clearing despair + Blessing come-to-pass lowers unrest next dawn.  
4. No archetypeId in unrest or beat filter code paths (lint/test).  

---

## 7. Cross-cutting data ownership

| File | Owner | When |
|------|-------|------|
| `systems/tension-director.json` | Loom | After packet-01; with packet-02 graph |
| `systems/tension-beats.json` | Loom | Same |
| `systems/need-pressures.json` | Loom | With Blessings/Burdens data |
| `systems/town-unrest.json` | Loom | Same |
| `systems/unspoken-classes.json` / `come-to-pass-outcomes.json` | Loom | Spec 06 |
| `src/sim/narrative/tension-director.ts` | Forge | After social walk + unspoken runtime |
| Validate: beat refs, tag enums, unrest clamp | Loom script | CI |

## 8. Integration order

1. Packet-01 economy LOD (despair owner).  
2. Social graph walk + centrality (05).  
3. Unspoken encode / come-to-pass (06).  
4. Need pressures + townUnrest01.  
5. Tension Director (this doc) — last so signals exist.

## 9. Self-review

- Approach **B** only; A/C rejected above.  
- No runtime AI; no archetypeId branching.  
- Blessing/Burden + unspoken vocabulary consistent with 06.  
- Caps on despair, majors/dawn, tuning, unrest.  
- Skips listed per inspiration so Forge does not overbuild.
