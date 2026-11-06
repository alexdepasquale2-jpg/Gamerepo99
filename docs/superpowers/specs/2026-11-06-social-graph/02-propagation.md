# 02 — Propagation (good & bad)

Effects walk the web with **path-distance falloff**. Same walker for kindness and grudges; sign and mark payloads differ.

## Falloff

```
reach(h) = baseStrength * falloff^h * edgeWeight
stop when h > maxHops (6) or reach < epsilon
```

Defaults (data `social-propagation.json`): `falloff: 0.55`, `maxHops: 6`, `epsilon: 0.02`.

Friends-of-friends = hop 2; still meaningful. Hop 5–6 = whisper only.

## Good cascades

| Trigger (interaction / event) | Payload along edges | Typical marks / meters |
|------------------------------|---------------------|------------------------|
| Reignite, kept promise, stand_up | trust+, flame01 soft | `genuine_growth` witness chance |
| Favor_do / gift / work_alongside | bond unspoken deposit | kin strain − |
| Loyalty (repeat show_up) | presence rumor | fragile_hope |

Prefer `help` ripple kinds; reuse `ripples.crossTown` only after local walk.

## Bad cascades

| Trigger | Payload | Typical |
|---------|---------|---------|
| Betrayal / promise_break | trust−, hollowness | debt edges harden; rival spawn |
| Grudge / talk_hard_shame | resentment | along rival+kin |
| Debt spiral | debt weight ↑ | creditor pressure; despair tick on town if many unpaid |
| Contagious despair | town.despair + tiny | via kin in same town first, then trade |

Cap despair adds so they stay mild vs spark-pacing (`≤ 0.02` per cascade tick unless starve LOD owns the 0.05).

## Introductions

`introduce` interaction (catalog):

1. Ensure edge `friendship` (or `trade`) between player↔A, player↔B already or create weak.  
2. **Add** A↔B edge if missing (`friendship`, low weight).  
3. Shorten paths; may drop mean hops — validator allows post-play drift inside band via regen rules, not mid-run full rewire.

## Rumors

- Travel along edges each dawn LOD (after economy tick or as letter stub):  
  `rumor` packets follow highest-weight unused neighbor, prefer influential sinks.  
- Truth tags from assertions; no LLM text — fragment ids only.  
- Task D letters can mount the same walker.

## Determinism

Same seed + same interaction log ⇒ same cascade multiset. RNG only from session `rng` when choosing among equal-weight neighbors.
