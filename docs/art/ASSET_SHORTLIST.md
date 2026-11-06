# Hearthfall — CC0 Asset Shortlist (M2 LOCKED)

**Policy:** CC0 only. Prefer Kenney + OpenGameArt CC0.  
**Tile cells:** 32px (Forge). Town sources below are **16×16** drawn at 2× unless noted.  
**Vendor copies:** `assets/vendor/` (downloaded this pass).  
**Status column:** `vendor` = zip/png on disk; `url-only` = verified live, not yet downloaded.

All URLs checked HTTP 200 + CC0 on page/license file (2026-11-05).

---

## Tiles — Ashford / overworld

| Asset | Author | Size | License | URL | Status |
|-------|--------|------|---------|-----|--------|
| RPG Town Pixel Art Assets | ansimuz (Luis Zuno) | 16×16 | CC0 | https://opengameart.org/content/rpg-town-pixel-art-assets | vendor `ansimuz-rpg-town-pixel-art-assets.zip` |
| Roguelike/RPG pack (1700+ tiles) | Kenney (+ Lynn Evers conversion) | 16×16 | CC0 | https://kenney.nl/assets/roguelike-rpg-pack · OGA mirror https://opengameart.org/content/roguelikerpg-pack-1700-tiles | vendor `kenney-roguelike-rpg-pack.zip` |
| Tiny Town | Kenney | 16×16 | CC0 | https://kenney.nl/assets/tiny-town | url-only (kenney.nl gate; use Roguelike+ansimuz for M2) |
| Town Tiles | surt | tiny 16-ish | CC0 | https://opengameart.org/content/town-tiles | vendor `surt-town-tiles.png` |
| Dungeon Crawl 32×32 tiles supplemental | MedicineStorm | **32×32** | CC0 | https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental | vendor `medicinestorm-dcss-32x32-supplemental.zip` (props/interiors) |
| Micro Roguelike | Kenney | 8×8 | CC0 | https://opengameart.org/content/micro-roguelike | vendor `kenney-micro-roguelike.zip` (UI icons / debug) |

## Characters — Marrow / Ivy / Brood / townsfolk

| Asset | Author | Notes | License | URL | Status |
|-------|--------|-------|---------|-----|--------|
| Ogre-All.png (troll/ogre walk) | Umz | Marrow bulk ref / temp sprite | CC0 | https://opengameart.org/content/troll-animated-classic-hero-edit | vendor `umz-ogre-all.png` |
| HOMM2-style basilisk | Blarumyrran | Brood gaze silhouette | CC0 | https://lpc.opengameart.org/content/heroesofmightandmagic2-style-basilisk | vendor `blarumyrran-homm2-basilisk.zip` |
| Blue Lizard Character Sprite Sheet | PenguinEmporium | Brood sibling temp | CC0 / Public Domain | https://opengameart.org/content/blue-lizard-character-sprite-sheet | vendor `penguinemporium-blue-lizard-charks.png` |
| RPG Town npc.png / hero.png | ansimuz | Ivy / townsfolk temp | CC0 | (inside town pack) | vendor (in zip) |
| Kenney Roguelike characters | Kenney | Extra NPCs | CC0 | (inside roguelike pack) | vendor (in zip) |

## UI

| Asset | Author | License | URL | Status |
|-------|--------|---------|-----|--------|
| UI Pack | Kenney | CC0 | https://kenney.nl/assets/ui-pack | url-only |
| Roguelike pack UI panels | Kenney | CC0 | (in roguelike zip) | vendor |
| Micro Roguelike interface tiles | Kenney | CC0 | https://opengameart.org/content/micro-roguelike | vendor |

## Fonts

| Asset | Author | License | URL | Notes |
|-------|--------|---------|-----|-------|
| Public Pixel Font | GGBotNet | **CC0** | https://opengameart.org/content/public-pixel-font | Preferred HUD |
| Kenney Fonts | Kenney | **CC0** | https://opengameart.org/content/kenney-fonts | Bitmap options |
| Minimalist Pixel Fonts | kheftel | **CC0** (OGA upload) | https://opengameart.org/content/minimalist-pixel-fonts | OK |
| *(OFL fonts)* | — | OFL ≠ CC0 | — | **Do not treat as CC0**; skip unless policy changes |

Fonts not downloaded this pass (docs-only shortlist); import before M6 polish.

## SFX / music (CC0) — shortlist for later juice

| Asset | Author | License | URL | Status |
|-------|--------|---------|-----|--------|
| Fireplace Fire Crackling | RyanKingArt | CC0 | https://freesound.org/people/RyanKingArt/sounds/717579/ | url-only |
| fire crackling loop | soundofsong | CC0 | https://freesound.org/people/soundofsong/sounds/650574/ | url-only |
| A Small Fire Crackling | ExplosiveTamale | CC0 | https://freesound.org/people/ExplosiveTamale/sounds/448361/ | url-only |
| Interface Sounds | Kenney | CC0 | https://kenney.nl/assets/interface-sounds | url-only |
| RPG Audio | Kenney | CC0 | https://kenney.nl/assets/rpg-audio | url-only |
| Music Jingles | Kenney | CC0 | https://kenney.nl/assets/music-jingles | url-only |

## Explicitly excluded

| Item | Why |
|------|-----|
| Gothicvania Town music (Pascal Belisle) | Credit-required, not CC0 (art pack itself is CC0 but side-view; skipped for top-down) |
| LPC Terrains / Farming | CC-BY-SA / GPL — not CC0 |
| Jerom 32×32 fantasy tileset | CC-BY-SA 3.0 |
| Ivan Voirol Basic map 32×32 | CC-BY / GPL |
| Buch tilesets | CC-BY 3.0 |
| AnthonyMyers ogre.gif | Provenance disputed in comments |

## Import plan for Forge

1. Unpack vendor zips into `assets/` subfolders (Tidy may rename; Prism won't restructure beyond `assets/vendor`).  
2. Slice 16×16 sheets; render at 2× into 32px Phaser tilemaps.  
3. Tag tiles with material ids (`soil`,`path`,`window`,…) for warmth lerp in `src/render`.
