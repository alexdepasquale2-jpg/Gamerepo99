# M6 step 8 juice check

Spec: tests/e2e/m6-juice-screenshots.spec.ts (1280x800, DSF 1). Shots: docs/qa/screenshots/{baseline,reignite,despair}.png.
Hooks: `__hearth.scene.bus.emit('vfx.reignite')` at the player (350 ms in); `__hearth.surface.setDespairOverride(town, 1)` for all towns.

- Reignite: PRESENT but subtle. Small yellow spark/glitter burst on the villager cluster; no full-screen flash or visible warm color wash at 350 ms. Consider a stronger/longer flash.
- Despair: PRESENT and clear. Buildings, fences, well, sprites go grey; smoke wisps appear. Terrain/grass stays green (only town art is desaturated).
- Build: dist 3.9M total; main JS index-*.js 2,448,814 B (2.39 MB raw), 519803 B gzip (~507 kB). Chunk-size warning (>500 kB) remains.
- Verdict: PASS with note on reignite flash strength.
