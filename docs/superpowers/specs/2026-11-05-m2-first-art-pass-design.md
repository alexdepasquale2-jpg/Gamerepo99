# M2 First Art Pass — Cozy-Grit Top-Down (LOCKED)

**Role:** Prism · **Deadline:** Fri Nov 6 08:00 America/New_York  
**Engine:** Phaser 3 + Vite · **Tile cells:** **32px** (Forge locked)  
**Tone:** Stardew-like cozy + deep-sim grit · dying world · spark costs itself

## Brainstorm (self-approved; no user Qs)

**Approaches**
1. Native-32-only CC0 — almost no cozy top-down town packs are pure CC0 at 32px.
2. **16px Kenney + ansimuz town CC0, drawn at 2× into 32px cells (CHOSEN)** — forced by best CC0 cozy town sets; Forge cell size stays 32.
3. Side-view Gothicvania — rejected (not top-down; music not CC0).

**Warmth model:** Sim exposes `warmth ∈ [0,1]` per tile and person. Render only lerps despair↔alive material ramps (or palette-swaps). No colors/sprites/feel numbers in `sim/`.

**Impact read:** Despair = desat, dim windows, overgrown paths, cold chimneys. Reignite = local color/warmth (lit window, garden, smoke). Overlays: mood/bond rings, lasting marks (hollow/dependent/grown), letters/rumors in transit.

## Deliverables (8 AM)

1. `docs/art/PALETTE.md` — despair + alive ramps per material + swatches  
2. `docs/art/ASSET_SHORTLIST.md` + packs in `assets/vendor/` (CC0 verified) + `CREDITS.md`  
3. `docs/art/mockups/ashford-half-and-half.png` — real tiles, half despair / half alive, overlay + letter  

VFX + UI juice = separate pass after this.
