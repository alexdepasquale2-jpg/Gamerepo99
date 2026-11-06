# M3 2.5D Continuous Overworld Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a continuous, chunked, depth-sorted Phaser overworld driven by a pure seeded stamp `TileSource` over FabricWorld (minutes-scale roads + wilderness props), with a seam for native gen tiles later.

**Architecture:** `src/sim/map/` owns layout + `StampRasterSource` (`TileSource`). Phaser `OverworldScene` streams chunks, depth-sorts by foot-Y, follows the player. Town exploration scene removed from boot. Spec: `docs/superpowers/specs/2026-11-05-m3-25d-overworld-foundation-design.md`.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Mulberry32, existing `asset-manifest` / `createPlaySession`.

## Global Constraints

- Pure sim: `src/sim/map/**` imports no Phaser and no `dyn/`.
- Square ortho: `q=x`, `r=y`.
- Soft cap 200 / hard 400 lines per file; split before merge.
- No `archetypeId ===` in `src/sim/`.
- Do not touch Prism `docs/art/` or `assets/vendor/` unless Prism greenlights.
- Defaults: `CHUNK_SIZE=32`, `TILES_PER_MINUTE=120`, `WALK_MINUTES_SPINE=3`.
- Screenshots → Niblet via Forge SendToAgent priority false (executor saves PNGs under `/workspace/hearthfall/artifacts/25d/`).

---

### Task 1: TileSource types + fingerprint harness

**Files:**
- Create: `src/sim/map/types.ts`, `src/sim/map/tile-source.ts`, `src/sim/map/fingerprint.ts`
- Create: `tests/sim/map/tile-source-types.test.ts`
- Modify: `src/sim/index.ts` (export public types only)

**Interfaces:**
- Produces: `ChunkCoord`, `ChunkTiles`, `TileSource`, `fingerprintHex(parts: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
import { fingerprintHex } from '../../../src/sim/map/fingerprint';
it('fingerprintHex is stable and seed-sensitive', () => {
  expect(fingerprintHex(['42', 'stamp'])).toBe(fingerprintHex(['42', 'stamp']));
  expect(fingerprintHex(['42', 'stamp'])).not.toBe(fingerprintHex(['43', 'stamp']));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/map/tile-source-types.test.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Minimal implementation** — types + `fingerprintHex` (FNV-1a or sha256 via node crypto in tests only; prefer pure FNV string hash in sim)

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit** `feat(map): TileSource types and fingerprint helper`

---

### Task 2: WorldLayout — settlement positions at walk scale

**Files:**
- Create: `src/sim/map/world-layout.ts`, `src/sim/map/constants.ts`
- Test: `tests/sim/map/world-layout.test.ts`

**Interfaces:**
- Consumes: `FabricWorld`, `generateWorld`
- Produces: `layoutWorld(world, seed): WorldLayout` with `settlements: {id,q,r}[]`, `routes: {id,from,to}[]`

- [ ] **Step 1: Failing test** — spine neighbors Manhattan or corridor length ≥ `0.8 * WALK_MINUTES_SPINE * TILES_PER_MINUTE`

```ts
const world = generateWorld({ seed: 7, peopleCount: 8 });
const layout = layoutWorld(world, 7);
const [a, b] = layout.settlements;
const d = Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
expect(d).toBeGreaterThanOrEqual(Math.floor(0.8 * 3 * 120));
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement layout** — place settlements along gap01 axis with spacing `WALK_MINUTES_SPINE * TILES_PER_MINUTE`, light seeded perpendicular jitter

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit** `feat(map): world layout at minutes-scale spacing`

---

### Task 3: StampRasterSource lazy getChunk + props

**Files:**
- Create: `src/sim/map/stamp-raster.ts`, `src/sim/map/corridor.ts`
- Test: `tests/sim/map/stamp-raster.test.ts`

**Interfaces:**
- Produces: `createStampRasterSource(world, seed): TileSource` (`kind:'stamp'`)
- `getChunk({cx,cy})` returns only that chunk’s tiles/props
- `fingerprint()` stable

- [ ] **Step 1: Failing tests** — (1) same seed fingerprint equal (2) getChunk far away returns empty-or-biome without throwing (3) a corridor chunk between two towns includes a road tile and ≥1 prop with type in `field|mine|camp|waystation`

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement** Bresenham corridors, biome fill per chunk AABB intersection with padded layout bbox, prop stamps at seeded intervals along roads; **no full-grid array**

- [ ] **Step 4: PASS** + assert soft caps

- [ ] **Step 5: Commit** `feat(map): stamp raster TileSource with lazy chunks`

---

### Task 4: Snapshot wiring + TownScene boot retirement

**Files:**
- Modify: `src/sim/world-render-snapshot.ts`, `src/sim/play-session*.ts` as needed
- Modify: `src/main.ts`, `src/render/boot-scene.ts`
- Test: `tests/sim/map/snapshot-chunks.test.ts` (and update `tests/ui/play-boot.test.ts` if chip assumptions break)

**Interfaces:**
- `getWorldRenderSnapshot({ source, chunks, day, tick })` fills `tiles`/`facilities` from listed chunks; keeps `towns` from layout

- [ ] **Step 1: Failing test** — snapshot for settlement chunk has `tiles.length > 0` and towns ≥3

- [ ] **Step 2–4: Implement + green**

- [ ] **Step 5: Commit** `feat(map): snapshot from TileSource chunks`

---

### Task 5: Phaser continuous OverworldScene (cam + depth + chunks)

**Files:**
- Modify: `src/render/overworld-scene.ts` (split if >200: `chunk-layer.ts`, `depth-sort.ts`)
- Modify: `src/ui/hud.ts`, `src/ui/method-menu.ts` for in-place open
- Remove TownScene from `main.ts` scene list (keep file stub OK)
- Test: extend `tests/ui/play-boot.test.ts` headless helpers; optional e2e later

- [ ] **Step 1: Failing test** — pure helper `chunksAround(cameraQ, cameraR, chunkSize, margin)` returns expected coords

- [ ] **Step 2–4: Scene loads source from session, streams chunks, player sprite depth=footY, camera.startFollow, WASD; near town opens method menu**

- [ ] **Step 5: `npm run build` + unit tests green; save screenshot(s) to `artifacts/25d/` via headed playwright or Phaser texture export if available

- [ ] **Step 6: Commit** `feat(m3): continuous chunked 2.5D overworld`

---

### Task 6: Verify + handoff

- [ ] `npm run validate && npm test && npm run test:bots && npm run build`
- [ ] Grep: no full-world `new Array(width*height)` in map/
- [ ] Forge → Niblet: hashes + screenshot attachments/paths, priority false
- [ ] Forge → Prism: TileSource keys used / prop types, priority false
- [ ] Commit any leftover Forge-only docs fixes

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Pure seeded rasterizer + fingerprint | 1–3 |
| Minutes-scale roads | 2–3 |
| Wilderness props on corridors | 3 |
| Lazy chunk getChunk | 3–5 |
| Seam for native tiles | 1 (`TileSource.kind`) |
| Continuous map / no town screen | 4–5 |
| Depth-sort + follow cam + chunks | 5 |
| Screenshots to Niblet | 5–6 |
