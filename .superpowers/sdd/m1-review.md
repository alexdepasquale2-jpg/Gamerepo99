# M1 Review — The Last Spark scaffold

- **Commit:** `1417e2bd8483032f8ab2f1c0e4e57e01e5ca8050` (`main`)
- **Scope:** TypeScript + Vite + Phaser 3 wander demo; pure `src/sim` (seeded RNG, event bus, deterministic tick); Vitest; STRUCTURE.md boundaries; free tools only
- **Verified this review:** `npm test` → 12/12 pass; `npm run build` → `tsc --noEmit` + Vite build exit 0
- **Reviewer stance:** read-only; no source changes

---

## Strengths

1. **M1 kill criteria met.** Tick / RNG / event-bus tests exist and pass; production build succeeds; wander scene draws a seeded tile map and advances NPCs on a fixed sim step (`stepMs = 280`).
2. **Sim stays free of Phaser.** `src/sim/*` imports only itself; Phaser is confined to `main.ts` + `src/render/*`.
3. **Seeded Mulberry32 RNG** with an explicit “does not call `Math.random`” test; world creation + tick share one RNG stream, and tick determinism is asserted across two worlds with the same seed.
4. **Event bus is small and correct for M1:** subscribe / emit / unsubscribe / no cross-talk; emit snapshots the listener set so unsubscribe during emit is safe.
5. **Layout largely matches STRUCTURE.md:** `sim` / `data` / `render` / `ui` / `tests/sim` / `scripts` / `docs`; kebab-case modules; soft size caps respected for code files.
6. **Free stack only in the M1 commit:** `phaser`, `typescript`, `vite`, `vitest` (no paid services).
7. **Render drives sim via `tick(world)`** rather than poking NPC fields from Phaser — good command boundary for M2 systems to plug into.
8. **Colony gameplay correctly absent** from sim (post-pivot); Loom’s content JSON left in `src/data` for later milestones.

---

## Critical issues

None that block the stated M1 kill criteria (`npm test`, `npm run build`, wander demo architecture).

---

## Important issues

1. **`src/sim/save.ts` uses `localStorage` (DOM) inside `sim`.**  
   STRUCTURE forbids DOM in `sim`. The guards (`typeof localStorage === 'undefined'`) keep tests from crashing, but the module still couples pure logic to a browser API and is not exported from `src/sim/index.ts`, not tested, and not wired from `main` / UI.  
   **Fix for M2:** keep pure serialize/deserialize in `sim`; put `localStorage` I/O in `ui` or a thin `src/persist/` adapter.

2. **Visual values live in sim.**  
   `Npc.color` and `NPC_COLORS` in `world.ts` / `types.ts` violate “Visual values (colors, sprite keys) belong in `render` or `data`, not `sim`.” Render already maps tile kinds → colors; NPC tint should follow the same pattern (id / archetype → palette in render or data).

3. **Map / spawn tuning hardcoded in `world.ts`.**  
   Thresholds `0.12` / `0.18`, center clear radius, and spawn attempt multiplier are magic numbers. STRUCTURE wants tuning in `data/`. `src/data/map.json` only carries size/seed/npcCount — fine for M1, but M2 Ashford should load tile rules from JSON.

4. **`src/data/hooks.json` is over the 400-line hard cap** (~447 lines in tree). STRUCTURE says split by category. (Commit message says Loom data was untouched — still a checklist failure until split.)

5. **STRUCTURE doc drift vs code.**  
   Doc mentions `src/sim/events.ts` and types under `src/sim/types/`; code has `event-bus.ts` and flat `types.ts`. Not a runtime bug, but the milestone checklist asks layout to match the doc — update one side before M2 review noise.

6. **Save/load requirement is scaffold-only.**  
   Original M1 brief asked for localStorage save/load. Blob shape exists; nothing reads or writes it in the game loop. Acceptable as stub if Niblet scoped M1 to wander + tests, but it should be called out so M2 does not assume persistence works.

---

## Minor issues

1. **`src/ui/hud.ts` is a no-op.** `setStatus` writes a closed-over string never read; `main.ts` calls it once. Dead weight / false wiring. Either drop until needed or have HUD observe bus / DOM.
2. **`BootScene` only `scene.start('wander')`.** Harmless, but could boot Wander directly until real preload assets exist.
3. **Wander sync ignores the event bus** (polls after `tick`). Fine for M1; for M2 prefer bus-driven or immutable snapshot reads so render never holds a mutable world reference longer than needed.
4. **Event names are untyped strings** (`'tick'`, `'moved'`). Introduce a typed event map before many systems subscribe.
5. **No `assets/` directory** while Vite `publicDir: 'assets'`.** Empty/missing is OK for rectangle/circle demo; add when Prism art lands.
6. **Chunk-size warning on build** (Phaser ~1.5 MB). Expected; defer code-splitting.
7. **RNG `nextInt` exclusive-max is undocumented in the public type** (tests encode `[min, max)`). One-line JSDoc would prevent off-by-one in M2 callers.
8. **`createHud` import creates a sim/UI split that render does not use** for the on-canvas caption — caption is drawn inside `WanderScene`, which blurs ui vs render slightly (STRUCTURE: no render↔ui imports; sharing via caption in render is OK, but then HUD stub is redundant).

---

## Assessment

**Ready for M2? Yes — with the Important items treated as first chores, not blockers.**

M1 deliverables are green: pure-enough sim core (aside from the unused `save.ts` DOM coupling), seeded RNG, event bus, deterministic tick, Vitest coverage of those three, Vite+Phaser tile map with wandering people, free toolchain, and STRUCTURE folder shape in place.

Before or as the first M2 Ashford slice:

- Move persistence I/O out of `sim` (or delete the stub until wired).
- Strip colors from sim types; map visuals in render/data.
- Align STRUCTURE.md names with `event-bus.ts` / `types.ts` (or rename to match the doc).
- Plan the `hooks.json` split so content growth does not keep failing the hard cap.

No source files were modified by this review.
