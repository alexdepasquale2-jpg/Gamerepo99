# Hearthfall — Palette (M2 LOCKED)

**Owner:** Prism · **Deadline:** Fri Nov 6 08:00 America/New_York  
**Engine:** Phaser 3 + Vite · **Tile cells:** 32px (Forge locked)  
**Art direction:** Top-down pixel · Stardew-like cozy + deep-sim grit  
**Swatches:** `docs/art/swatches/`

## Warmth model (render-only)

Sim exposes `warmth ∈ [0,1]` per **tile** and per **person**.  
`src/render` lerps (or palette-swaps) along the material ramps below.  
**Never** import colors, sprites, or feel numbers into `src/sim`.

```
color = lerp(ramp[i], ramp[i+1], fract(warmth * (n-1)))
```

Dual cue for spark (colorblind-safe): fill `#F2B84B` + outline `#5EC8C8`.

---

## Material ramps (despair → alive)

10 stops each. Index 0 = despair, index 9 = fully alive.  
**v2 quality pass (2026-11-05):** softer midtones, stronger window/foliage lift for readable warmth lerps.

### soil
`#2A2A28` `#34322C` `#3E3A30` `#4A4638` `#586040` `#6A7848` `#7A9050` `#6B9A40` `#5AAA38` `#4CB038`

### path
`#3A3836` `#45413C` `#524C44` `#5E564C` `#6A6256` `#7A7060` `#8A7E6A` `#9A8A70` `#A89068` `#B89860`

### foliage
`#2A3028` `#323A30` `#3A4436` `#465240` `#54644C` `#647858` `#789064` `#8CAC70` `#9CC878` `#A8D880`

### water
`#243038` `#2A3840` `#344850` `#3E5860` `#486870` `#547880` `#608890` `#6C98A0` `#78A8A8` `#84B8B0`

### building (walls / timber / plaster)
`#3A3838` `#464240` `#524C48` `#5E5650` `#6A6058` `#786A60` `#867468` `#947E70` `#A28878` `#B09280`

### window (despair panes → alive glow)
Use `window` ramp ends for dark panes; force toward gold `#F0D878`–`#FFF0A8` when `warmth` high or facility `working`. Soft additive glow in render (see mockup).

### chimney / roof / wood
Keep prior roof/wood/chimney ramps; alive chimneys add smoke particles (render feel).


## UI / overlay tokens

| Token | Hex | Use |
|-------|-----|-----|
| void | `#0B0A0F` | Clear / burnout |
| text.primary | `#E8DCC8` | HUD |
| text.muted | `#8A7A68` | Secondary |
| spark.fill | `#F2B84B` | Spark bar |
| spark.outline | `#5EC8C8` | Colorblind dual |
| wound | `#7A2E2E` | Critical / hollow mood pip |
| bond | `#6EC8E8` | Bond lines / letter path |
| mark.hollow | `#6A6870` | Lasting mark ring |
| mark.dependent | `#C080A0` | Lasting mark ring |
| mark.grown | `#70C080` | Lasting mark ring |
| letter | `#E8E0C8` | Packet / letter sprite |

---

## Archetype accents (thin; do not replace material ramps)

Warmth still drives materials. Accents tint silhouette / props only in render.

| Id | Accents |
|----|---------|
| Ashford place | `#12151A` `#3E4A52` `#7A6E5C` `#D4A574` `#4A6678` `#E8C878` |
| Marrow | `#1C1612` `#5A4634` `#A08060` `#E07030` `#5A2A2A` `#2E3A2E` |
| Ivy Quill | `#1C2230` `#5A6A82` `#C8D0DC` `#2E5A4A` `#C45A3A` `#B89040` |
| Brood | `#142018` `#3E6044` `#A8C090` `#C8E060` `#4A6878` `#703040` |

## Contrast / colorblind

- Body text `#E8DCC8` on `#0B0A0F`–`#2A2A28` only.  
- Spark = gold **and** cyan outline. Marks use ring shape + label, not hue alone.  
- Despair/alive readable in grayscale via value + window light + smoke presence.

## Tile source size

**Forge: 32px cells.** Best cozy CC0 town packs are **16×16** (Kenney, ansimuz).  
**Recommendation (locked with this pass):** keep 32px cells; draw 16px CC0 tiles at **2× nearest-neighbor**. Native 32px CC0 (e.g. DCSS supplemental) for dungeon/props only.

**Locked.**
