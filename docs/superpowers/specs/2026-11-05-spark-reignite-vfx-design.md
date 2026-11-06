# Spark / Reignite VFX + UI Juice — Design

**Role:** Prism · Phaser 3 render-only  
**Depends on:** M2 art lock (palette ramps, warmth 0..1)

## Brainstorm (self-approved)

1. Inline VFX in WanderScene — rejected (hard to test, couples demo).  
2. **`src/render/spark-fx.ts` presenter + EventBus events (CHOSEN)** — sim/ui emit; render plays particles/glow/shake/hit-stop; feel numbers stay in render.  
3. Full pipeline/camera stack — deferred to M6.

## Events (string bus; payloads plain data)

| Event | Payload | Visual |
|-------|---------|--------|
| `vfx.spark_spent` | `{ x,y, amount01 }` | Inward gold+cyan motes, bar tick, hit-stop 50ms, shake 1–2px |
| `vfx.reignite` | `{ x,y, warmthBefore, warmthAfter }` | Outward warm bloom, local glow |
| `vfx.refusal` | `{ x,y, kind }` | Dim flash / avert — no bloom |
| `vfx.burnout` | `{ x,y }` | Snuff + desat flash |

## Modules

- `src/render/spark-fx.ts` — `attachSparkFx(scene, bus)`  
- `src/render/feel.ts` — constants only (durations, amplitudes)  
- `docs/art/UI_JUICE.md` — HUD, marks, letters, succession, method feedback  
- Demo: WanderScene keys `1/2/3` emit sample VFX (dev only)

No Phaser imports in sim. No colors in sim.
