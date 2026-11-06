# Hearthfall — 2.5D Style Spec (ART DIRECTION LOCK)

**Status:** LOCKED · v3 pack bar (ansimuz CC0)  
**Hero mockups:**  
- `docs/art/mockups/2.5d-world-target.png` (v1 lock)  
- `docs/art/mockups/2.5d-world-target-v2.png` (v2 depth bar)
- `docs/art/mockups/2.5d-world-target-v3.png` (**current — ansimuz 3/4 + clean grass + terrace**)  
**Scratch / WIP:** `docs/art/mockups/scratch/` only  
**Cell:** 32px logical (Kenney 16px CC0 ×2 nearest-neighbor)  
**View:** Stardew-like **¾ top-down** · continuous HUGE world · camera follows player  

## Non-negotiables

1. **No blocky ortho chessboard as the hero look.** Terrain may tile underneath; readable world is **depth-sorted sprites**. Soften seams (strip harsh tile outlines, paint continuous grass/road ribbons).
2. **No circle / placeholder characters.** Real ¾ CC0 sprites (or original pixels) only. Characters need **presence**: ≥1.5–2× tile scale, dark outline, soft contact shadow.
3. **Depth sort by foot-Y:** player walks **behind** tree canopies / building fronts when the object’s foot is lower on screen. Proof: a visible peek of the character past the trunk.
4. **Layered elevation with a real cliff face** — not a flat dark band:
   - **Lip / ledge** with bright highlight on the top edge  
   - **Vertical face** with top-lit → bottom-shadow gradient, strata/cracks  
   - **Base shadow** soft pool on the lower ground  
5. **Buildings have ¾ depth:** visible **side wall** (darker), **roof overhang** (dark eave underside), **contact shadow** under footprint. Hand-paint missing pixels if CC0 tiles are flat.
6. **Despair / reignite = per-pixel palette shift** (desat + cool bias ↔ chroma + warm push). **Never** a translucent green/grey square overlay band.
7. **Huge-world scale cues:** road runs off both screen edges; distant ridge with atmospheric fade; workers/carts on the road.
8. **Assets:** CC0 / free + `CREDITS.md`. Prefer **Kenney Tiny Town** + **Tiny Dungeon**.

## Camera & world

- Continuous scroll; biomes blend; settlements generated (no hard-coded place names on hero art).
- Soft vignette OK; no heavy UI chrome in world-target.
- Shadows: translucent ellipses, slight SE offset, Gaussian soft.

## Primary CC0 kit

| Role | Source | Notes |
|------|--------|--------|
| Grass / flowers | Tiny Town `0–2`, `29` | Continuous base fill + sparse tufts |
| Dirt road | Tiny Town `12–14`, `39–42` | Soft ribbon off-screen |
| Cobble | Tiny Town `43` | Plazas |
| Trees | Tiny Town `15–16`, `27–28`, canopy `18+` | Scale ×4–8; depth-sort |
| Houses | Walls `48–54`/`60–66`/`72–75`, roofs `51/55/63/67`, doors/windows `74/78/84–91` | Compose side + overhang |
| Fence / cart / well / props | `44–46`, `57`, `83`, `94–95`, `104` | |
| Cliff / stone | Battlements `96–102` + stone walls; hand lip/strata | Face ≠ flat band |
| Characters | Tiny Dungeon (~`96` warrior, `99–100` villagers, `87` rogue) | Outline + scale up |

## Warmth

Same ramps as `PALETTE.md`. Materials lerp by `warmth 0..1` **per pixel**. Spark dual-cue remains player-only.

## Deliverable order

1. ~~2.5D target + this spec~~  
2. **v2 depth bar** (`2.5d-world-target-v2.png`) ← current  
3. Rebuild world kit + `world-map-generated` + `settlement-closeup` **to v2 bar**  
4. Keep `VISUAL_LANGUAGE.md` / `CREDITS.md` in sync  

## Supersedes

Ortho kit mockups and Ashford half-and-half as **hero** direction. v1 target kept for history; **match v2** for new work.
