# Hoarder Path & Notoriety — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Alex — valid playstyle that never reignites anyone; wealth, notoriety, patrons, neglect as legacy

---

## 1. Context

Reignite is the intended heroic loop, not the only valid one. A player may **hoard** wealth/spark-adjacent goods, refuse to kindle people, and still finish a run. That path must:

- Have **teeth** (theft, decay, heat) so it is not a free win  
- Feed **notoriety** that cuts both ways through existing ripple / rumor / kin channels  
- Attract **kingdom patrons** (polities with doctrines) who offer deals with obligations, leverage, betrayal  
- Treat **neglect** as systemic (towns die, despair rises) but **not a lose state** — a legitimate ending/legacy wired into succession + async imprint  

Constraints: data-driven, **no archetype branching**; stage **M4–M5**; **M2 untouched** except optional `coin` field.

Cross-refs: doctrine-legitimacy, wilderness-economy, async-legacy-npc, succession UI (never shame quit).

---

## 2. Options

### A — Soft-fail if zero reignites by day N
**−** Punishes the playstyle Alex asked for; not a valid ending.

### B — Separate “merchant mode” UI/sim fork  
**−** Archetype/mode branching; doubles content; violates forgeRule.

### C — Metered hoard + notoriety attractors + patron deals on shared systems *(recommended)*  
Coin/stash as data; notoriety as a dual-edge meter that emits on ripple/rumor/kin; patrons = polity records with `doctrineId`; neglect raises town despair without forcing burnout game-over; succession/imprint carry `hoardLegacy` tags.

---

## 3. Decision

**Choose C.**

---

## 4. Wealth & stash

```typescript
export interface StashSiteDef {
  id: string;
  townId: string;
  siteId?: string;          // optional link to towns.sites
  hideDifficulty: number;   // 0..1 — lowers theft success
  capacity: number;         // coin + goods slots (abstract units)
  guardSlots: number;       // hireable; each needs coin/day or spark/day
  decayPerDawn: number;     // fraction of unguarded goods lost (spoil/rats/rust)
  theftRiskBase: number;    // before notoriety & hideDifficulty
  tags: string[];           // cellar | barrow | wagon | mill_loft …
}

export interface StashRuntime {
  siteId: string;
  coin: number;
  goods: Record<string, number>; // economy-resources ids
  guardsHired: number;
  lastTheftDay?: number;
}
```

**Formulas (binding):**

```
unguarded = max(0, 1 - guardsHired / max(1, guardSlots))
decayLoss = floor(goodsTotal * decayPerDawn * unguarded)

theftP = clamp(
  theftRiskBase
  + 0.35 * notoriety
  - 0.4 * hideDifficulty
  - 0.15 * (guardsHired / max(1, guardSlots)),
  0.02, 0.85
)
// on success: steal fraction (0.1..0.4) * (1 - hideDifficulty*0.5); emit rumor packet
```

Coin is an **optional meter** (M2 may store `player.coin` unused). Goods reuse `economy-resources.json`. Stash acts are generic methods/hooks (`stash_hide`, `stash_guard_hire`, `stash_withdraw`) — **no archetypeId checks**.

---

## 5. Notoriety (cuts both ways)

```
notoriety ∈ [0, 1]
// gains: large stash deposits, flashy spending, patron deals, refused tax, public theft defense
// losses: quiet charity (even without reignite), long dormancy, successful lie-low hooks

dawn:
  notoriety = lerp(notoriety, 0, 0.01)           // slow fade
  heat = notoriety * (0.5 + 0.5 * visibleWealth)

spread (reuse channels — do not invent a fourth bus):
  ripple.harm-like when heat spike (tags: notoriety)
  rumor packets along links with tags rumor|ferry|mill_road
  kin edges copy a diluted heat (weight * 0.5)
```

**Attractor table** (`notoriety.json` → `attractors[]`), each row:

| id | minNotoriety | weight | spawns |
|----|--------------|--------|--------|
| att_thief | 0.25 | high | road encounter / stash attempt |
| att_rival_hoarder | 0.4 | mid | NPC with stash_raid goal |
| att_tax_collector | 0.35 | mid | patronage demand coin |
| att_spy | 0.45 | low | doctrine exposure vs player deals |
| att_patron_demand | 0.5 | mid | active patron obligation tick |
| att_betrayal | 0.6 | low | hired guard / kin turns |
| att_copycat | 0.3 | mid | local NPC starts hoard loop |

Benefits of notoriety: cheaper patron openers, intimidate discounts, copycats can be recruited as guards (high betrayal risk). Costs: the attractors above.

All attractors fire via **data weights + hooks**, never `if (archetypeId)`.

---

## 6. Kingdom patrons (polities × doctrine)

Patrons are **polities**, not people:

```typescript
export interface PatronDef {
  id: string;
  name: string;
  polityTags: string[];       // crown | guild | mill_trust | roadwarden …
  doctrineId: string;         // → doctrines.json (legitimacy model)
  homeTownId: string;
  openNotorietyMin: number;
  deals: PatronDealDef[];
}

export interface PatronDealDef {
  id: string;
  offer: { coin?: number; goods?: Record<string, number>; standing?: number; travelSafeDays?: number };
  obligation: {
    kind: 'tithe' | 'spy_report' | 'deny_reignite' | 'break_route' | 'guard_caravan';
    dueDays: number;
    magnitude: number;
  };
  leverageOnBreak: { notorietyAdd: number; doctrineExposureAdd?: number; betrayalSpawn?: string };
  betrayalRisk: number;       // chance patron breaks first if their doctrine legitimacy low
}
```

**Tie-in:** patron `doctrineId` uses real/perceived/legitimacy from doctrine-legitimacy design. Low patron legitimacy → higher `betrayalRisk`. Player `act_expose_lie` on patron voice can sour deals. Obligations that say `deny_reignite` are **soft** — player may break them (leverage fires); never hard-lock methods.

---

## 7. Spark, despair, neglect = legitimate ending

| Behavior | System effect | Lose? |
|----------|---------------|-------|
| Never reignite; towns’ sites stay cold | `town.despair` rises via existing dawn despair; LOD vitality falls; facilities → abandoned | **No** |
| Hoard while despair high | `cost_town_despair` still drains spark if present; stash safer in dying towns (theft↓, copycat↓) until collapse bandits | No |
| Spark hits 0 | Succession UI unchanged (never shamed). Optional branch copy when `reigniteCount===0 && stashValue>threshold`: same buttons; imprint tags `hoard_legacy` | No — ending |
| Quit via Let it rest | Allowed; imprint may record `ending: 'ash_hoard'` | No |

```
// succession / async imprint extension (M5)
imprint.flags += ['hoard_legacy'] if reigniteCount==0 && peakCoin >= hoardLegacyCoinMin
imprint.notableChoices += { kind: 'neglect_town', townId, despairPeak }
// legacy NPC from imprint: methodTendencies skew away from inspire/carry; toward lie/challenge/stash hooks via DATA WEIGHTS
```

Neglect ending lines live in `lines.json` templates (`{hoardEpitaph}`) — writing pass later.

---

## 8. Staging

| Milestone | Ship |
|-----------|------|
| **M2** | Optional `player.coin` (default 0) / save field only — unused |
| **M4** | `notoriety.json`, `stash-sites.json`, `patrons.json`; dawn notoriety+decay+theft; 1 Ashford cellar stash; 1 sample patron tied to existing doctrine; attractors spawn as encounter weights |
| **M5** | Full attractor cast; patron obligation UI; neglect succession/imprint flags; balance with showcase |

---

## 9. Self-review

No archetype switches. Notoriety reuses ripple/rumor/kin. Patrons reuse doctrines. Neglect ≠ lose. M2 only optional coin. Zero new netcode.

