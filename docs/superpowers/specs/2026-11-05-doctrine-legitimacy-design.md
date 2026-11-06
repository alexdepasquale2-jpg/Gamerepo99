# Doctrine & Legitimacy — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Alex — dynamic political system (doctrine, propaganda, legitimacy collapse)

---

## 1. Context

Settlements have leaders with **doctrines** (policy ideologies = goals + promises). People follow when doctrine is *seen* as working — either real delivery or control/propaganda. Must model **real outcomes** vs **perceived outcomes** separately; **legitimacy** tracks the perceived side. Propaganda/control/lies widen the gap and prop legitimacy; **exposing the gap** causes **nonlinear collapse**. Doctrines spread via ripples/letters/kin. Ties to city–village drift (city promises villagers never feel) and spark (despair when promises fail). Player acts: expose lie, carry promise, become voice — **generic hooks/traits, no archetype branches**. Ivy’s civic trust + Lie strength fit via data.

M2 Ashford loop must not break: **≤1 optional doctrine hook**.

---

## 2. Options

### A — Full politics in M2
Leaders, elections, multi-doctrine UI now. **−** Breaks Fri 8 AM plan; scope bomb.

### B — Flavor text only
Doctrine as blurb on towns. **−** No systemic teeth; Alex’s gap/collapse unused.

### C — Dual-outcome legitimacy engine, staged *(recommended)*
- Data: `doctrines.json` + leader refs on towns.  
- Runtime: `realDelivery`, `perceivedDelivery`, `legitimacy`, `propaganda`, `control`, `exposure`.  
- `legitimacy = f(perceived)`; `gap = perceived - real`; propaganda raises perceived without real; expose collapses legitimacy nonlinearly when gap large.  
- **M2:** one optional Ashford doctrine (`doctrine_mill_bread`) dormant unless `town.doctrineId` read — no required sim branch if null.  
- **M3:** dawn tick for doctrine outcomes; spread along packets/kin; player generic acts as method targets / hooks; despair→spark pressure.  
- **M4:** collapse cascades, doctrine competition, city doctrine bleed across gapAxis.  

---

## 3. Decision

**Choose C.**

### Core formulas (binding)

```
gap = perceivedDelivery - realDelivery          // can be negative if under-promised
legitimacy = clamp(0.15 + 0.7 * perceivedDelivery + 0.15 * control, 0, 1)

// each dawn (full or LOD lighter):
realDelivery += deliverDelta - decayReal        // from kept promises / vitality / civic genuine_growth
perceivedDelivery += propaganda * 0.08 + control * 0.05 + visibleKeep * 0.1 - exposure * 0.2
perceivedDelivery = lerp(perceivedDelivery, realDelivery, 0.05)  // slow truth leak unless propped

// expose act (player):
exposure += exposePower                         // method lie_invert / challenge on doctrine target
if gap > 0.25 && exposure > 0.4:
  legitimacy *= (1 - collapseK * (gap ^ 2))     // nonlinear; collapseK ≈ 2.5
  perceivedDelivery = lerp(perceivedDelivery, realDelivery, 0.5)
  despairPulse = gap * 0.3                      // adds town despair → spark drain / relapse mul
```

### Player acts (generic — hooks, not archetypes)

| Act id | Trigger | Effect |
|--------|---------|--------|
| `act_expose_lie` | Challenge/Shame vs target tagged `doctrine_voice` or doctrine object | +exposure; if Ivy-like `mods` shame/lie strong via traits |
| `act_carry_promise` | Carry/Inspire completing a promise goal | +realDelivery; small +perceived |
| `act_become_voice` | Civic_voice reignite with genuine_growth | may contest leadership / +standing; spreads local doctrine honesty |

Ivy: `perc_civic_clerk` + `mods_ivy` (shame/lie) naturally boost `act_expose_lie` efficacy via methodMods — **no `if ivy`**.

### Drift tie-in
City doctrines (`gapAxis` high) list promises with `feltByMaxGapAxis: 0.4` — villagers with town gapAxis below threshold get `realDelivery` credit **0** for those promises even when city realDelivery rises → structural representation break.

### Spark / despair
`town.despair = clamp(despair + failedPromiseWeight * (1 - realDelivery) + collapsePulse, 0, 1)`  
Dawn: player spark `-= floor(3 * despair)` if in that town (personal_cost hook `cost_town_despair`).

---

## 4. Scope split

| Milestone | Ship |
|-----------|------|
| **M2** | `doctrines.json` + Ashford optional `doctrineId`; schema validated; **no required tick** (null-safe) |
| **M3** | Dawn doctrine tick; spread; three acts; despair hook; formulas + tests |
| **M4** | Collapse cascades; multi-doctrine competition; city bleed |

---

## 5. Self-review

- No archetype branches.  
- M2 plan Tasks 1–10 untouched in requirements; doctrine is additive optional.  
- Aligns with gap axis §10 and civic_voice.

