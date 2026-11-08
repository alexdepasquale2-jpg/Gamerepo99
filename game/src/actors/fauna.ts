/**
 * Animals from data/world/fauna.json, wandering by biome. The land is cut into cells; a cell near the
 * camera wakes and seeds its animals deterministically (same seed, same rabbits), and sleeps again when
 * the camera leaves. Prey bolt from the player; birds fly; fish stay in the water.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt, Thing } from '../app/contracts';
import faunaJson from '../data/world/fauna.json';
import { TILE_PX } from '../sim/map/constants';
import { biomeAt, type Biome } from '../sim/map/terrain';
import { deriveRng } from '../sim/rng';
import { ART_SCALE, ensureShadow, faunaTexture } from './looks';
import { viewRect, type TownIndex } from './towns';
import { noteUse } from '../sim/data-use-world';

type FaunaRow = { id: string; name: string; biomeIds: string[]; tags: string[] };
const ROWS = (faunaJson as { fauna: FaunaRow[] }).fauna;

/** The map's coarse biomes, read as the fabric's named biomes the fauna table speaks of. */
const FABRIC: Record<Biome, string[]> = {
  forest: ['ash_wood', 'peat_fen'],
  hills: ['chalk_downs', 'slag_verge', 'glare_approach'],
  fields: ['mill_heath'],
  meadow: ['mill_heath', 'chalk_downs'],
  water: ['river_margin', 'brine_marsh'],
};

const CELL = 20 * TILE_PX;
const PER_CELL_MAX = 2;
const FLEE_PX = 70;

type Animal = {
  id: string;
  row: FaunaRow;
  home: Pt;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  fleeing: number;
  seed: number;
  s: Phaser.GameObjects.Sprite;
  shadow?: Phaser.GameObjects.Image;
};

export type FaunaCtl = {
  update(dt: number, timeSec: number, player: Pt): void;
  things(near: Pt, radius: number): Thing[];
  list(): { id: string; faunaId: string; x: number; y: number }[];
  destroy(): void;
};

const has = (r: FaunaRow, tag: string) => r.tags.includes(tag);
/** Birds fly, fish swim, herons wade (wet or dry), the rest walk on dry land. */
type Mode = 'fly' | 'swim' | 'wade' | 'walk';
const modeOf = (r: FaunaRow): Mode => (has(r, 'water') ? (has(r, 'flyer') ? 'wade' : 'swim') : has(r, 'flyer') ? 'fly' : 'walk');
const fits = (m: Mode, wet: boolean): boolean => (m === 'swim' ? wet : m === 'walk' ? !wet : true);

export function createFauna(ctx: GameContext, towns: TownIndex): FaunaCtl {
  const scene = ctx.scene;
  const cells = new Map<string, Animal[]>();
  const nav = ctx.world.nav;

  const spawnCell = (cx: number, cy: number): Animal[] => {
    const rng = deriveRng(ctx.seed, 'fauna', cx, cy);
    const n = rng.next() < 0.35 ? 0 : rng.int(1, PER_CELL_MAX + 1);
    const out: Animal[] = [];
    for (let i = 0; i < n; i++) {
      const x = (cx + rng.next()) * CELL, y = (cy + rng.next()) * CELL;
      const t = nav.tileAt(x, y);
      const biome = biomeAt(ctx.seed, t.q, t.r);
      const fabric = FABRIC[biome] ?? [];
      const nearTown = towns.nearest({ x, y }, TILE_PX * 10);
      const wet = !nav.walkable(t.q, t.r);
      const pool = ROWS.filter((r) => r.biomeIds.some((b) => fabric.includes(b)) && fits(modeOf(r), wet) && (!nearTown || !has(r, 'predator')));
      // Inside a town only birds, rats and livestock stay; the wild keeps to the wild.
      const tame = nearTown && Math.hypot(x - towns.centre(nearTown.id)!.x, y - towns.centre(nearTown.id)!.y) < TILE_PX * 6;
      if (tame) pool.splice(0, pool.length, ...pool.filter((r) => has(r, 'flyer') || has(r, 'scavenger') || has(r, 'livestock')));
      if (!pool.length) { rng.next(); continue; }
      // Livestock keeps near people; wild things keep away from them.
      const weighted = pool.filter((r) => (has(r, 'livestock') ? !!nearTown : true));
      const row = (weighted.length ? weighted : pool)[rng.int(0, (weighted.length ? weighted : pool).length)]!;
      const tex = faunaTexture(scene, row.id);
      // The animal is on screen: its fauna row and its art subject (overworld-assets fauna.<id>) are seen.
      noteUse('fauna.drawn', row.id); noteUse('art', `fauna.${row.id}`);
      const s = scene.add.sprite(x, y, tex, '0').setOrigin(0.5, 1).setScale(ART_SCALE);
      const shadow = modeOf(row) === 'swim' ? undefined : scene.add.image(x, y, ensureShadow(scene)).setScale(0.6, 0.6).setAlpha(0.8);
      out.push({ id: `${row.id}@${cx},${cy}#${i}`, row, home: { x, y }, x, y, tx: x, ty: y, wait: rng.next() * 3, fleeing: 0, seed: rng.next() * 100, s, shadow });
    }
    return out;
  };

  const okAt = (a: Animal, x: number, y: number): boolean => {
    const m = modeOf(a.row);
    if (m === 'fly' || m === 'wade') return true;
    const t = nav.tileAt(x, y);
    return fits(m, !nav.walkable(t.q, t.r));
  };

  const stepAnimal = (a: Animal, dt: number, timeSec: number, player: Pt): void => {
    const mode = modeOf(a.row);
    const flyer = mode === 'fly';
    const prey = has(a.row, 'prey') || has(a.row, 'grazer') || has(a.row, 'flyer') || has(a.row, 'scavenger');
    const pd = Math.hypot(player.x - a.x, player.y - a.y);
    if (prey && pd < FLEE_PX && a.fleeing <= 0) {
      const k = (FLEE_PX * 1.6) / Math.max(1, pd);
      a.tx = a.x + (a.x - player.x) * k;
      a.ty = a.y + (a.y - player.y) * k;
      a.fleeing = 1.6;
    }
    a.fleeing -= dt;
    a.wait -= dt;
    if (a.wait <= 0 && a.fleeing <= 0) {
      const r = deriveRng(ctx.seed, a.id, Math.floor(timeSec / 3)).next;
      const range = flyer ? TILE_PX * 6 : has(a.row, 'grazer') ? TILE_PX * 4 : TILE_PX * 2.5;
      a.tx = a.home.x + (r() - 0.5) * range * 2;
      a.ty = a.home.y + (r() - 0.5) * range * 1.4;
      a.wait = 2 + r() * 4;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    const speed = (a.fleeing > 0 ? 90 : flyer ? 40 : 18) * (has(a.row, 'small') ? 1.2 : 1);
    let moving = false;
    if (d > 1.5) {
      const st = Math.min(d, speed * dt);
      const nx = a.x + (dx / d) * st, ny = a.y + (dy / d) * st;
      if (okAt(a, nx, ny)) { a.x = nx; a.y = ny; moving = true; } else { a.tx = a.x; a.ty = a.y; }
      a.s.setFlipX(dx < 0);
    }
    const lift = flyer ? 18 + Math.sin(timeSec * 2 + a.seed) * 4 : mode === 'swim' ? -2 : 0;
    const hop = has(a.row, 'small') && moving ? Math.abs(Math.sin(timeSec * 12 + a.seed)) * 3 : 0;
    const frame = flyer ? (Math.floor(timeSec * 8 + a.seed) % 2) : moving ? Math.floor(timeSec * 6 + a.seed) % 2 : 0;
    a.s.setFrame(String(frame)).setPosition(a.x, a.y - lift - hop).setDepth(flyer ? a.y + 400 : a.y);
    if (mode === 'swim') a.s.setAlpha(0.55 + 0.45 * Math.max(0, Math.sin(timeSec * 0.9 + a.seed)));
    a.shadow?.setPosition(a.x, a.y).setDepth(a.y - 0.5);
  };

  const kill = (list: Animal[]) => list.forEach((a) => { a.s.destroy(); a.shadow?.destroy(); });

  return {
    update(dt, timeSec, player) {
      const indoors = !!ctx.world.room();
      const vr = viewRect(scene, CELL / 4);
      const want = new Set<string>();
      if (!indoors) {
        for (let cx = Math.floor(vr.x0 / CELL); cx <= Math.floor(vr.x1 / CELL); cx++) {
          for (let cy = Math.floor(vr.y0 / CELL); cy <= Math.floor(vr.y1 / CELL); cy++) want.add(`${cx},${cy}`);
        }
      }
      for (const [k, list] of cells) if (!want.has(k)) { kill(list); cells.delete(k); }
      for (const k of want) {
        if (!cells.has(k)) { const [cx, cy] = k.split(',').map(Number) as [number, number]; cells.set(k, spawnCell(cx, cy)); }
      }
      for (const list of cells.values()) for (const a of list) stepAnimal(a, dt, timeSec, player);
    },
    things(near, radius) {
      const out: Thing[] = [];
      for (const list of cells.values()) for (const a of list) {
        if (Math.hypot(a.x - near.x, a.y - near.y) > radius) continue;
        out.push({ key: `fauna:${a.id}`, kind: 'fauna', id: a.id, x: a.x, y: a.y, label: a.row.name, target: { kind: 'fauna', id: a.id, data: { faunaId: a.row.id, tags: a.row.tags } }, reach: 56 });
      }
      return out;
    },
    list: () => [...cells.values()].flat().map((a) => ({ id: a.id, faunaId: a.row.id, x: Math.round(a.x), y: Math.round(a.y) })),
    destroy() { for (const list of cells.values()) kill(list); cells.clear(); },
  };
}
