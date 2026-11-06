# 06 — Blessings and Burdens (Alex core mechanic)

**Date:** 2026-11-06  
**Skill:** brainstorming  
**Spine:** [index](./index.md) · [propagation](./02-propagation.md) · [interactions](../2026-11-06-interaction-model.md) · [M4 letters](../../plans/m4/task-d-letters-rumors.md)  
**Constraints:** Deterministic · prebaked classes/templates · **no runtime AI** · no UI popups · changes real & persistent

---

## 1. Context

A meaningful interaction does **not** finish when the act resolves. It leaves something **unspoken**: a classified experience (kind, leaning, source person, place) stored as faint weights on people and edges. Later, when circumstances align, it **comes to pass**, consuming the unspoken weight. The outcome is a **Blessing** (good) or a **Burden** (bad) — not guaranteed which. Surfacing is **always indirect through people** (never a modal): e.g. a villager says their cousin two towns over called, mood lifted, so the kids’ dance is on after all.

## 2. Options

| | Approach | Trade-off |
|---|----------|-----------|
| A | Instant ripples only (today) | No delayed meaning; Alex bar fails |
| B | **Unspoken weights + seeded come-to-pass + prebaked classes** *(chosen)* | Matches Alex; needs tables + walker |
| C | Freeform LLM memory | Forbidden (runtime AI) |

**Decision: B.** Bounded play-tuning keeps the world from feeling frozen without mush.

## 3. Data shapes

```ts
/** Authored class — Loom */
type UnspokenClass = {
  id: string;                    // e.g. unspoken_kept_promise_warmth
  kind: 'favor' | 'promise' | 'stand' | 'gift' | 'work' | 'betrayal' | 'shame' | 'introduce' | 'reignite';
  leaning: 'blessing' | 'burden' | 'mixed';
  encodeFrom: { interactionIds?: string[]; tagsAny?: string[]; requireReignite?: boolean };
  baseWeight: number;            // 0..1 deposited on encode
  halfLifeDays: number;          // decay
  comeToPass: {
    requireTagsAny?: string[];   // circumstance tags on town/person/day
    minWeight: number;
    baseP: number;               // 0..1 before modifiers
    blessingOutcomeIds: string[];
    burdenOutcomeIds: string[];
    mixedBias?: number;          // added to blessingP when leaning mixed
  };
  deposit: {
    onSourcePerson: number;      // mul of baseWeight
    onPathEdges: number;         // along path to influential/carrier candidates
    onPlaceTown?: number;
  };
};

/** Runtime instance — saveable */
type UnspokenInstance = {
  id: string;                    // unspoken_{seq}_{seedSalt}
  classId: string;
  sourcePersonId: string;
  placeTownId: string;
  encodedDay: number;
  weight: number;                // decays
  edgeIds: string[];             // faint deposits
  personIds: string[];           // faint deposits (excl. pure source if desired)
  consumed: boolean;
  tuningSalt: number;            // from seed+history; stable
};

type ComeToPassOutcome = {
  id: string;
  kind: 'blessing' | 'burden';
  carrierPrefer: 'kin' | 'trade' | 'friendship' | 'influential' | 'same_town';
  fragmentIds: string[];         // indirect lines — never UI chrome
  effects: {
    flame01?: number; trust?: number; despair?: number;
    marksAdd?: { markId: string; stacks?: number }[];
    edgeWeightDelta?: number;    // on carrier path edges
    letterOrRumor?: 'letter' | 'rumor';
  };
};

/** Bounded adaptation — persisted per seed */
type BlessingsBurdensTuning = {
  classId: string;
  pBias: number;                 // clamped
  blessingBias: number;          // clamped
  samples: number;
};
```

Files (Loom later): `systems/unspoken-classes.json`, `systems/come-to-pass-outcomes.json`, `dialogue/fragments/**` tagged `unspoken:*` / `blessing:*` / `burden:*`.

## 4. Encode math

On successful interaction (post-touch, after cascade hook):

```
for class in unspokenClasses where encodeFrom matches:
  w0 = class.baseWeight * situationMul          // situationMul from despair/notoriety curves, data
  deposit source: personWeights[source] += w0 * deposit.onSourcePerson
  walk up to 3 hops toward influential / same-town neighbors:
    edgeWeights[e] += w0 * deposit.onPathEdges * falloff^h
    personWeights[n] += w0 * deposit.onPathEdges * 0.5 * falloff^h
  if deposit.onPlaceTown: townUnspokenWeight[town] += w0 * onPlaceTown
  spawn UnspokenInstance { weight: w0, ... }
```

`falloff` shares social-propagation default (0.55) unless class overrides. Cap active instances per source person (e.g. 5); drop oldest lowest-weight if over.

## 5. Decay

Each dawn (after economy LOD, before or with rumor tick):

```
weight' = weight * 0.5^(1/halfLifeDays)
if weight' < epsilon (0.02): remove instance (fade, not come-to-pass)
```

Faint deposits on edges/people decay at the same rate keyed by instance id (or aggregate townUnspokenWeight with faster half-life).

## 6. Come-to-pass triggers & probability

Dawn + on certain interactions (`show_up`, `talk_gentle`, letter deliver): for each living unspoken with `weight ≥ minWeight` and circumstance tags matched (town festival, kin visit, caravan arrive, doctrine sermon — **prebaked tag sets**):

```
rng = sessionRng.derive(seed, unspoken.id, day, 'comeToPass')
mod = 1 + tuning.pBias + 0.1*(carrierCentrality) - 0.1*townDespair
P = clamp(class.comeToPass.baseP * (weight/baseWeight) * mod, 0.02, 0.85)
if rng.float() < P: consume & resolve outcome
```

Outcome pick:

```
blessingP = 0.5 + (leaning==='blessing' ? 0.25 : leaning==='burden' ? -0.25 : mixedBias)
blessingP += tuning.blessingBias
blessingP = clamp(blessingP, 0.15, 0.85)
pick from blessingOutcomeIds or burdenOutcomeIds via rng.pick(weights)
```

Consumed ⇒ `consumed=true`; clear deposits; apply effects; surface line.

## 7. Outcome tables (authored)

**Blessings (examples):** `dance_for_kids`, `oven_shared`, `debt_forgiven_soft`, `letter_of_thanks`, `shift_cover`.  
**Burdens:** `grudge_retold`, `favor_called_bitter`, `rumor_twist`, `debt_called_in`, `festival_cancelled`.

Each row: fragmentIds (carrier voice), optional letter/rumor emit, meter deltas capped mild (despair ≤ 0.02 unless LOD starve owns larger).

## 8. Indirect surfacing — carrier choice

Never player UI toast. Choose **carrier person** ≠ player:

```
candidates = people on unspoken.personIds ∪ endpoints of unspoken.edgeIds
  ∪ same_town(source) living people
score(c) = edgePathWeight(source→c) * (1+centrality(c)) * toneFit(c, outcome.kind)
pick max score; ties → lowest personId (deterministic)
emit person.reaction / letter with fragment from outcome.fragmentIds
  slots: {cousin, town, mood, act} filled from unspoken + outcome
```

Example line template (data):  
`"{kinLabel} from {otherTown} called this morning — put me in a good mood, so we're doing that dance for the kids after all."`

## 9. Bounded tuning (may / may not adapt)

| May adapt (per seed, persisted) | Cap / rate |
|---------------------------------|------------|
| `tuning.pBias` | ±0.15 max; ±0.02 per come-to-pass sample |
| `tuning.blessingBias` | ±0.10 max; ±0.02 when player “witnesses” outcome (same town / letter read) |
| `samples` | increment; rates scale `1/sqrt(1+samples)` |

| Must not adapt | |
|----------------|--|
| Unspoken class ids, encodeFrom, fragment text | content freeze |
| maxHops, epsilon, UI policy (no popups) | |
| Ashford `economyOptIn`, spark strain tables | other systems |
| Outcome effect sign flip beyond blessing/burden pick | no rewriting burden→blessing ids |

Learning signal: if carrier trust toward player rises after a Blessing → slight `blessingBias+`; if resentment mark applied after a Burden → `blessingBias-`. All clamped.

## 10. Hooks

| System | Hook |
|--------|------|
| Interactions | After `resolveInteraction` success → `encodeUnspoken(...)` |
| Propagation (02) | Cascade may **boost** existing unspoken weights on walked edges (×1.1 cap) instead of only instant marks |
| M4 letters/rumors | Come-to-pass may enqueue `letter`/`rumor` via same walker; Task D mounts templates |
| Dawn | Decay + come-to-pass pass after `tickEconomyLod` |
| Social graph | Deposits need edges; introductions create new deposit paths |

## 11. Forge tests-first

1. Encode: `promise_keep` creates instance with class `unspoken_kept_promise_*`, weight≈baseWeight.  
2. Decay: after `halfLifeDays` dawns, weight ≈ half (±ε).  
3. Come-to-pass: forced circumstance tags + rng stub → consume once; second dawn no double-consume.  
4. Carrier ≠ player; fragment emitted on bus / reaction juice.  
5. Tuning: 20 forced Blessing witnesses move `blessingBias` but never past ±0.10.  
6. No popup event ids; only `person.reaction` / `packet.emit` / `letter.*`.

## 12. Worked examples

### B1 — Dance for the kids (Blessing)

1. Day 2: Player `favor_do` + `talk_gentle` for Marta (Ashford). Encode `unspoken_favor_warmth` on Marta + kin edge to Priya (Lowmere), weight 0.4.  
2. Days 3–6: decay → ~0.28.  
3. Day 7: caravan tag `kin_visit` on Lowmere; come-to-pass P≈0.31 fires.  
4. Carrier Priya (FoF via kin); Blessing outcome `dance_for_kids`.  
5. Line: cousin-from-Ashford called… dance for the kids. Town mood fragment; Marta trust +0.02 persistent.

### B2 — Grudge retold (Burden)

1. Day 1: `talk_hard_shame` on Elias → `unspoken_shame_scar` leaning burden, deposits on rival edge to Tom.  
2. Day 4: doctrine sermon tag; come-to-pass rolls Burden `grudge_retold`.  
3. Carrier Tom tells a third; resentment +1 on listener; rumor packet along trade path; unspoken consumed. Player hears only through Tom’s line — no alert chrome.

## 13. Self-review

No LLM; classes/outcomes/templates prebaked; tuning bounded; persistent save fields; packet-01 dawn order respected; graph spine required for FoF deposits. Terminology: latent = **unspoken**; resolution = **comes to pass**; good = **Blessing**; bad = **Burden**.
