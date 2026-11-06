# Interaction Model — Core Design Pivot

**Date:** 2026-11-06  
**Skill:** brainstorming  
**Pivot (Alex via Niblet):** *“more complicated than using your spark… through interactions… things are changed or touched.”*  
**HEAD:** ≥ `1db4736` / tip at authoring `9974f3e`  
**Supersedes as verb model:** `2026-11-06-spark-pacing-balance.md` (meter numbers may remain as *strain* defaults until migration).  
**Builds on:** M2 fabric state vector + reaction-curves; M3 methods/ripples/assertions.

---

## 1. Context

M3 still treats **methods as spark-spend verbs** (`challenge`/`shame`/`inspire`/`carry_burden`/`lie` + `sparkCost`). Probe felt a fuse; pacing cuts costs but not the *shape*: one button ≈ one spend ≈ one hit of flame.

Alex’s bar: people and places change because you **did something with someone** — talk, favor, trade, gift, work, promise, return, introduce, stand up — not because you spent a meter.

**Constraints (non-negotiable):** prebaked / deterministic; data-driven; **no `archetypeId ===`** in sim; reuse `setReactionLineSelector` + reaction-curves; Brood `activeBodiesMax: 1`.

---

## 2. Options

| | Approach | Trade-off |
|---|----------|-----------|
| A | Keep methods; rename sparkCost → strain | Too shallow; still “press ability” |
| B | **Interactions as data verbs; spark = courage meter** *(chosen)* | Matches Alex; migrates M3; keeps fabric curves |
| C | Full branching dialogue RPG | Breaks baked dynamism; schedule bomb |

**Decision: B.**

---

## 3. Roles of spark vs interactions

| Concept | Role |
|---------|------|
| **Interaction** | The *only* player verbs that touch world state. Authored in `systems/interactions.json` (future). |
| **Spark** | Player **inner fire / courage** reading (0..sparkMax). Interactions **draw** strain and can **replenish**. **Not** a menu action. Burnout = overextending (spark ≤ burnoutAt) → succession path. |
| **Reignition** | Person outcome from **accumulated touches**, not a single spend. Threshold on `touchScore` + marks. |

```
strain = interaction.baseStrain * situationMul   // situationMul from despair, marks, notoriety — data curves
spark' = clamp(spark - strain + interaction.sparkGain, 0, sparkMax)
// sparkGain > 0 for restful/meaning interactions (work_alongside meaning, kept promise, gift received well)
```

Dawn still applies `recovery_base_dawn` (pacing table) as **courage rest**, not a substitute for interactions.

---

## 4. State vector touch surface

Person runtime (fabric) already exposes drives used by reaction-curves. Interactions write **deltas** into:

| Path | Meaning |
|------|---------|
| `person.flame01` | Warmth toward life (0..1) |
| `person.trust` (toward player) | Willingness |
| `person.mark.*` stacks | hollowness, dependence, resentment, genuine_growth, fragile_hope |
| `person.wound.*` pressure | grief, shame_wound, … |
| `bond[player–person]` | Relationship edge weight |
| `promise[id]` | Kept / broken / pending |
| `presence[person].daysShown` | Showing-up counter |
| `town.despair`, `doctrine.*` | Via ripples only |

**TouchScore** (per person, deterministic):

```
touchScore += Σ |Δflame01|*10 + Σ Δgenuine_growth*4 + Σ keptPromise*5
             + Σ presenceDay*1 + Σ giftAccepted*3 + Σ stoodUp*4
             − Σ brokenPromise*6 − Σ Δhollowness*3 − Σ Δresentment*2
```

**Reignite when:** `touchScore ≥ 24` AND `flame01 ≥ 0.45` AND mark `hollowness` stacks = 0  
(or `genuine_growth` present and `touchScore ≥ 18`). Clear hollow → add `genuine_growth`. Juice `person.reignite`.

**Hollow deepen when:** `touchScore` stall + broken promises / shame without repair.

---

## 5. Interaction types (data)

Each row in future `interactions.json`:

```ts
type InteractionDef = {
  id: string;
  kind: 'conversation' | 'favor' | 'errand' | 'trade' | 'gift'
      | 'work_alongside' | 'promise' | 'show_up' | 'introduce' | 'stand_up';
  tags: string[];           // for fragments / asserts
  baseStrain: number;       // spark draw
  sparkGain: number;        // often 0; meaning work may be +2..+4
  requires?: { bondMin?: number; promiseId?: string; itemTag?: string; otherPersonId?: boolean };
  touch: {                  // applied to target person (and optional other)
    flame01?: number;
    trust?: number;
    marksAdd?: { markId: string; stacks?: number }[];
    marksRemove?: string[];
    woundPressure?: { woundId: string; delta: number }[];
  };
  bondDelta?: number;
  promise?: { op: 'make' | 'keep' | 'break'; idFrom?: 'generated' | string };
  presenceDelta?: number;   // show_up
  introduce?: { thirdPerson: true }; // needs otherPersonId in act
  ripple: 'help' | 'harm' | 'cling' | 'none';
  choiceSetId?: string;     // conversation branches → child interaction ids
};
```

### Catalog (M4/M3 migration targets)

| id | kind | strain | sparkGain | Primary touch (typical) |
|----|------|-------:|----------:|-------------------------|
| `talk_gentle` | conversation | 1 | 0 | trust +0.05, flame01 +0.03 |
| `talk_hard` | conversation | 2 | 0 | trust −0.02, flame01 +0.02 or resentment +1 if refused |
| `talk_empty_cheer` | conversation | 1 | 0 | **assert-fail** if hollowness (no cheerful grief) |
| `favor_ask` / `favor_do` | favor/errand | 2 / 3 | 0 / +2 | bond +1; flame01 +0.05 on do |
| `trade_fair` | trade | 1 | 0 | trust +0.04; town stock Δ |
| `gift_give` | gift | 2 | +1 | flame01 +0.06; fragile_hope +1 possible |
| `work_alongside` | work_alongside | 3 | +3 | flame01 +0.04; meaning tag; labor vitality |
| `promise_make` | promise | 1 | 0 | pending promise |
| `promise_keep` | promise | 2 | +4 | touchScore++ ; trust +0.08 |
| `promise_break` | promise | 1 | −2 strain extra | hollowness/resentment; trust −0.12 |
| `show_up` | show_up | 1 | +1 | presence +1; if presence≥3 without harm, flame01 +0.05 |
| `introduce` | introduce | 2 | 0 | both bonds +0.5; kin strain − |
| `stand_up` | stand_up | 4 | +2 | target trust +0.1; shame pressure −; doctrine exposure if civic |

Conversation **choices** are data: `choiceSetId` lists options → resolve as child interactions (still no LLM).

---

## 6. Ripple rules

After a successful interaction with `ripple ≠ none`:

1. Apply person touch + bond/promise/presence.  
2. If `ripple === 'help'` and marks allow (reuse `ripples.help`): kin edges get `flame01 +0.02` on up to 2 neighbors; chance `crossTown.onGenuineGrowthChance` → letter/rumor packet.  
3. If `harm`: hollowness/resentment path; relapse pressure on links.  
4. If `cling` (dependence): small spark drain (courage bleed), not a “spend action.”  
5. Town: fair trade / work may `despair −0.01`; break promise civic figure → doctrine `exposure +0.02`.  
6. Assertions still gate illegal lines (cheerful grief, dead speak, etc.).

Determinism: all rolls use session rng; same seed + same interaction sequence ⇒ same vector.

---

## 7. Migration (M3 methods → interactions)

| M3 method | Maps to | Retire |
|-----------|---------|--------|
| `inspire` | `talk_gentle` + optional `gift_give` / `promise_keep` chains | `sparkCost` as verb; empty-inspire surcharge becomes low-trust talk fail |
| `carry_burden` | `favor_do` + `work_alongside` | method id as sole kindle button |
| `challenge` | `talk_hard` / `stand_up` | direct flame blast |
| `shame` | `talk_hard` with shame mark weights **or** fail → resentment | shame-as-spend |
| `lie` | `talk_hard` dishonest tag / `promise_break` precursor | lie spark surcharge → trust hit only |

### Forge test-first steps

1. **Failing:** `tests/sim/interaction-touch.test.ts` — `resolveInteraction(state,'work_alongside',personId)` changes `flame01` and `spark` by table; no `methods.sparkCost` path required.  
2. **Failing:** reignite only after `touchScore≥24` across ≥3 distinct kinds.  
3. Implement `src/sim/interactions.ts` + loader for `interactions.json` (Loom authors next).  
4. Adapter: `act('inspire@p')` temporarily expands to interaction recipe (compat), then Probe bots switch to interaction ids.  
5. Retire: UI copy “Spend spark to…”, method-only special-bar expects; keep fragments tagged `method:*` until tags gain `interaction:*`.  
6. Update spark-pacing: costs → `baseStrain`; rest/dawn remain courage regen.

---

## 8. Worked examples (numbers)

Assume Marta: `flame01=0.20`, hollowness=1, trust=0.30, touchScore=0; player spark=88.

### A — Kind path (hollow → reignited, 4 days)

| Day | Interaction | Strain/Gain | Marta Δ | touchScore | Spark |
|-----|-------------|-------------|--------:|----------:|------:|
| 1 | `show_up` | −1 / +1 | presence=1 | 1 | 88 |
| 1 | `talk_gentle` | −1 / 0 | trust 0.35, flame 0.23 | 1.3 | 87 |
| 2 | `show_up` | −1 / +1 | presence=2 | 2.3 | 87 |
| 2 | `favor_do` (errand) | −3 / +2 | flame 0.28, bond+1 | 7.8 | 86 |
| 3 | `work_alongside` | −3 / +3 | flame 0.32 | 12.2 | 86 |
| 3 | `promise_make` (“oven by dusk”) | −1 / 0 | pending | 12.2 | 85 |
| 4 | `promise_keep` | −2 / +4 | trust 0.43, flame 0.40, hollow−1, genuine_growth+1 | **22.2** | 87 |
| 4 | `talk_gentle` | −1 / 0 | flame 0.46 | **24.0** → **reignite** | 86 |

### B — Savage scrape then repair

| Day | Interaction | Effect |
|-----|-------------|--------|
| 1 | `talk_hard` (shame-lean) | resentment+1, trust 0.22, touchScore−2, spark 86 |
| 2 | `show_up` ×2 | presence=2, softens; touchScore 0 |
| 3 | `stand_up` (for her vs gouger) | trust 0.32, flame +0.08, touchScore 8, spark 84 |
| 4–5 | `favor_do` + `promise_keep` | reach touchScore 24 + hollow clear → reignite |

### C — Break promise → deepen hollow

`promise_make` then `promise_break`: trust −0.12, hollowness+1, touchScore −6, spark −1−2; reignite blocked until repair (`favor_do`+`promise_keep`×2).

---

## 9. Acceptance / Probe

- No player action id is “spend spark”; spark only changes as strain/gain side-effect.  
- Reignite never from single interaction.  
- Special-bar moments retarget to interaction sequences (warm loaf = favor/work/gift chain).  
- Matrix: burnout possible from overextending strain, not from 3× inspire.

## 10. Self-review

No LLM; data-shaped; fabric curves stay; assertions kept; archetype branches forbidden; spark-pacing meter math reused as strain/regen defaults; examples numeric.
