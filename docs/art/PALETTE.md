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

### soil
`#2A2A28` `#3A3830` `#4A4638` `#5C5640` `#6E6A48` `#7A7850` `#8A8858` `#6B8F3A` `#5FA034` `#4CB038`

### path
`#3A3836` `#45413C` `#524C44` `#5E564C` `#6A6256` `#7A7060` `#8A7E6A` `#9A8A70` `#A89068` `#B89860`

### cobble
`#3C4044` `#454A50` `#50565C` `#5C646C` `#687078` `#748088` `#809098` `#8CA0A0` `#98A8A0` `#A0B098`

### roof
`#3A3030` `#443838` `#4E4040` `#584848` `#625050` `#6C5850` `#786050` `#886850` `#987050` `#A87848`

### wall
`#4A4640` `#545048` `#5E5A50` `#686458` `#726E60` `#7C7868` `#868270` `#908C78` `#9A9678` `#A4A070`

### window
`#1A1C20` `#222428` `#2A3038` `#384048` `#4A5860` `#6A7880` `#8A9888` `#C8B870` `#E0C860` `#F0D878`  
Despair = black panes. Alive = lit practicals.

### chimney
`#2A2828` `#322E2C` `#3A3430` `#423A34` `#4A4038` `#52483C` `#5A5040` `#6A5848` `#7A6850` `#8A7058`  
Alive also enables smoke particle (render feel, not sim).

### foliage
`#2E342C` `#343A30` `#3A4234` `#44503A` `#4E5E40` `#5A7048` `#688850` `#78A058` `#88B860` `#98D068`  
Despair = overgrown brambles / dead hedges. Alive = garden regrowth.

### water
`#2A343C` `#303C44` `#384850` `#405460` `#486870` `#507C80` `#588888` `#609090` `#689898` `#70A0A0`

### wood
`#3A3228` `#44382C` `#4E4034` `#58483C` `#625044` `#6C584C` `#766054` `#80685C` `#8A7064` `#94786C`

### spark (player cost)
`#4A4030` `#6A5030` `#8A6030` `#AA7830` `#C89038` `#D9A040` `#E8B048` `#F2B84B` `#F5C860` `#FFE080`

### flame (person)
`#4A3028` `#5A3830` `#6A4038` `#7A4840` `#8A5048` `#9A6050` `#AA7848` `#C89040` `#D9A038` `#F2B84B`

---

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
