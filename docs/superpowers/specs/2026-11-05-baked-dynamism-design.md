# Baked Dynamism (AI-like, no runtime AI) — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Niblet / Alex — core tech pillar: feel alive without LLM calls

---

## 1. Context

Players should feel people **change** with spark, trust, marks, doctrine, notoriety, kin strain — without runtime AI, cloud APIs, or paid models. Must stay **free**, **pure `src/sim`**, **data-driven**, **no archetype branching**. Powers reaction lines now; later gossip, opinions, legacy NPCs (async imprint).

M2 constraint: **optional**, behind a flag; when off, behavior = today’s fixed `lines.json` method/mark strings. Scenarios must pass with flag **off** (unchanged M2).

---

## 2. Options

### A — Runtime LLM / local model for lines
**−** Cost, nondeterminism, not free-toolchain-first, breaks seeded scenarios.

### B — Hand-author every state combo
**−** Combinatorial explosion; still feels static between authored beats.

### C — Baked anchors + seeded interpolation + assertion layer *(recommended)*  
Offline/world-gen tables of voice vectors & tagged fragments; at runtime deterministic blend from continuous state; contradiction checks vs memory with fallback to fixed lines.

---

## 3. Decision

**Choose C.**

---

## 4. Design

### (a) Baked anchor tables (data / offline)

```typescript
/** src/data/voice-anchors.json */
export interface VoiceAnchor {
  id: string;
  personId?: string;          // omit = species/role template
  tags: string[];             // miller | child | civic_voice | legacy_player …
  vector: Record<string, number>; // warmth, bite, piety, secrecy, weariness ∈ [0,1]
}

/** src/data/line-fragments.json */
export interface LineFragment {
  id: string;
  text: string;
  tags: string[];             // method:carry_burden | mark:hollowness | mood:wary …
  weight: number;
  requiresAny?: string[];     // state tags that must be present
  forbidsAny?: string[];
  slot: 'opener' | 'middle' | 'closer' | 'alone'; // alone = full line (M2 min)
}

/** src/data/reaction-curves.json */
export interface ReactionCurve {
  id: string;
  drives: Array<{
    statePath: string;        // person.flame01 | player.trust | person.mark.hollowness | town.doctrine.legitimacy | player.notoriety | kin.strain
    from: number; to: number; // map continuous → curve t
    influence: Partial<Record<string, number>>; // adds to blend weights on fragment tags / vector dims
  }>;
}
```

Generation: authored for M2 cast; M3+ may run a **dev-time** script (still free, offline) to expand fragments — never at player runtime.

### (b) Deterministic seeded interpolation

```
stateTags = deriveTags(person, player, town, kin)   // pure
voice = lerpAnchors(person.anchors, state)          // seeded only for tie-breaks
weights = applyCurves(reactionCurves, state) ⊕ voice
line = pickFragments(fragments, weights, rng(seed, personId, day, methodId))
       || fallbackFixedLine(lines.json, personId, methodId)   // ALWAYS available
```

Same seed + same state → same line. No network.

### (c) Assertion / constraint layer

```typescript
export interface VoiceConstraint {
  id: string;
  personId?: string;
  forbidTagsTogether?: string[][];  // e.g. [['warmth_high','bite_high']] soft
  mustEchoMemory?: Array<{ markId: string; requireFragmentTag: string }>;
  neverContradict?: Array<{ ifMemory: string; forbidFragmentTag: string }>;
}
```

On pick: if candidate contradicts `person.memory` / recent marks → reject → next weight → else **fallback fixed line**. Log `line.fallback` bus id when fallback used (Probe can count).

### (d) Legacy NPCs, gossip, opinions

| Consumer | How |
|----------|-----|
| Legacy NPC (async imprint) | Imprint supplies `vector` + methodTendencies as curve drives; fragments tagged `legacy` |
| Gossip | Fragments `slot:alone` + tags `gossip`/`opinion`; kin strain raises bite weight |
| Opinions | Derived tag bag on person (`opinions.json` later); curves read it — no archetype switch |

---

## 4b. Pluggable line selector (Forge contract)

Forge keeps reaction-line selection **pluggable through methods + hooks** (not a hard-coded `lines.json` read inside resolve). Loom’s picker is a pure function Forge may wire as:

```ts
// suggested export — Forge names may vary; adapter lives beside methods/hooks
pickReactionLine(ctx: {
  personId: string;
  methodId: string;
  seed: number;
  state: /* continuous drives */;
  features: { bakedDynamismLines: boolean };
}): { lineId: string; text: string; source: 'fixed' | 'blend' | 'fallback' }
```

- Flag **off** → selector returns fixed `lines.json` (source:`fixed`) — M2 unchanged.
- Flag **on** → blend anchors/fragments/curves; on constraint fail → same fixed line (source:`fallback`).
- Hooks may override via effect `target: "line.pick"` / grant fragment tags — **no archetypeId branches**.

## 5. Minimal M2 (optional flag)

`player.json` / boot opts:

```json
"features": { "bakedDynamismLines": false }
```

When **false** (default): `pickReactionLine` returns `lines.json` people[id].methods[methodId] exactly as today.

When **true**: blend using `voice-anchors` + `line-fragments` (M2 ships **alone**-slot fragments that mirror fixed lines + 1–2 variants per Ashford person×method) + one global reaction-curve; constraints minimal; fallback = fixed line.

**Optional M2 plan task** only — must raise quality (variants feel state-aware) without breaking scenarios (scenarios assert bus/marks/flame; line text assertions use `lineIdAny` / fallback-safe checks).

---

## 6. Staging

| Milestone | Ship |
|-----------|------|
| **M2** | Flag default off; schema + Ashford fragment stubs; optional picker behind flag; scenarios pass flag-off |
| **M3** | Curves for doctrine/kin; gossip fragment tags; letter body blend |
| **M5** | Legacy imprint → vector; opinion tables |

---

## 7. Self-review

No LLM. Deterministic. Fallback preserves M2. No archetypeId branches — tags/traits/hooks only.

