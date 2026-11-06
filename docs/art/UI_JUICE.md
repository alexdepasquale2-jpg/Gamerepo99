# Hearthfall — UI & Juice Spec (M2 draft)

**Owner:** Prism · **Engine:** Phaser 3 (`src/render`, `src/ui`) · **Sim:** warmth + events only  
**Palette:** `PALETTE.md` · **VFX:** `src/render/spark-fx.ts` + `feel.ts`

## Principles

1. Cozy readable HUD; grit in overlays (marks, bonds, letters).  
2. Feel numbers live in `src/render/feel.ts` — never sim.  
3. Despair/alive via `warmth` lerp on materials; UI chrome stays slightly warmer than despair world so it remains readable.  
4. Spark always dual-cued (gold fill + cyan outline).

## HUD layout (32px-cell world)

| Element | Placement | Behavior |
|---------|-----------|----------|
| Spark bar | Top-left | Fill `#F2B84B`, outline `#5EC8C8`; spend anim ticks down with `vfx.spark_spent` |
| Day / phase | Top-center muted | Dawn / day / dusk label |
| Method radial / list | Bottom | Challenge · Shame · Inspire · Carry · Lie — always show; refusal plays on confirm |
| Person inspect | Side panel | Name, wound, flame pip, marks, first line |
| Town warmth vignette | Full-screen soft | Average tile warmth → slight grade |

## Overlays (grit)

- **Mood pip** under person: width ∝ flame/warmth.  
- **Bond line** between player and bonded person when inspect open.  
- **Marks:** hollow / dependent / grown rings (`PALETTE` tokens) + short label.  
- **Letter / rumor:** envelope mote along `links` path; speed is render feel.

## Method juice

| Method | Tell |
|--------|------|
| Challenge | Sharp outward ring; Brood gaze uses lime `#E8F090` flash |
| Shame | Seal stamp (`#C45A3A`); Ivy accent |
| Inspire | Rising motes; proof icon pop |
| Carry | Dust + lift tween (Marrow strong) |
| Lie | Ink blot / wine tint (`#6A3048`) then settle |

## Succession screen (LOCKED copy from DESIGN.md)

- Body: `Your fire went out. Someone remembers it.`  
- Default: **Carry it on** · Quit: **Let it rest** (never shamed)  
- Visual: burnout snuff → soft ember on successor portrait.

## Demo keys (WanderScene)

`1` spark spend · `2` reignite · `3` refusal · `4` burnout

## Out of scope for this draft

Full menu art, save slots, settings, accessibility panel (M6 polish).
