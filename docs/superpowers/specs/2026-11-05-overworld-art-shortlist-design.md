# M3/M4 Overworld Art Shortlist — Design

**Role:** Prism · **After** M2 art lock + VFX/UI  
**Contract:** `docs/superpowers/specs/2026-11-05-wilderness-economy-design.md` §6  
**Data ids:** `src/data/biomes.json`, `facilities.json`, `travel-trades.json`, `economy-resources.json`

## Brainstorm (self-approved)

1. Native-32-only — too thin for facilities/caravans.  
2. **Prefer native 32×32 CC0; allow 16×16×2 when forced; map every pack to exact asset keys (CHOSEN).**  
3. Ignore Loom keys / invent parallel naming — rejected.

## Hex flag

`TileRenderView` uses `q,r` (hex-axial naming) but comments say column/row. **All shortlisted CC0 tiles are square ortho.** If Loom commits to hex, render must hex-mask or pointy-top project square tiles; if ortho, treat `q,r` as col/row. Schema note asks Loom to pick one — Prism will not edit Loom files.

## Deliverable

`docs/art/OVERWORLD_SHORTLIST.md` + CREDITS append. No vendor download required this pass (shortlist only).
