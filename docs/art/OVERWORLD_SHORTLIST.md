# Hearthfall — Overworld / Wilderness CC0 Shortlist (M3/M4)

**Owner:** Prism · **Queued after** M2 art lock + VFX + UI juice  
**Engine:** Phaser 3 · **Tile cells:** 32px (Forge)  
**Warmth:** render lerps despair→alive from `warmth ∈ [0,1]` (see `PALETTE.md` material ramps)  
**Contract:** Loom `WorldRenderSnapshot` in `docs/superpowers/specs/2026-11-05-wilderness-economy-design.md` §6  

**Status:** shortlisted, not imported · URLs verified HTTP 200 + CC0 (2026-11-05)

---

## 0. Grid flag (hex vs square) — ACTION FOR LOOM

`TileRenderView` fields are named **`q, r`** (axial-hex convention) but comments say “tile column / tile row.”

| Fact | Implication |
|------|-------------|
| Every pack below is **square** orthographic (16×16 or 32×32) | No native hex tiles in the CC0 shortlist |
| If overworld is **hex** | Render must hex-mask / pointy-top project square tiles into hex cells, or Loom renames to ortho `x,y` |
| If overworld is **ortho square** | Treat `q→col`, `r→row`; no projection needed |

**Prism recommendation:** Prefer **ortho square** for M3 (matches CC0 supply + Ashford 32px cells). If hex is required, say so explicitly and Prism will add a hex mask pass — do **not** expect hex-native CC0 packs.

**Heading (final):** `heading.kind = 'deg'` only — degrees clockwise from north (`0=N`, `90=E`). Ignore draft `vec` variant.

---

## 1. Schema note for Loom (do not edit Loom files — copy if useful)

Render reads a read-only snapshot. Proposed TypeScript mirror of §6 with heading locked + asset key helpers:

```typescript
/** Warmth = 1 - despair (clamped). Render-only lerp; never stored as color in sim. */
export type Warmth01 = number; // 0..1

export type FacilityRenderState = 'idle' | 'working' | 'abandoned';
export type AgentRenderState = 'idle' | 'traveling' | 'working' | 'fleeing' | 'broken';

export interface Vec2 { x: number; y: number }

/** Degrees clockwise from north only. */
export type HeadingDeg = { kind: 'deg'; deg: number }; // 0=N, 90=E

export interface TileRenderView {
  q: number; // col (ortho) OR axial q (hex) — Loom must document which
  r: number; // row (ortho) OR axial r (hex)
  biomeId: string; // biomes.json id → asset key biome.<biomeId>
  warmth: Warmth01;
}

export interface FacilityRenderView {
  id: string;           // facilities.json id (fac_*)
  type: string;         // facilities.json kind: mill | lumber_camp | waystation | mine | (farm later)
  state: FacilityRenderState;
  warmth: Warmth01;
  position: Vec2;
  // asset: facility.<type>.<state>
}

export interface MobileRenderView {
  id: string;
  type: string; // worker | caravan | traveler | carter | ferryman | highwayman | …
  state: AgentRenderState;
  heading: HeadingDeg;
  position: Vec2;
}

export interface WorldRenderSnapshot {
  day: number;
  tick: number;
  tiles: TileRenderView[];
  facilities: FacilityRenderView[];
  mobiles: MobileRenderView[];
}

// Asset keys (Prism):
//   biome.<biomes.json id>
 //  facility.<facilities.json kind>.<idle|working|abandoned>
//   fauna.<proposed id>          // not in data yet — see §4
//   ore.<economy-resources.json id>  // mineral category first: ore.ore_iron
 //  caravan.<travel-trades role or prism suffix>
```

**State → despair/alive (render):**

| Field | Despair (warmth→0) | Alive (warmth→1) |
|-------|--------------------|------------------|
| `tile.warmth` | Desat biome ramp; overgrown / mud / dead grass | Color + flora density |
| `facility.state=idle` | Cold chimney, dark windows, still wheel | Quiet but maintained |
| `facility.state=working` | Dim labor, weak smoke | Lit windows, smoke, moving wheel/saw |
| `facility.state=abandoned` | Forced despair palette + broken props (ignore warmth floor 0.15) | N/A |
| `mobile.state=broken\|fleeing` | Desat + dust | — |
| `mobile.state=traveling\|working` | — | Full chroma + dust trail |

Bus juice (already in Loom spec): `route.caravan`, `route.break`, `route.travel_step`, `facility.work`, `facility.idle`, `facility.abandoned`, `biome.ambience`, `encounter.spawn`, `stock.starve`, `stock.deliver`, `travel.hire`, `travel.betray`.

---

## 2. Exact asset key map (from live data)

### 2.1 Biomes → `biome.<id>`

| Asset key | Data id | Source pack (CC0) | Size | Despair variant | Alive variant |
|-----------|---------|-------------------|------|-----------------|---------------|
| `biome.river_margin` | `river_margin` | **pastoral overworld** (pebonius) primary; Pixelsphere water/grass secondary | **32×32** | Grey water, mud banks, reeds brown | Clear teal water, green reeds, wet shine |
| `biome.ash_wood` | `ash_wood` | **Pixelsphere 32×32 grass+trees** (cynicmusic); **Trees & Bushes** (ansimuz) props | 32 / mixed | Bare trunks, grey canopy, leaf litter only | Full canopy, underbrush, warm litter |
| `biome.mill_heath` | `mill_heath` | **pastoral overworld**; Kenney **Roguelike/RPG** grass/path (16×2) | 32 / 16×2 | Overgrown path, dead scrub, cold mill silhouette distant | Golden heath, clear track, wildflowers |
| `biome.glare_approach` | `glare_approach` | Kenney **Roguelike/RPG** road/stone; pastoral dirt | 16×2 / 32 | Bleached road, dust, sparse scrub | Hard sun on cobble, sparse but green verge |

**Pack URLs**

| Pack | Author | License | URL |
|------|--------|---------|-----|
| pastoral overworld | pebonius | CC0 | https://opengameart.org/content/pastoral-overworld |
| Pixelsphere 32×32 Tileset + Grass + Trees | cynicmusic | CC0 | https://opengameart.org/content/pixelsphere-32x32-tileset-grass-trees |
| Trees & Bushes | ansimuz | CC0 | https://opengameart.org/content/trees-bushes |
| Roguelike/RPG pack | Kenney | CC0 | https://kenney.nl/assets/roguelike-rpg-pack · https://opengameart.org/content/roguelikerpg-pack-1700-tiles |

### 2.2 Facilities → `facility.<type>.<state>`

Types from `facilities.json` **kind**: `mill`, `lumber_camp`, `waystation`, `mine`.  
States: `idle` | `working` | `abandoned`.

| Asset key | Pack / notes | Size | Despair / idle | Alive / working | Abandoned |
|-----------|--------------|------|----------------|-----------------|-----------|
| `facility.mill.idle` | Kenney Tiny Town / Roguelike buildings; pastoral mill-like roofs | 16×2 | Wheel still, dark panes, cold chimney | — | — |
| `facility.mill.working` | same + smoke/glow overlay (render) | 16×2 | — | Wheel hint, warm window, smoke | — |
| `facility.mill.abandoned` | same + broken-wheel overlay | 16×2 | — | — | Desat + boarded window, ivy (warmth floored low) |
| `facility.lumber_camp.idle` | Roguelike trees + stump props; Pixelsphere | 16×2 / 32 | Stacked logs grey, no sawdust | — | — |
| `facility.lumber_camp.working` | + chip particles (render) | | — | Fresh cut stumps, warm workers | — |
| `facility.lumber_camp.abandoned` | | | — | — | Scattered tools, overgrown pile |
| `facility.waystation.idle` | Tiny Town / Roguelike inn/house | 16×2 | Dim lamp | — | — |
| `facility.waystation.working` | | | — | Lit lamp, cart at door | — |
| `facility.waystation.abandoned` | | | — | — | Dark, cracked sign |
| `facility.mine.idle` | **Kenney Roguelike Caves & Dungeons** (ore/rock); **DCSS 32×32 supplemental** | 16 / **32** | Dark adit, no lantern | — | — |
| `facility.mine.working` | | | — | Lantern, cart, ore pile glow | — |
| `facility.mine.abandoned` | | | — | — | Collapsed props, cold |

**Future (not in facilities.json yet):** `facility.farm.{idle,working,abandoned}` — shortlist **Farming crops 16×16** (josehzz, CC0) + pastoral fields; despair = fallow/weeds, alive = crops, abandoned = scrub.

| Pack | Author | License | URL |
|------|--------|---------|-----|
| Tiny Town | Kenney | CC0 | https://kenney.nl/assets/tiny-town |
| Roguelike Caves & Dungeons | Kenney | CC0 | https://kenney.nl/assets/roguelike-caves-dungeons · https://opengameart.org/content/roguelike-caves-dungeons-pack |
| DCSS 32×32 supplemental | MedicineStorm | CC0 | https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental |
| Farming crops 16×16 | josehzz | CC0 | https://opengameart.org/content/farming-crops-16x16 |
| Pixel Platformer Farm Expansion | Kenney | CC0 | https://kenney.nl/assets/pixel-platformer-farm-expansion (**side-view** — props only, not top-down facilities) |

### 2.3 Ore / resources → `ore.<id>`

From `economy-resources.json`. Only **mineral** is first-class `ore.*`; others are cargo icons for caravans/UI.

| Asset key | Resource id | Pack | Size | Despair | Alive |
|-----------|-------------|------|------|---------|-------|
| `ore.ore_iron` | `ore_iron` | Kenney Caves & Dungeons ore tiles; Jetrel **RPG item set** gem/ore icons; DCSS ore props | 16 / 32 | Dull grey lump | Metallic sparkle / warm rim |
| *(cargo icon)* `ore.food_grain` optional alias → prefer UI key `cargo.food_grain` | `food_grain` | josehzz crops / Jetrel food icons | 16 | Moldy sack | Full sack |
| *(cargo)* `timber` / `fuel_cord` | timber, fuel_cord | Roguelike wood piles / DCSS | | Grey stack | Fresh cut |
| *(cargo)* `wool` | wool | Jetrel cloth / animal wool | | Dusty bale | Clean bale |

| Pack | Author | License | URL |
|------|--------|---------|-----|
| RPG item set | Jetrel | CC0 | https://opengameart.org/content/rpg-item-set |

### 2.4 Fauna → `fauna.<id>` (proposed ids — not yet in src/data)

Propose these ids for Loom to add when fauna tables land; Prism maps packs now:

| Asset key | Role | Pack | Size | Despair | Alive |
|-----------|------|------|------|---------|-------|
| `fauna.rabbit` | heath / wood | **Grey Roguelike Tileset** (Sardonic) rabbit; **50 monochrome 32×32 critters** | **32** | Still / grey | Hop anim, chroma |
| `fauna.deer` | ash_wood | **More assorted 32×32 creatures** (AndHeGames); davidcrybao animal sheet | **32** / 16 | Statue-still | Graze walk |
| `fauna.bird` | all biomes | davidcrybao 16×16 animals; monochrome critters | 16 / 32 | Absent / perched grey | Flight hop |
| `fauna.pig` | farm/heath livestock | **Pig_Look 32×32** (Natural_Privateer) | **32** | Thin / grey | Pink look-at anim |
| `fauna.fox` | wood edge | AndHeGames / monochrome critters (recolor) | 32 | Ghosted | Warm fur |
| `fauna.fish` | river_margin | davidcrybao / critters | 16/32 | Dull flash | Splash |

| Pack | Author | License | URL |
|------|--------|---------|-----|
| Grey Roguelike Tileset | Sardonic | CC0 | https://opengameart.org/content/grey-roguelike-tileset |
| 50 monochrome 32×32 critters | gaymoo | CC0 | https://opengameart.org/content/50-monochrome-32-by-32-critters-cc0 |
| More assorted 32×32 creatures | AndHeGames | CC0 | https://opengameart.org/content/more-assorted-32x32-creatures |
| Pig_Look Sprite Sheet 32×32 | Natural_Privateer | CC0 | https://opengameart.org/content/piglook-sprite-sheet-32x32 |
| 16×16 / 32×32 animals sheet | davidcrybao | CC0 | https://opengameart.org/content/1616-27-types-of-animals-3232-3-types-of-animals-for-a-total-of-97 |

**Excluded:** LPC farm animals (daneeklu) — **CC-BY / GPL**, not CC0.

### 2.5 Workers & mobiles → `caravan.<type>` + worker sprites

`MobileRenderView.type` examples: `worker`, `caravan`, `traveler`, `carter`, `ferryman`, `highwayman`, …  
`travel-trades.json` **roles** + existing **prism** suffixes:

| Asset key | Maps from | Pack | Size | Despair / broken | Alive / traveling |
|-----------|-----------|------|------|------------------|-------------------|
| `caravan.carter` | role `carter` · prism `caravan.carter` | Grey tileset vehicles (cart-like) + worker; Roguelike cart props | 32 / 16×2 | Broken axle (`state=broken`) | Moving cart, facing `heading.deg` |
| `caravan.caravaner` | role `caravaner` · prism `caravan.guild` → **also alias `caravan.guild`** | multi-tile wagon from Roguelike + Tiny Town | 16×2 | Idle grey | Wagon train |
| `caravan.ferryman` | role `ferryman` · prism `caravan.ferry` → alias `caravan.ferry` | boat/raft from Roguelike water props | 16×2 | Moored dark | Crossing |
| `caravan.mount` | role `mount` | animal sheet / critters horse-like | 16/32 | Exhausted | Gallop frames |
| `caravan.guide` | role `guide` | **GrafxKid RPG character sprites** / **Pixel People** / **Base 16×16** | 16 / 32 | Cloaked dim | Walk cycle by heading |
| `caravan.courier` | role `courier` | same character packs + letter mote | | | Fast walk |
| `caravan.smuggler` | role `smuggler` | same + darker recolor | | | |
| `caravan.gouger` | role `gouger` | same | | | |
| `caravan.scammer` | role `scammer` | same | | | |
| `caravan.highwayman` | role `highwayman` · prism `caravan.highwayman` | same + weapon prop | | `fleeing` dust | Ambush pose |
| `caravan.worker` | mobile type `worker` | GrafxKid / Pixel People / Cough-E base / Kenney Toon Characters | 16/32 | Slump idle | Work swing at facility |
| `caravan.traveler` | mobile type `traveler` | same | | | Walk |

**Heading:** rotate or swap directional frames using `heading.deg` (0 N, 90 E). Prefer 4-dir sheets; interpolate 8-dir if available.

| Pack | Author | License | URL | Notes |
|------|--------|---------|-----|-------|
| RPG character sprites | GrafxKid | CC0 | https://opengameart.org/content/rpg-character-sprites | Top-down walk |
| Pixel People | TokyoGeisha | CC0 | https://opengameart.org/content/pixel-people | 32×32 people |
| Base character spritesheet 16×16 | Cough-E | CC0 | https://opengameart.org/content/base-character-spritesheet-16x16 | Worker base |
| Toon Characters 1 | Kenney | CC0 | https://kenney.nl/assets/toon-characters-1 | Temp / stylized |
| Grey Roguelike Tileset | Sardonic | CC0 | https://opengameart.org/content/grey-roguelike-tileset | Carts/vehicles (modern-leaning — recolor/crop as medieval cart) |

---

## 3. Despair / alive recipe (all keys)

Reuse M2 material ramps (`docs/art/PALETTE.md`):

1. Sample `warmth` from tile or facility.  
2. Lerp material ramp (soil/foliage/wood/window/chimney…).  
3. `state=abandoned` or `broken` → `warmthEff = min(warmth, 0.15)` + cracked overlay.  
4. `state=working` → force window/chimney toward alive end + particles (smoke, chips) even if biome warmth mid.  
5. Dual-cue spark never used for biome chrome — only player spark.

---

## 4. Gaps / blockers

| Gap | Mitigation |
|-----|------------|
| Grid shape | **Locked square orthogonal** (`q=x`, `r=y`); not hex — wilderness-economy §6 |
| No dedicated CC0 medieval wagon | Grey tileset vehicles + Roguelike props; may need Prism redraw |
| LPC animals not usable (not CC0) | Use listed CC0 critters/pig |
| Tiny Town zip donate-gate | URL shortlisted; Roguelike buildings cover M3 |
| `facility.farm` not in data yet | Crops pack shortlisted for when kind appears |
| `fauna.*` ids not in JSON | Proposed §2.4 for Loom |
| OPP2017 jungle multi-license | **Not shortlisted** (prefer pure CC0 pages) |

---

## 5. Import priority (M3)

1. `biome.mill_heath`, `biome.ash_wood`, `biome.river_margin` (pastoral + Pixelsphere)  
2. `facility.mill.*`, `facility.lumber_camp.*`, `facility.waystation.*`  
3. `caravan.carter`, `caravan.worker`, `caravan.courier`  
4. `ore.ore_iron`  
5. `fauna.rabbit`, `fauna.bird`  
6. `biome.glare_approach` + `facility.mine.*` + `caravan.highwayman` (M4 extractive road)

