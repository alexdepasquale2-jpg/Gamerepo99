# Hearthfall — Overworld Asset Map (M3 runtime handoff)

**Owner:** Prism · **Art lock:** `STYLE_SPEC_2.5D.md` v2 · **Shortlist:** `OVERWORLD_SHORTLIST.md`  
**Contract:** Loom `WorldRenderSnapshot` (`wilderness-economy-design.md` §6)  
**Manifest (code):** `src/render/asset-manifest.ts` · **Mirror:** `assets/manifest/overworld-assets.json`  
**Grid:** Loom **LOCKED** square ortho — `q = x` (column), `r = y` (row).

---

## 1. Key scheme

| Prefix | Source of ids | Example |
|--------|---------------|---------|
| `biome.<id>` | `src/data/world/biomes.json` | `biome.ash_wood` |
| `facility.<kind>.<state>` | `facilities.json` **kind** + state enum | `facility.mill.working` |
| `ore.<id>` | `economy-resources.json` (mineral first-class) | `ore.ore_iron` |
| `caravan.<type>` | `travel-trades.json` **role** (+ mobile aliases) | `caravan.carter` |
| `fauna.<id>` | `src/data/world/fauna.json` | `fauna.rabbit` |
| `crop.<id>` | `src/data/economy/crops.json` | `crop.crop_wheat` |
| `cargo.<id>` | Non-mineral resources (UI/caravan icons) | `cargo.food_grain` |
| `road.<tier>` | Loom road tier (not a data file) | `road.highway` |

**Heading:** `heading: number` degrees clockwise from north (`0=N`, `90=E`, `180=S`, `270=W`). Never a vector.

**Warmth / despair|alive:** prefer **per-pixel palette lerp** (`status` art uses same frames; `variant: 'palette'`). Facility `abandoned` forces low-warmth + broken overlay frame when present (`variant: 'swap'`).

---

## 2. Heading → frame

```
// 8-way (preferred for caravan / fauna walk cycles)
index8 = ((Math.round(headingDeg / 45) % 8) + 8) % 8
// order: N, NE, E, SE, S, SW, W, NW  → frames 0..7

// 4-way fallback (stubs / single-row sheets)
index4 = ((Math.round(headingDeg / 90) % 4) + 4) % 4
// order: N, E, S, W → frames 0..3
```

Helpers: `headingToFrame8`, `headingToFrame4` in `asset-manifest.ts`.

---

## 3. Biomes (data-locked — `world/biomes.json`)

| Asset key | Data id | Kit / sheet | Despair | Alive | Status |
|-----------|---------|-------------|---------|-------|--------|
| `biome.river_margin` | `river_margin` | `kit-biomes` · Tiny Town water/reed | grey mud, still water | teal, green reeds | **ready** (palette) |
| `biome.ash_wood` | `ash_wood` | `kit-biomes` · Tiny Town trees | bare canopy | full green | **ready** |
| `biome.mill_heath` | `mill_heath` | `kit-biomes` · autumn trees | dead scrub | golden heath + flowers | **ready** |
| `biome.glare_approach` | `glare_approach` | `kit-biomes` · dirt + stone | dust bleach | cobble verge | **ready** |
| `biome.peat_fen` | `peat_fen` | **imported** `pebonius-pastoral-overworld-db32.png` | brown peat, dead reed | wet moss, reed beds | **stub** (kit frame TBD) |
| `biome.chalk_downs` | `chalk_downs` | pastoral pale grass | bleached chalk | short green turf | **stub** |
| `biome.brine_marsh` | `brine_marsh` | pastoral wet + Tiny Town water | salt crust | tidal green | **stub** |
| `biome.slag_verge` | `slag_verge` | **imported** Kenney Roguelike Caves | ash slag | warm cinder reclaim | **stub** |

Warmth = per-pixel despair↔alive palette lerp on the same frames (`variant: palette`).

---

## 4. Facilities (kinds from data)

States: `idle` | `working` | `abandoned`.

| Asset key pattern | Kind (data) | Sheet | Frames | Notes |
|-------------------|-------------|-------|--------|-------|
| `facility.mill.*` | `mill` | Tiny Town modular house + wheel prop; `kit-facilities` | body + window lit/dark; working adds smoke bloom (render) | **ready** stub frames via Tiny Town |
| `facility.lumber_camp.*` | `lumber_camp` | Tiny Town + tree/stump props | idle stacks; working chips VFX; abandoned overgrown | **ready** |
| `facility.waystation.*` | `waystation` | Tiny Town inn/house + cart `57` | working: lit lamp + cart | **ready** |
| `facility.mine.*` | `mine` | Tiny Town stone + Tiny Dungeon walls; ore prop | working: lantern; abandoned: collapse prop | **ready** |

Instance ids (`fac_ashford_mill`, …) are **not** asset keys — stamp by `kind` + `state` only.

## 4b. Proposed (not in data)

| Proposal | Notes |
|----------|-------|
| `facility.farm.{idle,working,abandoned}` | **Not** a `facilities.json` kind. Field stamps use **`crop.<id>`**; cargo piles use resources. Kept in `PROPOSED_FACILITY_KINDS` only. |


---

## 5. Ore / crops / cargo

### Ore (`economy-resources.json` mineral ids)

| Asset key | Resource id | Sheet (vendor) | Status |
|-----------|-------------|----------------|--------|
| `ore.ore_iron` | `ore_iron` | **imported** `kenney-roguelike-caves-dungeons.zip` | **stub** (frame bake TBD) |
| `ore.ore_copper` | `ore_copper` | same / DCSS supplemental | **stub** |
| `ore.ore_slag_tin` | `ore_slag_tin` | caves rock + ash tint | **stub** |

### Crops (`economy/crops.json`)

| Asset key | Data id | Sheet | Status |
|-----------|---------|-------|--------|
| `crop.crop_wheat` | `crop_wheat` | **imported** `josehzz-farming-crops-16x16.zip` | **stub** |
| `crop.crop_barley` | `crop_barley` | josehzz (rice/corn stand-in) | **stub** |
| `crop.crop_root` | `crop_root` | josehzz potato/cassava | **stub** |
| `crop.crop_reed` | `crop_reed` | pastoral wet / Tiny Town reed (no reed in josehzz) | **stub** |
| `crop.crop_flax` | `crop_flax` | josehzz flower stand-in | **stub** |

### Cargo (non-mineral resources)

| Asset key | Resource id | Sheet | Status |
|-----------|-------------|-------|--------|
| `cargo.food_grain` | `food_grain` | josehzz pile | **stub** |
| `cargo.timber` | `timber` | Tiny Town log `93` | **ready** |
| `cargo.wool` | `wool` | Jetrel items | **stub** |
| `cargo.fuel_cord` | `fuel_cord` | Jetrel / torch | **stub** |
| `cargo.coin` | `coin` | Jetrel / Tiny Town | **stub** |

Do **not** invent `ore.food_grain`; use `cargo.*` for non-minerals. Field art uses `crop.*`, not cargo.

---

## 6. Caravans / mobiles (roles from travel-trades)

| Asset key | Role / type | Heading | Sheet | Status |
|-----------|-------------|---------|-------|--------|
| `caravan.carter` | `carter` | 8-way | Tiny Town cart `57` + Tiny Dungeon walker | **ready** (cart facing via flip/rotate stub; walker 8-way when sheet lands) |
| `caravan.caravaner` | `caravaner` | 8-way | multi-cart | **stub** |
| `caravan.guild` | alias → `caravan.caravaner` | | | alias |
| `caravan.ferryman` | `ferryman` | 4-way | Roguelike boat props (shortlist) | **missing art import** |
| `caravan.ferry` | alias → ferryman | | | alias |
| `caravan.mount` | `mount` | 8-way | animal sheets (CC0 shortlist) | **missing** |
| `caravan.guide` | `guide` | 8-way | Tiny Dungeon `99–100` / GrafxKid | **ready** stub (4-way until walk sheet) |
| `caravan.courier` | `courier` | 8-way | same + letter mote | **ready** stub |
| `caravan.smuggler` | `smuggler` | 8-way | darker recolor of guide | **ready** stub |
| `caravan.gouger` | `gouger` | 8-way | same | **ready** stub |
| `caravan.scammer` | `scammer` | 8-way | same | **ready** stub |
| `caravan.highwayman` | `highwayman` | 8-way | Tiny Dungeon warrior `96` | **ready** stub |
| `caravan.worker` | mobile worker | 4/8 | Tiny Dungeon | **ready** stub |
| `caravan.traveler` | mobile traveler | 8-way | Tiny Dungeon | **ready** stub |

---

## 7. Fauna (`world/fauna.json`)

Sheets **imported** under `assets/vendor/`; frame indices still **stub** (atlas bake TBD). Heading: 4-way until walk cycles cut.

| Asset key | Data id | Vendor sheet | Status |
|-----------|---------|--------------|--------|
| `fauna.rabbit` | `rabbit` | `gaymoo-50-monochrome-critters-32.png` | **stub** |
| `fauna.deer` | `deer` | `andhegames-more-creatures-32.png` | **stub** |
| `fauna.bird` | `bird` | `davidcrybao-animals-all-sheet.png` | **stub** |
| `fauna.pig` | `pig` | `natural-privateer-pig-look-32.png` | **stub** |
| `fauna.fox` | `fox` | AndHeGames / gaymoo recolor | **stub** |
| `fauna.fish` | `fish` | davidcrybao | **stub** |
| `fauna.heron` | `heron` | davidcrybao tall-wader stand-in | **stub** |
| `fauna.rat` | `rat` | gaymoo / `sardonic-grey-roguelike-32.png` | **stub** |

Excluded: LPC farm animals (CC-BY/GPL).

---

## 8. Roads (Loom tiers)

| Key | Kit | Status |
|-----|-----|--------|
| `road.track` | `kit-roads` · Tiny Town dirt | **ready** |
| `road.road` | `kit-roads` · dirt + cobble | **ready** |
| `road.highway` | `kit-roads` · cobble `43` + posts | **ready** |

---

## 9. Gap summary (action list)

| Item | Status | Next |
|------|--------|------|
| Square ortho `q=x,r=y` | **LOCKED** | — |
| New biomes kit frames (`peat_fen`…) | **stub** (pastoral/caves imported) | extend `kit-biomes.png` |
| `fauna.*` / `crop.*` / `ore.*` frame bake | **stub** (vendor zips/pngs imported) | cut atlas frames |
| `facility.farm` | **proposed, not in data** | use `crop.*` for fields |
| `caravan.ferryman` / `mount` | **missing** art | Roguelike boat; dedicated mount sheet |
| Jetrel cargo icons (`wool`, `fuel_cord`, `coin`) | **stub** (not imported) | import Jetrel RPG item set |

---

## 10. Kit sheet cross-ref

| Kit file | Keys covered |
|----------|--------------|
| `docs/art/kit/kit-biomes.png` | `biome.*` despair|alive |
| `docs/art/kit/kit-roads.png` | `road.*` |
| `docs/art/kit/kit-tiers.png` | settlement footprints (not WorldRenderSnapshot tile keys; overworld chips) |
| `docs/art/kit/kit-facilities.png` | `facility.*.{idle,working,abandoned}` |
| `docs/art/kit/kit-overview.png` | legend |

Vendor runtime sources (when imported): `assets/vendor/kenney-tiny-town.zip`, `kenney-tiny-dungeon.zip`.

---

## 11. Do / Don't

**Do:** resolve by parametric keys; use heading helpers; palette-lerp warmth; credit CC0.  
**Don't:** key art to place names (`ashford`); put feel in sim; treat LPC as CC0; treat `facility.farm` as a data gap.
