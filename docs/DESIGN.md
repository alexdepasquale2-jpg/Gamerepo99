# Hearthfall: The Last Spark — Systems Design Spec

**Role:** Loom (systems design)  
**Stack:** TypeScript + Phaser (browser) · 32px tiles  
**Repo:** `/workspace/hearthfall`  
**Audience:** Forge · Niblet · Alex  
**Status:** **M2 SPEC LOCKED** · Prototype-first · M2 = one buildable push  
**Protagonist:** **Data-driven — no fixed hero** (Alex decided)  
**Specs:** `docs/superpowers/specs/2026-11-05-protagonist-system-design.md`  
**Archive:** colony-sim at `docs/archive/colony-sim/`; fixed-hero brainstorm kept as history

---

## 1. Pitch & Pillars

The world is ending in **quiet**. Ambition gutters. Towns go still. People stop mid-act.

You are **someone who still lives here** — whoever the run gives you: an ogre between hills, a clerk with a ledger, a basilisk brood sharing one spark, or later any generated inhabitant. You reignite those who have given up with costly acts (challenge, shame, inspire, carry, lie). Methods interact with **wounds**, leave **marks**, spend **spark**. Savage is fast and hollows; kind is slow and drains. Burn out and the world may continue as someone you touched.

**Pillars**

1. **One inhabitant inside the world** — never a colony manager.  
2. **Composable protagonists** — body, perception, method mods, recovery, personal costs, refusals from data only.  
3. **Acts, not dialogue trees.**  
4. **Wound × method chemistry.**  
5. **Marks + cross-town ripples persist.**  
6. **Spark is mortal; generational play on burnout.**  
7. **Shared effect schema everywhere.**

**Tone:** savage but human.

---

## 1.5 Lore & Theme (founding — Alex)

**Brainstorm:** option C — `docs/superpowers/specs/2026-11-05-founding-lore-gap-design.md`.

### History of the drift
The people were once one fabric: city, town, and village shared the same stories of hardship met by passion, spirit, and courage. The change was **slow** — not a war, not a plague with a date. City livelihoods, speech, and days lengthened away from dirt-road time. Villagers and townsfolk could no longer *recognize* the lives of those near the cities as kin to their own. That unrecognizability did three kinds of damage:

1. **Representation broke** — who could speak for whom when the speakers no longer shared a life? Civic voices hollowed or turned inward.  
2. **Families broke** — kin split between city poles and village poles; letters thinned; holidays became rumors.  
3. **The rising stopped** — where courage once rose to meet hardship, a **spiritual void** settled instead. Ambition guttered. Towns went still. That quiet is the game.

### City–village divide as cause of the void
The void is not random entropy. It is the felt gap between lives that used to answer each other. Systems model this as a **gap axis** (M3): settlements and links sit along village↔city; cross-gap kinship carries strain; reigniting people — especially civic voices — and **bridge acts** along cross-gap links can narrow the gap locally. M2 Ashford/Lowmere sit on the village/town side of the axis so the closed loop barely changes.

**Tone reminder:** savage but human — blame the drift, not the villagers for being “behind,” and not the city kin for existing.

### Doctrine & legitimacy (pointer)
Leaders carry **doctrines** (goals/promises). Track **realDelivery** vs **perceivedDelivery**; legitimacy follows perceived; propaganda/control widen the gap; exposing it collapses legitimacy nonlinearly. Full formulas: `specs/2026-11-05-doctrine-legitimacy-design.md` + M3 §11. M2: optional Ashford `doctrine_mill_bread` only — null-safe.

### Wilderness & economy (pointer)
Route-graph economy between settlements; travel takes days while the world ticks; hire trades; Prism `WorldRenderSnapshot` — `specs/2026-11-05-wilderness-economy-design.md`. M2 Ashford `economyOptIn:false`.

### Asynchronous legacy NPCs (pointer)
No co-op. Import/export versioned world files (seed + delta log + protagonist imprint); former PCs live on as legends/NPCs/graves. Zero-cost files first; free host only as M8 option with Niblet+Alex clearance. — `specs/2026-11-05-async-legacy-npc-design.md`. M2: save `version` + reserved optional `imprint` slot only.

### Baked dynamism (pointer)
AI-like lines/gossip without runtime AI: baked anchors, seeded interpolation, constraint fallbacks. Optional M2 flag `bakedDynamismLines` (default off). Pluggable via methods/hooks. — `specs/2026-11-05-baked-dynamism-design.md`.

### Hoarder path & notoriety (pointer)
Valid playstyle that never reignites: stash/coin, dual-edge notoriety, kingdom patrons (polities×doctrine). Neglect raises despair but is not a lose state — legitimate ending/legacy via succession + async imprint. — `specs/2026-11-05-hoarder-notoriety-design.md`. M2: optional `coin` field only.

---

## 2. Protagonist System (core)

See also the dedicated spec. This section is binding for Forge.

### 2.1 Hard rule

> **No special-case code paths per archetype id.**  
> Do not write `if (archetypeId === 'marrow')`.  
> Embodiment, perception, method multipliers, spark recovery, personal costs, refusals, and legacy all execute through **trait ids + hook ids + effects**. New fantasies = new data (and new generic hook triggers if needed), not new branches.

### 2.2 Instance shape

An active player is an **Inhabitant** composed at run start from an archetype template (M2) or generator (M3):

| Layer | Data | Loop effect |
|-------|------|-------------|
| Embodiment | `traits.embodiment` | footprint, move speed, blocked/approach tags, multi-body slots |
| Perception | `traits.perception` | fear/trust/status → approach time, access |
| Method mods | `traits.methodModifiers` | power/cost muls per method |
| Spark profile | `traits.sparkProfiles` | max/start, home, recovery hook list |
| Personal costs | `hooks` kind `personal_cost` | e.g. loneliness tax, ink integrity, brood strain |
| Refusals | `hooks` kind `refusal` | diegetic refuse (visible option → character refuses) |
| Legacy | `hooks` kind `legacy` | succession gifts |

### 2.3 How the loop bends

Whatever you are, the day loop is the same. Modifiers change legality and numbers:

```
Dawn: run spark_recovery hooks whose when{} matches
→ Travel / move using embodiment rules
→ Approach person using perception approachTicks
→ Commit method → evaluate refusal hooks first (diegetic beat if matched)
→ Else resolve with methodMods × wound matrix × marks
→ Personal cost hooks on resolve/dusk
→ Ripples + cross-town packets
→ On burnout/death → Generation system (bonds → successor + legacy hooks)
```

### 2.4 M2 playable archetypes (pure data)

| Id | Showcase bend |
|----|----------------|
| `marrow` | Large body / fear access; Carry strong; `cost_loneliness_tax`; den recovery |
| `ivy_quill` | Civic trust/status; Shame/Lie strong; `cost_ink_integrity`; truth-dawn recovery |
| `basilisk_brood` | `embodiment.mode=multi`, `bodySlots=3`, **`activeBodiesMax=1` in M2** (Forge 595d722; swap control, 3 slots); shared spark; `cost_brood_strain`; idle eavesdrop; gaze refusal on children. M3: +1 via optional trait/hook data, not archetype branch |

Brood kept: multi-body is generic embodiment fields. Simultaneous multi-control = raise `activeBodiesMax` in data (M3).

### 2.5 Refusals (decided)

Shame toward children is a **refusal hook**, not a disabled button. Menu shows the method; on confirm, voice line + tell (coal flicker / gaze avert) + minor effect; ritual does not run. Same pattern for brood gaze-vs-child and Ivy ledger-burn edge cases.

### 2.6 Generational play

On burnout/death: score bonds (kind success, genuine_growth, carry, etc.; **dependence ×0.5** — kept; exclude high resentment). Pick successor among top bonds. Inherit ember spark gift, reputation echoes, rumor memory packet. Successor uses **their** traits/refusals.

**Succession screen (LOCKED copy)**

- Body: `Your fire went out. Someone remembers it.`
- Default focus: **Continue**
- Buttons: `[Carry it on]` (continue) · `[Let it rest]` (quit)
- Quit stays visible and is **never shamed** in copy or UX.

**Dependence successor:** if the winning bond path used dependence stacks, apply status trait `inherited_dependence` (`traits.json`) via hook `apply_inherited_dependence`. While active: Carry cheaper/stronger, Inspire weaker; dusk cling cost if no Carry that day (`cost_inherited_dependence_cling`). **Decays** when any of: 2× genuine_growth applied by player, 3 days without Carry, or spark &gt; 80 — then `resolve_inherited_dependence` (+spark tell) and remove the flag.

---

## 3. Core Day Loop (world)

```
Dawn recovery + relapse + inbound packets
→ Overworld / town enter (approach tags from embodiment)
→ Scout stalled people
→ Method commit / refusal / resolve
→ Local ripple + optional cross-town emit
→ Dusk personal costs + events
→ Burnout? → succession · Town clear? → unlock links
```

Not a dialogue tree. Skill = who, which method, spark budget, mark consequences, who you are.

---

## 3.5 Moment-to-moment (feel pass — binding for M2)

**Brainstorm decision:** option B — `docs/superpowers/specs/2026-11-05-m2-feel-pass-design.md`.

Worth playing means: every reignite has a beat, tension you can see, juice Prism can hang FX on, and systems that spit memorable moments without cutscenes.

### Encounter beat (one reignite)

| Second | Player sees | Chooses / does | Feels |
|--------|-------------|----------------|-------|
| 0–1 | Approach: stalled pose + **give-up tell** (data `tellGivenUp`); spark meter; day-phase tint | Commit to this person or walk past | Weight of picking *them* |
| 1–2 | Inspect: wound name, flame bar, marks as icons, stalled act verb | Open method menu (all methods visible; refusals not greyed) | Reading the wound |
| 2–4 | Method commit: ritual telegraph (contest pulse / labor progress / cut flash) | Hold or cancel only if interruptible | Investment |
| Resolve | Target **reaction line** for that method; spark number **ticks down** visibly; mark icon lands | — | Cost + consequence |
| +1s | If burning: site **lights** (shutter/oven/forge); optional witness murmur | — | Town answering |
| Aftermath | Ripple toast if neighbor helped/harmed; packet icon if cross-town emit | Next walk | World moved |

Ritual lengths from `methods.json` (`ritualTicks`) are the clock inside the beat. Carry should feel long; Shame should feel too fast.

### Tension sources (always on)

1. **Spark drain** — HUD spark lerps on spend; ember zone (<20) pulses crimson; kind methods cost more there.  
2. **Relapse risk** — flame below threshold shows ash crack; dawn relapse rolls telegraph as overnight “cooling” VFX on at-risk people.  
3. **Day clock** — dusk encroaches (palette + tick counter); soft act cap means every reignite spends the day.  
4. **Witnesses** — any burning person in Manhattan range ≤3 is a witness: their presence boosts genuine_growth chance slightly **or** deepens hollowness if the method was savage (data mul on resolve). Loneliness tax fires when kind success has **no** witness/adjacent burning by dusk.

### Juice hooks for Prism (event ids)

Emit sim events (bus) — Prism binds VFX/SFX, no cutscenes:

| Event | When | Suggested juice |
|-------|------|-----------------|
| `spark.spend` | method/refusal cost | Chest-coal dim/flicker |
| `spark.recover` | dawn hooks | Coal brighten |
| `refusal.coal_flicker` | shame-child refuse | Hard flicker + line |
| `person.reaction` | resolve | Speech pip + pose change |
| `mark.applied` | mark land | Icon brand |
| `site.kindle` | cross reignite threshold | Oven/forge/shutter light |
| `town.vitality_delta` | vitality change | Ambient window lights density |
| `ripple.help` / `ripple.harm` | after resolve | Neighbor walk / flinch |
| `packet.emit` | cross-town | Bird/ferry chip on overworld |
| `relapse.dawn` | dawn fail | Ash settle on sprite |
| `succession.open` | burnout | Locked copy screen |

### Day pacing

- Dawn: recovery + relapse cool-down (10–20s player time).  
- Day: 1–3 reignites typical; travel eats ticks.  
- Dusk: loneliness/ink/brood costs resolve; event roll; no new commits after tick 30.  
- Design target: a savage clear of one critical feels cheap and dirty; a kind clear of two feels earned and dangerous to your spark.

### Memorable moments (systems-produced — no cutscenes)

These are **emergent scripts**: if conditions hold, lines + juice fire from data. Binding acceptance lives under **What makes this special** (M2 plan + below).

1. **Warm loaf, cold hill** — Reignite Marta with Carry or Inspire → `site.kindle` bakery → same day kind success + dusk with no adjacent burning → `cost_loneliness_tax` → coal flicker while bread steam VFX still up. *You fed the town; nobody stayed with you.* **Check:** seeded bus has `site.kindle` + dusk spark drop while bakery kindled.  
2. **Chalk after the cut** — Shame Ruth or Challenge with proof → `hollowness` → next dawn relapse mul drops flame; Jonah burning → `ripple.harm`. *You got her standing; the quiet took interest.* **Check:** Ruth marked; dawn2 flame lower; optional `ripple.harm`.  
3. **Nail across the water** — Elias reignite Challenge/Carry → `genuine_growth` → `packet.emit` → Tom proof toast next dawn. *Your forge lit a stranger’s rope.* **Check:** `packet.emit` + Tom inbox/proof by dawn+1.  
4. **Refusal coal** — Shame a child-tagged person → `refusal_shame_child`; method stays listed. **Check:** refusal line/`refusal.coal_flicker`; Shame still in menu.  
5. **Mark comes back** — Land `resentment`/`dependence`; later resolve vs same person changes flameDelta or spark cost. **Check:** second resolve ≠ unmarked baseline.

---

## 4. Tick / Time

Ticks/day `36` (dawn/day/dusk). Ordering: phase → move → ritual → resolve → ripple → dusk hooks → dawn hooks. Pure `src/sim/`; Phaser views. Seeded RNG.

---

## 5. Spark

Defaults in `player.json`; per-inhabitant overrides from spark profile + recovery hooks. Ember zone raises kind costs. `spark <= burnoutAt` → burnout.

---

## 6. Wounds, Methods, Marks, People, Towns

Unchanged chemistry:

- Wounds + matrix in `wounds.json` / `methods.json`  
- Marks in `marks.json`  
- Ashford + Lowmere people handwritten in `people.json`  
- Den hub `marrow_den` remains a **place** any large/den-home profile may use; not Marrow-only code  
- Links include costly early Lowmere fear-road (**decided**)

### Method resolve

```
flameDelta = floor(basePower * woundMul * markMul * methodMod.powerMul * rngFuzz)
spark -= sparkCost * methodMod.sparkCostMul * emberMul
```

---

## 7. Cross-town & events

`links.json` packets; `ripples.json` local + crossTown; events in `events.json` (incl. hill_rumor, den_cold as **when**-gated hooks/effects, not archetype switches).

---

## 8. Shared Effect Schema

```json
{
  "id": "fx_",
  "target": "player.spark | player.perception.trust | person.flame | person.mark | town.fear | town.vitality | successor.sparkStart | link.packet | method.effectiveness | relapse.mul",
  "op": "add | mul | set | grant_mark | remove_mark | emit_packet",
  "value": 1,
  "durationDays": null,
  "tags": []
}
```

Hooks wrap triggers + `when` + effects[].

---

## 9. Data Files

| File | Role |
|------|------|
| `archetypes.json` | M2 presets + succession rules |
| `traits.json` | embodiment, perception, methodModifiers, sparkProfiles |
| `hooks.json` | recovery, personal_cost, refusal, legacy registry |
| `player.json` | selection + run defaults + forgeRule |
| `methods.json` / `wounds.json` / `marks.json` | chemistry |
| `people.json` / `towns.json` / `links.json` | world |
| `proofs.json` / `events.json` / `time.json` / `ripples.json` | content/sim |
| `line-fragments.json` (canonical) / deprecated `lines.json` | dialogue fragments + authored anchors; lines.json retires after Fabric Task G |

Validator fails if any archetype references an unknown hook/trait id.

---

## 10. Milestones (replan 2026-11-05 · quality > schedule)

| Milestone | Focus | Spec / plan |
|-----------|--------|-------------|
| **M1 Foundation** | Done — tick, RNG, bus, tests, build | landed |
| **M2 Fabric** | Prebaked dynamism + seeded worldgen (history, gap-axis settlements, kin/friend/pen-pal, doctrines, biomes, routes, facilities); headless determinism + coherence + dump | `specs/2026-11-05-m2-dynamic-fabric-design.md` · `plans/m2/index.md` (stub: `plans/2026-11-05-m2-fabric.md`) |
| **M3 First playable world** | Walk generated overworld/settlements; methods/marks/spark/succession/travel/encounters/ripples; Probe quality gate; special bar on gen world | `specs/2026-11-05-m3-first-playable-world-design.md` · `plans/m3/index.md` (stub: `plans/2026-11-05-m3-first-playable-world.md`) |
| **M4 Living world** | Off-screen economy, caravans, doctrine competition/collapse, letters/rumors at scale | remap ex-M3/M4 systems |
| **M5 Depth** | Hoarder/kingdom path, legacy NPCs, async world files, generational play | hoarder + async specs |
| **M6 Feel & polish** | Art, juice, audio, menus, saves | Prism |
| **M7 Hardening** | Balance bots, bugs, perf | Probe |
| **M8 Showcase** | Hosted build, trailer, devlog | clearance for public host |

**Ashford is not special** — authored people/lines are **fabric anchors** (fragments canonical). Old town-loop M2 plan **superseded** (`docs/archive/plans/2026-11-05-last-spark-m2.md`).

### M2 Fabric acceptance (headless)
Deterministic `generateWorld(seed)`; coherence asserts pass; reaction selector via `setReactionLineSelector`; dump/inspect session; Brood `activeBodiesMax: 1`; no LLM; no archetype branches.

### Remap (old → new)
| Old | New |
|-----|-----|
| Old M2 town loop | Archived; playable walk → **M3** |
| Old M3 connected/LOD/letters | Split: gen in **M2 Fabric**; play/letters UI scale → **M3/M4** |
| Old M4 living/off-screen | **M4** |
| Old M5 polish/showcase depth | **M5** depth systems; polish → **M6**; showcase → **M8** |

### What makes this special
Systems-produced moments and first-10-min bar apply at **M3** on a **generated world** (anchors preferred when present). See M3 design §5 and plan Task 7. Fabric M2 makes those moments possible via anchors + gen. Probe quality gate binds M3 ship.


## 11. Implementation Notes for Forge

1. Honor `STRUCTURE.md`.  
2. Inhabitant assembler: archetype → trait blobs → hook id lists on player state.  
3. Hook runner: `(hook, ctx) => effects` filtered by `when`.  
4. Refusal UI: always show; on confirm evaluate hooks.  
5. Free toolchain only.

---

## 12. Decisions (LOCKED)

- No fixed protagonist (Alex).  
- Shame vs children = diegetic refusal hook (Niblet).  
- Early Lowmere fear-road stays costly (Niblet).  
- M2 archetypes: Marrow, Ivy, Brood (`activeBodiesMax: 1`).  
- **Milestone replan:** M2 Fabric → M3 playable world → M4 living → M5 depth → M6–M8 (Alex/Niblet 2026-11-05).  
- Dialogue canonical = `line-fragments`; Ashford cast = anchors not fixed scripts.  
- Succession UI copy + default Continue / Quit never shamed (Alex).  
- Dependence bonds keep ×0.5; dependence-chosen successors get `inherited_dependence` with cling cost + decay (Alex).  
- Quality / depth outranks schedule; M2 ships the **What makes this special** bar (Alex / team).  

**Open questions:** none for M2 lock.

---

*End DESIGN.md — Loom · protagonist system*
