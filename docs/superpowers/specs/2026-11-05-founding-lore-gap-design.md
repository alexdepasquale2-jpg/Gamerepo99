# Founding Lore & Gap Axis — Brainstorm & Decision

**Date:** 2026-11-05  
**Skill:** brainstorming  
**Source:** Alex founding lore (city–village drift → void)

## Context
People were once united. Slowly, city life became unrelatable to village/town life. Representation broke (who speaks for whom). Families split across the divide. Passion/spirit/courage that once rose to meet hardship went quiet — the spiritual void Hearthfall plays in.

M2 Ashford/Lowmere must keep working with **minimal optional** data. BACKLOG/M3 already exist — lore folds in first, then backlog/M3 notes updated (not restarted).

## Options
**A — Lore text only in DESIGN** — zero systems. **−** Theme never pressures play.  
**B — Full city district sim + parliament** — representation as mini-game. **−** Blows M2/M3; conflicts schedule.  
**C — Soft gap axis + strained cross-gap kinship + civic representation + bridge acts** *(recommended)*  
- Settlements get `gapAxis` ∈ [0,1] (0=village/town pole, 1=city pole).  
- M2 cast sits near 0 (Ashford ~0.15, Lowmere ~0.25, den 0.1) so current loop unchanged.  
- Kinship edges that cross a gap delta carry `strainMul`; packets/relapse feel the strain.  
- Civic voices (`tags: ["civic_voice"]`, e.g. Ruth, Leon, Ivy as player) shift town `standing` / `connection` when reignited or hollow.  
- **Bridge act:** when a resolve travels a cross-gap edge (proof packet or intentional Carry/Inspire along that link), narrow local gap (`gapAxis` pull toward midpoint by small ε). Reigniting bridges peoples, not only souls.  

## Decision
**C.** Document in DESIGN Lore & Theme; systematize in M3 world-gen spec; sprinkle writing hints; optional `gap` fields default-safe for M2.

## Self-review
No new M2 towns required. No archetype branches. City pole can stay off-map until M3/M4 (abstract `city_reach` node optional). Bridge ε small (0.02–0.05) so Ashford doesn’t flip genre overnight.
