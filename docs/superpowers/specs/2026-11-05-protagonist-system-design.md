# Hearthfall: The Last Spark — Data-Driven Protagonist System

**Date:** 2026-11-05  
**Author:** Loom  
**Status:** **M2 LOCKED** — no fixed protagonist; system is the product  
**Supersedes:** fixed “Marrow pending” lock in prior protagonist brainstorm (kept as historical: `2026-11-05-last-spark-protagonist-design.md`)

---

## 1. Decision

The player is **whoever could live here**. At run start they pick or roll any inhabitant the world (or seeded content) can produce — human, ogre, basilisk brood, clerk, midwife, etc. That inhabitant already has history and relationships. Playable difference comes **only** from composable data: traits, hooks, modifiers, refusals.  

**Hard rule for Forge:** *No special-case code paths keyed on archetype id.* Systems read traits/hooks/effects. If a fantasy needs new behavior, add a **hook id** + effect schema support — never `if (archetype === 'marrow')`.

---

## 2. Goals

1. Loop bends around body, perception, method affinities, spark recovery, personal costs, refusals.  
2. Same sim APIs for authored M2 archetypes and future generated inhabitants.  
3. Generational play: burnout/death → continue as someone that character touched.  
4. M2 ships **3** archetypes built purely on the system (showcase, not engines).

---

## 3. Architecture (composable layers)

```
Inhabitant (instance)
  ├─ identity (name, species tag, history, bonds[])
  ├─ embodiment trait ids     → movement / access / body slots
  ├─ perception trait ids     → fear / trust / status as seen by others
  ├─ methodModifiers[]        → per-method strength/weakness muls
  ├─ sparkProfile             → recovery source + rate (+ home site)
  ├─ personalCostHookIds[]    → dusk/dawn/resolve taxes (loneliness = one hook)
  ├─ refusalIds[]             → diegetic refusals (generalized shame-vs-child)
  └─ legacyProfile            → what they leave on burnout for succession
```

All runtime mutation of spark/flame/town/fear goes through the **shared effect schema** (`op` + `target` + optional hook trigger).

### 3.1 Systems (generic)

| System | Reads | Does |
|--------|-------|------|
| Embodiment | footprint, moveTicks, blocked/approach tags, bodySlots, activeBodiesMax, sharedSpark | Path legality, multi-body swap |
| Perception | fear/trust/status baselines + mods | Approach ticks, hide chance, price of entry |
| MethodMods | per-method mul + tags | Scales basePower / sparkCost |
| SparkRecovery | recovery hooks on dawn/rest/witness | Applies effect stacks |
| PersonalCost | cost hooks on triggers | Loneliness, ink integrity, brood strain, … |
| Refusal | refusal defs + when clauses | Diegetic refuse; no disabled-button pattern |
| Generation | bonds, marks, legacyProfile | Pick successor; inherit ember/reputation |

### 3.2 Forbidden

```ts
// FORBIDDEN
if (player.archetypeId === 'marrow') applyLoneliness();
if (player.archetypeId === 'brood') swapBody();
```

```ts
// REQUIRED
for (const hookId of player.personalCostHookIds) runHook(hookId, ctx);
embodiment.swapActiveBody(ctx); // behavior from embodiment trait, any multi-body inhabitant
```

---

## 4. Trait / hook library

Files:

- `archetypes.json` — M2 presets + generator weight templates  
- `traits.json` — embodiment + perception + method modifier bundles  
- `hooks.json` — recovery, personal cost, refusal, legacy hooks (registry)  
- `player.json` — run economy defaults + `activeInhabitantId` / succession state  

Validator: every `*HookId` / trait id / refusal id referenced by an archetype **must** exist in the library (`unknown hook` = fail).

---

## 5. Generational play

**Trigger:** spark ≤ burnout **or** death flag.  

**Eligible successors:** inhabitants (NPC people or other generated agents) with `bondWeight >= successionMinBond` toward the fallen player, where bonds accumulate from:

- successful kind methods (+),  
- `genuine_growth` applied (+),  
- carry_burden completed (+),  
- dependence stacks (eligible but **penalized**),  
- resentment (ineligible if above threshold).

**Pick:** highest `bondWeight * legacyAffinityMul`, seeded RNG among top 3 if tied. Prefer same town, then linked towns.

**Inherited**

| Channel | What |
|---------|------|
| Ember | `sparkStart += legacy.emberGift` (cap sparkMax) |
| Reputation echo | town fear/trust deltas from `legacy.reputationEchoes` |
| Memory | `predecessorId`, short rumor packet on links |
| Marks on world | optional `legacy.worldMarks[]` (fragile_hope on a site, etc.) |
| Dependence path | If winning bond used dependence, grant status trait `inherited_dependence` (not a copy of the mark stacks) |
| Not inherited | personal inventory of methods refusals (successor uses **their** traits) |

**Loop beat:** burnout vignette → “Continue as {name}?” → load successor inhabitant sheet → dawn in their site with ember.

---

## 6. M2 archetypes (data-only showcase)

### A — Marrow (ogre template)
Embodiment large; perception high fear; Carry/Challenge up, Inspire down; den recovery; `cost_loneliness_tax`; shame-child refusal.

### B — Ivy Quill (clerk template)
Human embodiment; high status in civic sites; Shame/Lie/Inspire(document) up; recovery via `recovery_ledger_truth` (dawn if no lies used yesterday); `cost_ink_integrity` when lying; refusal: maybe refuse Carry of corpses / or refuse destroying ledgers — `refusal_burn_ledger`.

### C — The Brood (basilisk multi-body)
`embodiment.mode: multi`, `bodySlots: 3`, **`activeBodiesMax: 1` in M2** (swap control; idle bodies stay as eavesdrop anchors in their towns). Shared spark pool via trait flag. Challenge (gaze) up; `cost_brood_strain` when bodies in different towns; refusal: `refusal_gaze_child` (same diegetic pattern).  

**Why keep Brood (not swap):** multi-body is expressible as generic embodiment fields + one shared-spark flag — no archetype switch. Simultaneous multi-control deferred to M3 via raising `activeBodiesMax` in data only.

---

## 7. World generator hook (M2 light)

M2: archetypes applied to **authored** starter inhabitants (Marrow den, Ivy at Ashford school annex desk, Brood nest site). Generator stub: `spawnFromArchetype(archetypeId, townId)` for New Run roll. Full procgen names/histories = M3.

---

## 8. Self-review checklist

- [x] No fixed protagonist lock  
- [x] No per-archetype code mandate documented  
- [x] Loneliness is a hook instance, not Marrow-only rule  
- [x] Shame-child is a reusable refusal  
- [x] Brood multi-body in data with M2 `activeBodiesMax: 1`  
- [x] Generational eligibility + inheritance defined  
- [x] Validator unknown-hook check
- [x] Succession copy locked
- [x] inherited_dependence defined with decay  

---

## 9. Succession UI & dependence (LOCKED)

**Screen copy (exact):** `Your fire went out. Someone remembers it.`  
**Buttons:** `[Carry it on]` (default) · `[Let it rest]` (quit; never shamed).  

**Dependence:** `dependenceWeightMul: 0.5` retained. Successor chosen via dependence bond receives status trait `inherited_dependence` (method muls + `cost_inherited_dependence_cling` + decay/resolution hooks in `traits.json` / `hooks.json`).

## 10. Lock

M2 design + data contracts are **LOCKED** for Forge implementation plan `docs/superpowers/plans/2026-11-05-last-spark-m2.md`.
