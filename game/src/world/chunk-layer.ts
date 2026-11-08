/**
 * Streams terrain chunks around the player: one baked ground image per chunk (GROUND_DEPTH, under every
 * y-sorted thing) plus its standing props, faded in as they arrive and dropped when left behind.
 * Builds at most one chunk per frame while walking; a forced sync (arrival, teleport) builds all at once.
 * Build time per chunk is kept (stats(); logged every 16 builds in dev) so the L4 ground detail stays in budget.
 */
import type Phaser from 'phaser';
import type { TileSource } from '../sim/map/tile-source';
import type { ChunkCoord, ChunkTiles, FacilityRenderView } from '../sim/map/types';
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import { chunksAround } from '../sim/map/chunks-around';
import { chunkEdits, type TileEdits } from '../sim/map/tile-edits';
import { paintGround } from './ground-paint';
import { mountProps, propFoot } from './props';
import { GROUND_DEPTH } from './depth';
import { ART_SCALE } from './art/px';

const MARGIN = 1;
const FADE_MS = 180;
const DEV = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

/** Chunk build timings (ms): ground paint alone and the whole build (paint + texture + props). */
export type ChunkStats = { builds: number; paintAvg: number; paintMax: number; buildAvg: number; buildMax: number; last: number };

type Mounted = { key: string; chunk: ChunkTiles; tex: string; ground: Phaser.GameObjects.Image; props: Phaser.GameObjects.GameObject[]; edits: string };
export type DrawnTile = { ground?: string; props: string[] };

export type ChunkLayer = {
  /** Mount the chunks around tile (q, r); returns true while some are still pending. */
  sync(q: number, r: number, force?: boolean): boolean;
  /** Unmount chunks (all when omitted) so the next sync rebuilds them. */
  invalidate(coords?: ChunkCoord[]): void;
  /** Rebuild the mounted chunks whose saved tile edits changed. Returns how many. */
  refreshEdits(edits: TileEdits | undefined): number;
  /** What is drawn on a tile: its ground id and the props standing there (land acts read this). */
  drawn(q: number, r: number): DrawnTile;
  /** The props standing in mounted chunks within `radius` px of a point, with where each stands (px). */
  propsNear(near: { x: number; y: number }, radius: number): { prop: FacilityRenderView; x: number; y: number }[];
  /** Hide or show every mounted chunk (interiors hide the world). */
  setVisible(on: boolean): void;
  count(): number;
  stats(): ChunkStats;
  destroy(): void;
};

export function createChunkLayer(
  scene: Phaser.Scene, source: TileSource, around: (q: number, r: number) => string, under: (q: number, r: number) => string, edits: () => TileEdits | undefined, seed = 0,
): ChunkLayer {
  const mounted = new Map<string, Mounted>();
  const drawnCache = new Map<string, Map<string, DrawnTile>>();
  const keyOf = (c: ChunkCoord) => `${c.cx},${c.cy}`;
  const sigOf = (cx: number, cy: number) => JSON.stringify(chunkEdits(edits(), cx, cy) ?? null);
  let gen = 0;
  let visible = true;
  const times = { builds: 0, paint: 0, paintMax: 0, build: 0, buildMax: 0, last: 0 };
  const stats = (): ChunkStats => {
    const n = Math.max(1, times.builds), r = (v: number) => Math.round(v * 100) / 100;
    return { builds: times.builds, paintAvg: r(times.paint / n), paintMax: r(times.paintMax), buildAvg: r(times.build / n), buildMax: r(times.buildMax), last: r(times.last) };
  };

  const unmount = (k: string): void => {
    const m = mounted.get(k);
    if (!m) return;
    m.ground.destroy();
    for (const o of m.props) o.destroy();
    if (scene.textures.exists(m.tex)) scene.textures.remove(m.tex);
    mounted.delete(k);
  };

  const build = (c: ChunkCoord, fade: boolean): void => {
    const t0 = performance.now();
    const k = keyOf(c);
    const chunk = source.getChunk(c);
    const tex = `w-ground-${k}-${gen++}`;
    const t1 = performance.now();
    const canvas = paintGround(chunk, around, under, seed);
    const paintMs = performance.now() - t1;
    scene.textures.addCanvas(tex, canvas);
    const ground = scene.add.image(c.cx * CHUNK_SIZE * TILE_PX, c.cy * CHUNK_SIZE * TILE_PX, tex).setOrigin(0, 0).setScale(ART_SCALE).setDepth(GROUND_DEPTH).setVisible(visible);
    const props = mountProps(scene, chunk.props);
    for (const p of props) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    if (fade) {
      const targets = [ground, ...props];
      for (const t of targets) (t as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
      scene.tweens.add({ targets, alpha: 1, duration: FADE_MS });
    }
    mounted.set(k, { key: k, chunk, tex, ground, props, edits: sigOf(c.cx, c.cy) });
    drawnCache.delete(k);
    const buildMs = performance.now() - t0;
    times.builds++; times.paint += paintMs; times.build += buildMs; times.last = buildMs;
    times.paintMax = Math.max(times.paintMax, paintMs); times.buildMax = Math.max(times.buildMax, buildMs);
    if (DEV && times.builds % 16 === 0) console.debug('[chunks]', stats());
  };

  const drawnOf = (cx: number, cy: number): Map<string, DrawnTile> => {
    const k = `${cx},${cy}`;
    let tiles = drawnCache.get(k);
    if (tiles) return tiles;
    tiles = new Map();
    const chunk = mounted.get(k)?.chunk ?? source.getChunk({ cx, cy });
    for (const t of chunk.tiles) tiles.set(`${t.q},${t.r}`, { ground: t.biomeId, props: [] });
    for (const p of chunk.props) {
      const tk = `${p.position.x},${p.position.y}`;
      const cell = tiles.get(tk) ?? { props: [] };
      cell.props.push(p.type);
      tiles.set(tk, cell);
    }
    if (drawnCache.size > 16) drawnCache.clear();
    drawnCache.set(k, tiles);
    return tiles;
  };

  return {
    sync(q, r, force = false) {
      const coords = chunksAround(q, r, CHUNK_SIZE, MARGIN);
      const want = new Set(coords.map(keyOf));
      for (const k of [...mounted.keys()]) if (!want.has(k)) unmount(k);
      const cq = Math.floor(q / CHUNK_SIZE), cr = Math.floor(r / CHUNK_SIZE);
      const todo = coords.filter((c) => !mounted.has(keyOf(c)))
        .sort((a, b) => Math.hypot(a.cx - cq, a.cy - cr) - Math.hypot(b.cx - cq, b.cy - cr));
      const budget = force ? todo.length : 1;
      for (const c of todo.slice(0, budget)) build(c, !force);
      return todo.length > budget;
    },
    invalidate(coords) {
      for (const k of coords ? coords.map(keyOf) : [...mounted.keys()]) { unmount(k); drawnCache.delete(k); }
    },
    refreshEdits() {
      let n = 0;
      drawnCache.clear();
      for (const m of [...mounted.values()]) {
        const [cx, cy] = m.key.split(',').map(Number) as [number, number];
        if (sigOf(cx, cy) === m.edits) continue;
        unmount(m.key);
        build({ cx, cy }, false);
        n++;
      }
      return n;
    },
    drawn(q, r) {
      return drawnOf(Math.floor(q / CHUNK_SIZE), Math.floor(r / CHUNK_SIZE)).get(`${q},${r}`) ?? { props: [] };
    },
    propsNear(near, radius) {
      const out: { prop: FacilityRenderView; x: number; y: number }[] = [];
      const span = CHUNK_SIZE * TILE_PX;
      for (const m of mounted.values()) {
        const [cx, cy] = m.key.split(',').map(Number) as [number, number];
        // Skip chunks the circle cannot touch.
        if (near.x < cx * span - radius || near.x > (cx + 1) * span + radius || near.y < cy * span - radius || near.y > (cy + 1) * span + radius) continue;
        for (const prop of m.chunk.props) {
          const at = propFoot(prop);
          if (Math.hypot(at.x - near.x, at.y - near.y) <= radius) out.push({ prop, ...at });
        }
      }
      return out;
    },
    setVisible(on) {
      visible = on;
      for (const m of mounted.values()) {
        m.ground.setVisible(on);
        for (const p of m.props) (p as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
      }
    },
    count: () => mounted.size,
    stats,
    destroy() {
      for (const k of [...mounted.keys()]) unmount(k);
      drawnCache.clear();
    },
  };
}
