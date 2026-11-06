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
| `fauna.<id>` | **Proposed** — not in `src/data` yet | `fauna.rabbit` |
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

## 3. Biomes (data-locked)

| Asset key | Data id | Kit / sheet | Frame / notes | Despair | Alive | Status |
|-----------|---------|-------------|---------------|---------|-------|--------|
| `biome.river_margin` | `river_margin` | `kit-biomes` · Tiny Town grass/water props `0–2`,`43` | fill + reed props | grey mud, still water | teal, green reeds | **ready** (palette) |
| `biome.ash_wood` | `ash_wood` | `kit-biomes` · Tiny Town trees `15–16`,`27–28` | canopy stamps | bare/grey canopy | full green | **ready** |
| `biome.mill_heath` | `mill_heath` | `kit-biomes` · autumn trees `15`,`27` | open fill | dead scrub | golden heath + flowers | **ready** |
| `biome.glare_approach` | `glare_approach` | `kit-biomes` · dirt `39–42` + stone `96+` | road verge | dust, bleach | cobble verge, thin green | **ready** |

CC0 backup (not yet imported to runtime): pastoral overworld (pebonius), Pixelsphere grass+trees (cynicmusic) — see CREDITS / OVERWORLD_SHORTLIST.

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
| `facility.farm.{idle,working,abandoned}` | **Not** a `facilities.json` kind. Crop art maps to resource/cargo **`food_grain`**. CC0 candidate: josehzz Farming crops 16×16. Kept in `PROPOSED_FACILITY_KINDS` only — not a missing data gap. |


---

## 5. Ore / cargo (resources)

| Asset key | Resource id | Category | Sheet | Status |
|-----------|-------------|----------|-------|--------|
| `ore.ore_iron` | `ore_iron` | mineral | Tiny Dungeon ore-ish props / Jetrel RPG item set (CC0 shortlist) | **stub** — pack not imported |
| `cargo.food_grain` | `food_grain` | food | josehzz crops / Jetrel | **stub** |
| `cargo.timber` | `timber` | material | Tiny Town log `93` / Roguelike | **ready** (Tiny Town log) |
| `cargo.wool` | `wool` | goods | Jetrel items (CC0) | **stub** |
| `cargo.fuel_cord` | `fuel_cord` | fuel | Jetrel / Roguelike torch | **stub** |
| `cargo.coin` | `coin` | currency | Tiny Town coin-like / Jetrel | **stub** |

Do **not** invent `ore.food_grain`; use `cargo.*` for non-minerals.

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

## 7. Fauna (placeholders — no JSON yet)

No fauna ids in `src/data`. Keys below are **placeholders only** (manifest `status: placeholder`).

| Asset key | Suggested biomes | CC0 fill when Loom adds fauna |
|-----------|------------------|-------------------------------|
| `fauna.rabbit` | mill_heath, ash_wood | Grey Roguelike (Sardonic); gaymoo monochrome critters |
| `fauna.deer` | ash_wood | AndHeGames 32×32; davidcrybao |
| `fauna.bird` | all | davidcrybao / monochrome critters |
| `fauna.pig` | mill_heath | Pig_Look 32×32 (Natural_Privateer) |
| `fauna.fox` | ash_wood edge | AndHeGames / monochrome recolor |
| `fauna.fish` | river_margin | davidcrybao / critters |

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

| Item | Status | CC0 fill / next |
|------|--------|-----------------|
| Square ortho `q=x,r=y` | **LOCKED by Loom** | — |
| `fauna.*` | placeholder (no data ids) | see §7 when Loom adds fauna |
| `facility.farm` | **proposed, not in data** (§4b) | crops → `food_grain` |
| `ore.ore_iron` atlas | stub | Kenney Caves / Jetrel / DCSS import |
| `caravan.ferryman` / `mount` | missing art import | Roguelike boat; animal CC0 packs |

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
