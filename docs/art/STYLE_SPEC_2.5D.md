# Hearthfall — 2.5D Style Spec (ART DIRECTION LOCK)

**Status:** LOCKED · top priority over prior ortho/block mockups  
**Cell:** 32px logical (16px CC0 sources ×2 nearest-neighbor)  
**View:** Stardew-like **3/4 top-down** · continuous HUGE world · camera follows player  

## Non-negotiables

1. **No blocky ortho “chessboard” tiles as the hero look.** Terrain may be tiled underneath, but readable world is **depth-sorted sprites** (trees, buildings, cliffs, characters).  
2. **No circle/placeholder characters.** Real 3/4 CC0 pixel sprites only (or original pixel art).  
3. **Depth sort by foot-Y:** player walks **behind** tree canopies / building fronts when foot is higher on screen.  
4. **Layered elevation:** ground → cliff face → upper terrace; soft contact shadows.  
5. **Despair = desaturation + cold windows + quiet chimneys.** Reignite = chroma return, lit panes, smoke, garden.  
6. **Assets:** CC0 / genuinely free + CREDITS. Prefer Kenney Tiny Town / Roguelike 3/4 sets.

## Camera & world

- Continuous scroll; long roads; biomes blend.  
- Soft vignette OK; no hard UI chrome in world-target mockups.  
- Shadows: translucent ellipses under feet/props, slight SE offset.

## Warmth

Same `PALETTE.md` ramps: lerp materials by `warmth 0..1`. Spark dual-cue remains player-only.

## Supersedes

Ortho kit mockups / Ashford half-and-half as **hero** targets. Rebuild world kit in this style next.
