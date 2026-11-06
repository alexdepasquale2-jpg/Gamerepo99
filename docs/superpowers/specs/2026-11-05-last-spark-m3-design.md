# Last Spark — M3 Design (Fri · after M2 8 AM · ~½–1 day)

**Depends on:** M2 closed loop + feel pass (`DESIGN.md` §3.5, `plans/2026-11-05-last-spark-m2.md`)  
**Status:** Build-ready for Forge — formulas, examples, tests  
**Schedule (uncapped):** M3 Friday with M4/M5; polish Sat; showcase Sun

**Brainstorm decision:** option C (full build contract) — `docs/superpowers/specs/2026-11-05-m3-worldgen-ripple-brainstorm.md`  
**Implementation plan:** `docs/superpowers/plans/2026-11-05-last-spark-m3.md`

## Goal

Distance and multiplicity feel real: Brood runs **two** active bodies; far towns tick in **LOD**; letters/rumors are discoverable; **Hollow Ford** ships; propagation is deterministic enough to test.

Hard rule unchanged: **no `archetypeId ===` branches** — only traits/hooks/data.

---

## 1. Simultaneous multi-body (data bump)

### Change
`traits.json` → `body_basilisk_brood.activeBodiesMax`: `1` → `2`.

### Runtime (generic embodiment)
- `inhabitant.bodies: { id, townId, siteId, x, y }[]` length = `bodySlots`.
- `activeBodyIds: string[]` length ≤ `activeBodiesMax`.
- Commands take optional `bodyId` (default primary). Movement/methods apply to that body.
- Spark is shared (`sharedSpark: true`).
- At dusk, if unique `townId` among bodies > 1 → run hooks with `when.bodiesInMultipleTowns` (existing `cost_brood_strain`).

### Idle bodies
If `idleBodyProvides` contains `eavesdrop_in_town`, idle body in town T grants `witness` checks for resolves in T (range rules use that body's position).

### Tests
- `activeBodiesMax` from trait, not archetype id string.  
- Two bodies different towns → strain −3 spark at dusk.  
- Idle eavesdrop counts as witness for kind resolve in that town.

---

## 2. Propagation formulas (exact)

### 2.1 Bond / kinship edges (M3 light gen)
On boot and when Hollow Ford spawns, build `world.edges[]`:

```
Edge {
  id, fromPersonId, toPersonId,
  kind: 'cousin' | 'pen_pal' | 'coworker' | 'owes_favor' | 'ferry_debt' | 'teacher_student',
  weight: number,           // 0.2..1.0
  townPath: linkId[]        // links packets should prefer
}
```

**Authored seeds (M2 cast — must exist in data `src/data/kinship.json`):**

| Edge | Kind | Weight | townPath |
|------|------|--------|----------|
| marta_ellison → priya_sen | cousin | 0.7 | `[ashford_lowmere_mill_road]` |
| elias_boone → tom_briggs | coworker | 0.5 | `[ashford_lowmere_ferry]` |
| clara_whitby → harold_finch | owes_favor | 0.6 | `[]` (same town) |
| ruth_calder → jonah_pike | teacher_student | 0.8 | `[]` |
| leon_march → ruth_calder | pen_pal | 0.55 | `[ashford_lowmere_mill_road]` |
| nora_voss → tom_briggs | ferry_debt | 0.75 | `[]` (same town) |

Generator may add ≤1 extra edge per new Hollow Ford person using `history-tables` weights (M3 uses a tiny table in `kinship.json` `generateRules`).

### 2.2 After-resolve local ripple (refine M2)

```
candidates = people in same town where personId != target
             && flame >= ripples.minFlameToRipple (50) OR stalled
if target has genuine_growth && !dependence:
  pick nearest stalled candidate
  flame += floor(uniform(help.flameMin, help.flameMax) * edgeBoost)
  edgeBoost = 1 + 0.5 * maxWeight(edge between target and candidate)  // 1..1.5
  emit ripple.help
if target has hollowness OR resentment:
  pick nearest burning candidate
  flame -= floor(uniform(harm.flameMin, harm.flameMax) * (mark.rippleHarmBonus || 1))
  emit ripple.harm
```

Witness rule (feel pass): Manhattan distance ≤ 3 from acting body to a burning person →  
`genuine_growth` mark weight ×1.15 on kind methods; `hollowness` weight ×1.1 on savage methods.

### 2.3 Cross-town packet emit

```
chance = ripples.crossTown.onGenuineGrowthChance (0.4)
       + 0.25 * maxWeight(edges from target to person in other town)
if roll < chance:
  pick edge with max weight to other town (else preferLinksWithTags)
  delayDays = link.days
  packet = {
    type: 'proof_packet',
    proofId: target.proofId,
    fromPersonId: target.id,
    toTownId: edge.to person's town,
    toPersonId: edge.toPersonId | null,
    arrivesOnDay: state.day + delayDays,
    vitalityDelta: 0
  }
  emit packet.emit
```

Hollowness path:

```
chance = onHollownessChance (0.25)
packet type relapse_pressure, relapseMulAdd 0.1, toTownId random linked town
```

### 2.4 Packet delivery (dawn)

```
for packet in packets where arrivesOnDay <= state.day:
  if proof_packet:
    grant proof unlock in toTownId; if toPersonId: flame += 4; toast letter
    town.vitality += 1
  if relapse_pressure:
    town.relapsePressure *= (1 + relapseMulAdd)
  remove packet
```

### 2.5 Worked examples

**A — Baker's cousin**  
1. Player Carry-reignites Marta → flame ≥ 35, mark `genuine_growth` (or Carry threshold growth).  
2. Local ripple may help Ashford stalled neighbor.  
3. Emit roll: base 0.4 + 0.25×0.7 = **0.575** toward Priya via mill road.  
4. `delayDays = 2` on mill road → dawn day+2: Priya `flame += 4`, letter UI shows *“Marta’s loaf reached the strand.”*, Lowmere vitality +1.  

**B — Shamed man's pen pal**  
1. Player Shames Leon (or Ruth) → `hollowness` lands.  
2. Local ripple may harm a burning neighbor.  
3. Cross-town hollowness chance 0.25 → packet `relapse_pressure` to Ashford (if Leon) along mill road.  
4. On arrival Ashford `relapsePressure *= 1.1`; Ruth’s dawn relapse chance rises. Letter: *“Ink from Lowmere. It smells like giving up.”*

---

## 3. LOD tick rates

| Mode | Who | When | What runs |
|------|-----|------|-----------|
| **Full** | Town player entered this day OR den | every tick / day systems | movement, methods, local ripples, site anim flags |
| **LOD** | All other unlocked towns | **once at dawn** only | (a) apply due packets (b) `lodRelapsePass` (c) vitality drift |

### lodRelapsePass
```
samples = town.lod.relapseSamples ?? 1
for i in samples:
  pick random person in town (weight critical ×2)
  chance = person.relapseBase * markRelapseMul * town.relapsePressure * 0.85  // 0.85 = LOD soft factor
  if roll < chance: flame -= uniform(10, 18)  // milder than full dawn 15..25
vitality = recalculate(town)
vitality += town.lod.driftPerDawn ?? -0.5   // quiet eats empty towns
clamp vitality 0..100
```

Entering a town mid-day: promote to Full for remainder; no retroactive ticks.

**Data:** each town in `towns.json`:
```json
"lod": { "relapseSamples": 1, "driftPerDawn": -0.5, "skipMovement": true }
```
Hollow Ford: `relapseSamples: 1`, `driftPerDawn: -0.75`.

---

## 4. History generation steps (M3 bounded)

Used when spawning Hollow Ford people (and M4 expands).

1. Draw `speciesTag` / role from settlement table.  
2. Draw `woundId` weighted by season/town tags.  
3. Draw `stalledAct` template → fill site noun.  
4. Draw 1 kin edge to existing person using `kinship.generateRules` (prefer cross-town cousin/pen_pal).  
5. If `authored: true` on person — **skip** all steps; never overwrite M2 cast.  
6. Attach default lines from templates in `lines-templates.json` **or** short authored lines in people seed (Hollow Ford: handwrite 3).

M3 ships **handwritten** Hollow Ford trio + kinship edges; generator stub function tested with seed but not required in UI yet.

---

## 5. Discovery UI (letters / rumors)

`src/ui/letters-ui.ts` (ui may import sim read-only + dispatch `openLetter`):

- List delivered packets newest first: title, from person/town, body from `letters.json` templates.  
- Templates keyed by `packetType` + optional `edgeKind`.  
- Opening a letter once/day may run hook `recovery_read_letter` (+1 spark) if present in hooks.  
- Unread count badge on HUD.

`src/data/letters.json` (min 5 templates): proof_packet cousin, proof_packet coworker, relapse_pressure pen_pal, generic proof, generic pressure.

---

## 6. Hollow Ford content

- Town id `hollow_ford`, map ~16×12, unlock Ashford vitality ≥ 50 **or** any packet arrived from Lowmere.  
- 3 people (handwrite in people.json + lines.json).  
- Link `ashford_hollow_ford` days=1, travelSparkCost=3.

---

## 7. Data additions checklist

| File | Action |
|------|--------|
| `traits.json` | brood `activeBodiesMax: 2` |
| `kinship.json` | **new** authored edges + generateRules |
| `letters.json` | **new** templates |
| `towns.json` | LOD fields; `hollow_ford` |
| `people.json` / `lines.json` | +3 Hollow Ford |
| `links.json` | ashford↔hollow_ford |
| `hooks.json` | optional `recovery_read_letter` |
| `ripples.json` | confirm numbers match §2 |

---

## 8. Test cases (Forge must automate)

1. **Multi-body strain:** 2 bodies / 2 towns → dusk spark −3.  
2. **Baker's cousin:** seed RNG so Marta growth emits; after `mill_road.days`, Priya flame +4 and letter exists.  
3. **Shamed pen pal:** hollowness on Leon → pressure packet → Ashford relapsePressure increases.  
4. **LOD:** leave Lowmere; advance 3 dawns without entry; vitality drifts down; no throw.  
5. **Promote:** enter Lowmere after LOD days; full tick works.  
6. **No archetype branch:** grep `src/sim` for `basilisk_brood` equality — forbid except data display names in UI.  
7. **Witness eavesdrop:** idle brood body in Ashford counts witness for Marta kind resolve.

---

## 9. Acceptance (Friday M3)

- Brood dual-active from data; strain + eavesdrop verified.  
- Packet examples A/B reproducible under seeds.  
- LOD + Hollow Ford + letters UI.  
- `npm test && npm run validate` green.

## Out

`activeBodiesMax > 2`, full procgen names, M4 relapse arcs, polish juice (M5).

---

## 10. Gap axis, representation & bridge acts (founding lore → systems)

**Brainstorm decision C:** `docs/superpowers/specs/2026-11-05-founding-lore-gap-design.md`.

### 10.1 Settlement `gapAxis`
Each town has `gapAxis` ∈ [0,1]:
- `0.0` = deep village pole  
- `1.0` = city pole (may be off-map / abstract until later)

**M2 defaults (unchanged feel):** `marrow_den` 0.10 · `ashford` 0.15 · `lowmere` 0.25. Optional abstract `city_reach` at 0.85 can exist as a packet sink only (no playable map in M3).

### 10.2 Cross-gap kinship strain
For edge E between people in towns A and B:

```
gapDelta = abs(town[A].gapAxis - town[B].gapAxis)
crossGap = gapDelta >= 0.35
strainMul = 1 + 1.5 * gapDelta    // e.g. ashford↔lowmere delta 0.10 → mild; ashford↔city 0.70 → heavy
```

Effects when `crossGap`:
- Packet emit chance × `1 / strainMul` (harder for warmth to cross).  
- On hollowness/relapse_pressure packets: `relapseMulAdd *= strainMul`.  
- Letter templates may use edgeKind + `crossGap: true` copy.

Same-side links (Ashford↔Lowmere) stay nearly as M2 numbers.

### 10.3 Representation (civic voices)
People (or player Ivy) with `tags` including `civic_voice` are **representation**.

When a civic_voice in town T:
- crosses reignite threshold with `genuine_growth`: `T.connection += 0.05` (clamp 0..1); `T.standing += 0.05`  
- gains `hollowness`: `T.connection -= 0.08`; `T.standing -= 0.05`  
- burns out / stalls again: `T.standing -= 0.03`

`connection` = how linked the town feels to the wider fabric (affects cross-gap emit: `chance *= (0.7 + 0.6*connection)`).  
`standing` = how much other towns “hear” them (letter unread urgency / vitality echo size).

**M2 seeds:** Ruth Calder, Leon March tagged `civic_voice`. Ivy Quill archetype inherits civic perception already — when playing Ivy, player counts as civic_voice in current town.

### 10.4 Bridge acts (reignite can narrow the gap)
A **bridge act** occurs when:
1. A resolve applies `genuine_growth` to someone with a cross-gap edge, **and** a proof_packet successfully emits along that edge, **or**
2. Player completes `inspire` or `carry_burden` while holding a proof that originated across the gap (proof’s `sourceTown gapAxis` differs by ≥ 0.35).

On bridge act between towns A and B:

```
mid = (gapAxis[A] + gapAxis[B]) / 2
gapAxis[A] += clamp(mid - gapAxis[A], -0.05, 0.05) * 0.5   // pull at most ±0.025
gapAxis[B] += clamp(mid - gapAxis[B], -0.05, 0.05) * 0.5
emit bus event `gap.bridge` for Prism (road dust meeting / letter glow)
```

Ashford starts far from city pole; many sessions needed to matter — intentional.

### 10.5 Tests (add to M3 suite)
8. Cross-gap edge ashford↔city_reach (if present) has strainMul > 1.5.  
9. Ruth genuine_growth raises ashford.connection.  
10. Bridge act pulls ashford.gapAxis and target town slightly together.

### 10.6 M2 compatibility
No required M2 code path. Missing `gapAxis` defaults to `0.2`. Missing `connection`/`standing` default `0.4`. Ashford loop unchanged if bridge/city node absent.

