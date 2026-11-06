# Hearthfall — Mood Board (M2 LOCKED)

**Companion:** `PALETTE.md`, `ASSET_SHORTLIST.md`, mockup `mockups/ashford-half-and-half.png`

## Direction

Top-down pixel art. **Stardew-like cozy** village readability + **deep-sim grit** (mood, bonds, marks, traveling letters).  
The world ends in quiet. Despair desaturates. Reigniting a person restores **local** color and warmth — lit window, garden, chimney smoke — so the map shows impact.

## Lighting & warmth

- Overcast / dusk key. Practicals only where warmth is high.  
- Tile/person `warmth 0..1` from sim → render lerps material ramps.  
- Spark light radius shrinks as spark spends (render feel).

## Shape language

| Subject | Read |
|---------|------|
| Ashford | Low roofs, mill wheel, river band, cobble paths |
| Marrow | 2×2 bulky footprint, den coal |
| Ivy | Vertical clerk + ledger/quill |
| Brood | Three small reptiles; one bright eye = active body |
| Letter / rumor | Small envelope / mote traveling along link |

## Grit overlays (render)

1. **Mood / bond** — ring + thin bond line + flame pip.  
2. **Lasting marks** — hollow / dependent / grown (shape + color token).  
3. **Packets** — letter sprite in transit between towns.

## Spark / reignite (brief; prototype after lock)

Sim emits events only. Render: spend = inward gold+cyan motes + light hit-stop/shake; reignite = outward bloom + local warmth lift; refusal = no bloom.

## CC0 references (verified)

| Source | URL |
|--------|-----|
| Kenney Roguelike/RPG | https://kenney.nl/assets/roguelike-rpg-pack |
| Kenney Tiny Town (16×16) | https://kenney.nl/assets/tiny-town |
| ansimuz RPG Town | https://opengameart.org/content/rpg-town-pixel-art-assets |
| surt Town Tiles | https://opengameart.org/content/town-tiles |
| MedicineStorm DCSS 32×32 supplemental | https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental |
| Umz Ogre | https://opengameart.org/content/troll-animated-classic-hero-edit |
| Blarumyrran basilisk | https://lpc.opengameart.org/content/heroesofmightandmagic2-style-basilisk |
| PenguinEmporium blue lizard | https://opengameart.org/content/blue-lizard-character-sprite-sheet |

**Locked** with palette.

## Quality mockup (2026-11-05)
Hero reference: `docs/art/mockups/ashford-half-and-half.png` — ansimuz inn/house sprites + Kenney ground, soft warmth grade, window bloom, smoke, garden vs overgrowth, hollow↔grown bond + letter.
