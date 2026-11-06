# Hearthfall — Visual Language (Generated World · 2.5D v2)

**Owner:** Prism · **Cell size:** 32px (Forge locked; 16px CC0 ×2 NN OK)  
**Tone:** Stardew-cozy + deep-sim grit · dying world · spark costs itself  
**Art lock:** `STYLE_SPEC_2.5D.md` + hero `mockups/2.5d-world-target-v2.png`  
**Palette:** `PALETTE.md` material ramps · warmth `0..1` from sim (per-pixel lerp — **no translucent overlays**)  
**Contract:** Loom `WorldRenderSnapshot` — `docs/superpowers/specs/2026-11-05-wilderness-economy-design.md` §6  
**Hard rule:** Art data is **parametric**. Never key assets to place names. Stamp from `tier`, `biomeId`, `roadTier`, `facility.type`, `warmth`, `state`.

---

## 0. 2.5D bar (from STYLE_SPEC v2)

- ¾ top-down · depth-sorted sprites · soft contact shadows  
- Cliffs: **lip highlight + vertical face + base shadow** (never a flat dark band)  
- Buildings: **side wall + roof overhang + contact shadow**  
- Characters: oversized (≥1.5–2×), outlined, shadowed  
- Huge world: roads off-screen, distant ridge + atmospheric fade, workers/carts  
- Despair↔alive: **per-pixel** desat/cool ↔ chroma/warm  

Scratch PNGs → `mockups/scratch/` only.

---

## 1. Reading order

1. **Warmth** — alive or guttering?  
2. **Tier** — village / town / city?  
3. **Biome** — what land?  
4. **Road tier** — how connected?  
5. **Facilities / mobiles** — economy and traffic  

If two collide, prefer warmth, then tier.

---

## 2. Settlement tiers

| Tier | Typical `gapAxis` | Density | Materials | Edge | Landmark (1 max) | Windows |
|------|-------------------|---------|-----------|------|------------------|---------|
| `village` | ≤0.30 | Sparse; yards; dirt | Timber, thatch/wood roof | None / low fence | Well, bell | Few; glow rare |
| `town` | 0.30–0.65 | Blocks; square | Timber + stone, clay roof | Fence / partial wall | Mill, inn, forge | Common; glow when warm |
| `city` | ≥0.65 | Tight; plazas | Stone/brick, slate | Full wall + gate | Tower, hall | Many; cold glare or gold |

**Stamp keys:**
```
settlement.footprint.<tier>
settlement.wall.<tier>
settlement.landmark.<tier>.<slot>   # civic | work | sacred | market
building.body.<material>
building.roof.<material>
```

| Tier | Building fill | Prop density |
|------|---------------|--------------|
| village | 15–25% | Low |
| town | 35–50% | Mid |
| city | 55–70% | High + wall ring |

---

## 3. Biomes → `biome.<id>`

| Key | Read | Despair | Alive |
|-----|------|---------|-------|
| `biome.river_margin` | Wet edge | Grey mud, still water | Clear teal, reeds |
| `biome.ash_wood` | Timber forest | Bare canopy, litter | Full green, underbrush |
| `biome.mill_heath` | Open grain | Dead scrub | Golden heath, flowers |
| `biome.glare_approach` | City road | Dust, hard light | Cobble verge, thin green |

---

## 4. Roads → `road.<tier>`

| Key | Width (cells) | Material | Despair | Alive |
|-----|---------------|----------|---------|-------|
| `road.track` | 1 | Dirt, weeds | Overgrown | Packed dirt |
| `road.road` | 2 | Dirt + cobble | Cracked, muddy | Clear dual track |
| `road.highway` | 3 | Cobble + posts | Dust / glare | Maintained stone |

---

## 5. Facilities → `facility.<type>.<state>`

Types: `mill` · `lumber_camp` · `waystation` · `mine` · (`farm` future)  
States: `idle` | `working` | `abandoned` (`abandoned` → `warmthEff ≤ 0.15`)

| State | Visual |
|-------|--------|
| idle | Intact, cold chimney, dark panes |
| working | Smoke/glow, motion tell, staffed props |
| abandoned | Boarded, ivy, collapsed prop |

---

## 6. Warmth

```
color = per-pixel lerp(despairRamp, aliveRamp, warmth)   # NEVER a translucent overlay
glow  = window/chimney when warmth high OR facility.working
flora = density × warmth; weeds = density × (1 - warmth)
```

Settlement chip (world map): avg warmth → fill; tier → silhouette; road tier → connectors.  
Spark dual-cue (`#F2B84B` + `#5EC8C8`) is **player-only**.

---

## 7. Mobiles

`caravan.<type>` · `fauna.<id>` · heading `deg` clockwise from north.  
World map: dots/chevrons. Close-up: full outlined sprites.

---

## 8. Two scales

| Scale | Shows |
|-------|--------|
| **World map** | Tier silhouettes, biome fills, road ribbons, facility pips, warmth chips (**no place names**) |
| **Settlement close-up** | 32px walkable; ¾ buildings, windows, gardens, people, depth-sort |

Same 2.5D kit; different stamp density. Prefer ortho square until Loom locks hex.

---

## 9. Kit layout (`docs/art/kit/`)

| File | Contents |
|------|----------|
| `kit-biomes.png` | biome fills × despair/alive |
| `kit-roads.png` | track / road / highway × despair/alive |
| `kit-tiers.png` | village / town / city · ¾ depth |
| `kit-facilities.png` | mill / lumber / waystation / mine × idle/working/abandoned |
| `kit-overview.png` | one-sheet legend |

Primary sources: **Kenney Tiny Town + Tiny Dungeon** CC0 (CREDITS).

---

## 10. Mockups (proofs)

1. `mockups/2.5d-world-target-v2.png` — **depth bar** (cliff/buildings/characters/scale)  
2. `mockups/world-map-generated.png` — tiers × biomes × roads × warmth chips  
3. `mockups/settlement-closeup-despair-alive.png` — town footprint · despair|alive · facilities  

Ashford-named mockups are history only.

---

## 11. Do / Don't

**Do:** stamp from params; Loom keys; warmth via per-pixel lerp; readable tiers at map scale; match STYLE_SPEC v2.  
**Don't:** place-id special cases; feel numbers in sim; overlay desat bands; flat cliff bands; circle characters; OFL-as-CC0.
