# Hearthfall — UI & Juice Spec

**Owner:** Prism · **Engine:** Phaser 3 (`src/render`, `src/ui`)  
**Sim contract:** warmth `0..1` + bus events only — **no feel numbers in sim**  
**Tunables:** `src/render/feel.ts` · **VFX:** `src/render/spark-fx.ts`  
**Palette:** `PALETTE.md` · **Art lock:** `STYLE_SPEC_2.5D.md`  
**Companion draft:** `UI_JUICE.md` (superseded by this spec for HUD/a11y)

---

## 1. Principles

1. Cozy readable HUD; grit in overlays (marks, bonds, letters).  
2. Feel numbers live **only** in `feel.ts`.  
3. Despair/alive via **per-pixel** warmth lerp on world materials — never a translucent overlay band.  
4. Spark is always **dual-cued**: gold `#F2B84B` fill + cyan `#5EC8C8` outline.  
5. Cost-to-self is visible whenever spark is spent (player flash, drain motes, HUD tick).  
6. Accessibility: color is never the sole cue; motion can be reduced.

---

## 2. HUD layout (32px-cell world)

| Element | Placement | Behavior |
|---------|-----------|----------|
| Spark bar | Top-left (`FEEL.hud`) | Gold fill, cyan outline; ticks down on `vfx.spark_spent` |
| Day / phase | Top-center muted | Dawn / day / dusk |
| Method radial / list | Bottom | Challenge · Shame · Inspire · Carry · Lie — always listed; refusal juice on confirm |
| Person inspect | Side panel | Name, wound, flame pip, marks, first line |
| Town warmth vignette | Soft full-screen | Average tile warmth → slight grade (presentation) |
| Letter / rumor chip | Edge of screen | Envelope mote when transit active |

Demo keys (WanderScene): `1` spark · `2` reignite · `3` refusal · `4` burnout.

---

## 3. Mood / bond overlays

| Overlay | Visual | Drive |
|---------|--------|-------|
| Mood pip | Under person; width ∝ warmth/flame | tile/person warmth |
| Bond line | Soft cyan-gold polyline player↔bonded when inspect open | bond id from sim |
| Marks | Hollow / dependent / grown rings (`PALETTE`) + short label | mark state |
| Reignite wash | Expanding warm ADD bloom + ring from event point | `vfx.reignite` + warmthBefore/After |

---

## 4. Letters in transit

- Envelope mote travels along `links` path (world map or overworld).  
- Speed / bob / trail = render feel only.  
- Arrival: small spark dual-cue pop + optional mood pip bump.  
- Despair routes: dimmer envelope, slower trail; alive: warmer paper tint.

---

## 5. Spark / reignite VFX (implemented)

| Event | Presentation |
|-------|----------------|
| `vfx.spark_spent` | Hit-stop, camera shake, gold+cyan particles, gather ring, **cost-to-self** (cyan flash, afterimage, drain motes, vignette), HUD bar tick |
| `vfx.reignite` | Hit-stop, shake, glow bloom, **color wash** (warmth-delta scaled), warm+gold particles |
| `vfx.refusal` | Dim flash + sparse grey particles |
| `vfx.burnout` | Snuff circle + brief camera fade |

All timings/intensities: `FEEL.*`.

---

## 6. Method juice (when methods fire)

| Method | Tell |
|--------|------|
| Challenge | Sharp outward ring; Brood gaze lime `#E8F090` |
| Shame | Seal stamp `#C45A3A` |
| Inspire | Rising motes + proof icon |
| Carry | Dust + lift tween |
| Lie | Ink/wine blot `#6A3048` then settle |

---

## 7. Succession (LOCKED copy)

- Body: `Your fire went out. Someone remembers it.`  
- Default: **Carry it on** · Quit: **Let it rest** (never shamed)  
- Visual: burnout snuff → soft ember on successor portrait.

---

## 8. Readability

- UI chrome stays slightly warmer / higher contrast than despair world.  
- Min body text ≥ 12px UI / 10px mono labels.  
- Spark bar always outlined (cyan) so empty fill remains legible on dark HUD.  
- Person names and marks use high-contrast chips, not thin strokes on grass.  
- Depth-sorted world sprites must not cover critical HUD (HUD scrollFactor 0, high depth).

---

## 9. Accessibility

| Concern | Spec |
|---------|------|
| Color blindness | Dual-cue spark (shape + two hues); marks use ring style not hue alone |
| Photosensitivity | Default shake ≤ `0.005`; hit-stop ≤ 60ms; no full-screen strobe |
| Reduced motion | Future setting: skip shake/hit-stop; keep wash as slow alpha only |
| Screen reader / captions | Method confirms + letter arrival get short toast text |
| Contrast | HUD text on `#0B0A0F` chips; WCAG-ish AA for labels |

---

## 10. Out of scope (later)

Full menu art, save slots, settings panel polish, runtime reduced-motion wiring (M6).
