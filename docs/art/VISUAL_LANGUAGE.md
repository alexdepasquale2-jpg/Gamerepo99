# Hearthfall — Visual Language (Generated World)

**Owner:** Prism · **Cell size:** 32px (Forge locked; 16px CC0 sources ×2 NN OK)  
**Tone:** Stardew-cozy + deep-sim grit · dying world · spark costs itself  
**Palette:** `PALETTE.md` material ramps · warmth `0..1` from sim  
**Contract:** Loom `WorldRenderSnapshot` — `docs/superpowers/specs/2026-11-05-wilderness-economy-design.md` §6  
**Hard rule:** Art data is **parametric**. Never key assets to place names (`ashford`, `lowmere`, …). Stamp from `tier`, `biomeId`, `roadTier`, `facility.type`, `warmth`, `state`.

---

## 1. Reading order (what the eye learns)

1. **Warmth** — is this place alive or guttering? (color, windows, smoke, flora)  
2. **Tier** — village / town / city? (density, materials, walls, landmarks)  
3. **Biome** — what land am I crossing?  
4. **Road tier** — how connected is this place?  
5. **Facilities / mobiles** — economy and traffic  

If two of these collide, prefer warmth, then tier.

---

## 2. Settlement tiers

Map from Loom/data when present: prefer explicit `tier` if added; else derive from `gapAxis` for art stubs only:

| Tier | Typical `gapAxis` | Density | Materials | Edge | Landmark (1 max) | Windows |
|------|-------------------|---------|-----------|------|------------------|---------|
| `village` | ≤0.30 | Sparse; yards; dirt | Timber, thatch/wood roof | None / low fence | Well, bell, net-rack | Few; glow rare |
| `town` | 0.30–0.65 | Blocks; shared square | Timber + stone, clay roof | Fence / partial wall | Mill, inn, school, forge | Common; glow when warm |
| `city` | ≥0.65 | Tight; plazas | Stone/brick, slate roof | Full wall + gate | Tower, desk/hall, glare spire | Many; cold glare or gold |

**Asset / stamp keys (render):**

```
settlement.footprint.<tier>     # stamp recipe, not a place
settlement.wall.<tier>          # none | fence | wall+gate
settlement.landmark.<tier>.<slot>  # slots: civic | work | sacred | market
building.body.<material>        # timber | timber_stone | stone_brick
building.roof.<material>        # thatch | clay | slate
```

Materials escalate with tier; warmth still lerps despair→alive on the same geometry.

**Density recipe (procedural):**

| Tier | Building fill of settlement footprint | Prop density |
|------|----------------------------------------|--------------|
| village | 15–25% | Low |
| town | 35–50% | Mid |
| city | 55–70% | High + wall ring |

---

## 3. Biomes → `biome.<id>`

From `src/data/biomes.json` (extend freely; keys stay `biome.<id>`):

| Key | Read | Despair | Alive |
|-----|------|---------|-------|
| `biome.river_margin` | Wet edge, ferry | Grey mud, still water | Clear teal, reeds |
| `biome.ash_wood` | Timber forest | Bare canopy, litter | Full green, underbrush |
| `biome.mill_heath` | Open grain land | Dead scrub, bleached path | Golden heath, flowers |
| `biome.glare_approach` | City road / extractive | Dust, sparse scrub, hard light | Cobble verge, thin green |

Fill tiles use `PALETTE.md` soil/foliage/water ramps × tile `warmth`.

---

## 4. Roads by tier → `road.<tier>`

| Key | Width (cells) | Material | Despair | Alive |
|-----|---------------|----------|---------|-------|
| `road.track` | 1 | Dirt, weeds | Overgrown, broken | Packed dirt |
| `road.road` | 2 | Dirt + cobble center | Cracked, muddy | Clear dual track |
| `road.highway` | 3 | Cobble + posts | Dust / glare | Maintained stone |

Road choice may follow link importance / gap (village–village → track; town routes → road; city approach → highway). Art never names the towns—only the road tier on the edge.

---

## 5. Facilities → `facility.<type>.<state>`

Types from `facilities.json` **kind** (+ future `farm`):  
`mill` · `lumber_camp` · `waystation` · `mine` · (`farm`)

States: `idle` | `working` | `abandoned`  
Warmth lerps materials; `abandoned` forces `warmthEff ≤ 0.15` + broken overlays.

| State | Visual |
|-------|--------|
| idle | Intact, cold chimney, dark panes |
| working | Smoke/glow, motion tell, staffed props |
| abandoned | Boarded, ivy, collapsed prop |

---

## 6. Warmth / despair → alive

Sim exposes `warmth ∈ [0,1]` on **tiles**, **facilities**, and (settlement aggregate) for map chips.

```
color = lerp(ramp[i], ramp[i+1], warmth)
glow  = window/chimney additive when warmth high OR facility.working
flora = density × warmth; weeds = density × (1 - warmth)
```

**Settlement chip (world map):** average warmth drives fill; tier drives silhouette; road tier draws connectors.

**Spark dual-cue** (`#F2B84B` + `#5EC8C8`) is player-only — not biome chrome.

---

## 7. Mobiles / caravans (Loom keys)

`caravan.<type>` for trades/workers; `fauna.<id>` for wildlife; heading `deg` clockwise from north.  
On world map: simplify to dots/chevrons along roads. On settlement close-up: full sprites.

---

## 8. Two scales

| Scale | Cell meaning | Shows |
|-------|--------------|-------|
| **World map** | Abstract hex/ortho cell ≈ stretch of land | Tier silhouettes, biome fills, road ribbons, facility pips, warmth |
| **Settlement close-up** | 32px walkable cells | Buildings, windows, gardens, people, marks, letters |

Same kit; different stamp density. Prefer **ortho square** until Loom locks hex (`q,r` flag in OVERWORLD_SHORTLIST).

---

## 9. Kit layout (`docs/art/kit/`)

| File | Contents |
|------|----------|
| `kit-biomes.png` | biome fills × despair/alive |
| `kit-roads.png` | track / road / highway × despair/alive |
| `kit-tiers.png` | village / town / city silhouettes + walls/landmarks |
| `kit-facilities.png` | mill / lumber / waystation / mine × idle/working/abandoned tells |
| `kit-overview.png` | one-sheet legend |

Sources: CC0 Kenney + ansimuz + procedural stamps (CREDITS). Painted path/cobble allowed as project-original kit pieces.

---

## 10. Mockups (proofs)

1. `mockups/world-map-generated.png` — several settlements (all three tiers), mixed warmth, roads across biomes. Labels use **tier + warmth**, not place names.  
2. `mockups/settlement-closeup-despair-alive.png` — one **town-tier** footprint, left despair / right alive, facilities + overlays.

Ashford-named mockups are **superseded** as hero refs (kept only as history if present).

---

## 11. Do / Don't

**Do:** stamp from params; keep Loom keys; show impact via warmth; readable tiers at map scale.  
**Don't:** special-case place ids; put feel numbers in sim; use OFL as CC0; skip abandoned/working states.
