import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { CHUNK_SIZE } from '../../../src/sim/map/constants';
import { createNavigator, type Tile } from '../../../src/sim/map/nav';
import { createStampRasterSource } from '../../../src/sim/map/stamp-raster';
import { riverRow } from '../../../src/sim/map/terrain';
import { createTerrainAccess } from '../../../src/sim/map/terrain-access';
import { layoutWorld } from '../../../src/sim/map/world-layout';

const SEEDS = [7, 11, 23, 101];
const setup = (seed: number) => {
  const world = generateWorld({ seed, peopleCount: 8 });
  const layout = layoutWorld(world, seed);
  const terrain = createTerrainAccess(layout, seed);
  return { world, layout, terrain, nav: createNavigator(terrain) };
};
/** First ford tile along the river within the populated area, with its wet run. */
const findFord = (t: ReturnType<typeof setup>, seed: number) => {
  // Stay inside the raster's padded layout box (tiles outside it are never materialised).
  const qs = t.layout.settlements.map((s) => s.q), rs = t.layout.settlements.map((s) => s.r);
  const inside = (q: number, r: number) => q > Math.min(...qs) - 38 && q < Math.max(...qs) + 38 && r > Math.min(...rs) - 38 && r < Math.max(...rs) + 38;
  for (let q = Math.min(...qs) - 38; q <= Math.max(...qs) + 38; q++) {
    for (let r = Math.round(riverRow(seed, q)) - 12; r <= Math.round(riverRow(seed, q)) + 12; r++) if (inside(q, r) && t.terrain.isFord(q, r)) return { q, r };
  }
  return null;
};

describe('fords', () => {
  it('exist in generated worlds, are shallow water cells and are passable', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const t = setup(seed);
      for (let q = -400; q <= 1400; q++) for (let r = -80; r <= 80; r++) {
        if (!t.terrain.isFord(q, r)) continue;
        seen++;
        expect(t.terrain.biome(q, r)).toBe('water');
        expect(t.terrain.isDeck(q, r)).toBe(false);
        expect(t.terrain.passable(q, r)).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('are deterministic and cross bank to bank (land beyond both ends of every ford column)', () => {
    const a = setup(7), b = setup(7);
    const cols = new Map<number, number[]>();
    for (let q = -400; q <= 1400; q++) for (let r = -80; r <= 80; r++) {
      expect(a.terrain.isFord(q, r)).toBe(b.terrain.isFord(q, r));
      if (a.terrain.isFord(q, r)) cols.set(q, [...(cols.get(q) ?? []), r]);
    }
    expect(cols.size).toBeGreaterThan(0);
    for (const [q, rs] of cols) {
      const lo = Math.min(...rs), hi = Math.max(...rs);
      expect(a.terrain.biome(q, lo - 1)).not.toBe('water');
      expect(a.terrain.biome(q, hi + 1)).not.toBe('water');
      expect(rs.length).toBe(hi - lo + 1);
    }
  });

  it('are emitted as distinct "ford" tiles by the stamp raster', () => {
    for (const seed of SEEDS) {
      const t = setup(seed), ford = findFord(t, seed);
      if (!ford) continue;
      const chunk = createStampRasterSource(t.world, seed).getChunk({ cx: Math.floor(ford.q / CHUNK_SIZE), cy: Math.floor(ford.r / CHUNK_SIZE) });
      expect(chunk.tiles.find((x) => x.q === ford.q && x.r === ford.r)?.biomeId).toBe('ford');
      return;
    }
    throw new Error('no ford found in any test seed');
  });
});

describe('navigator on synthetic water', () => {
  // Wall of deep water at q=5 with a single ford at r=3, plus a lone bridge at r=9.
  const wet = (q: number, r: number) => q === 5 && r !== 3 && r !== 9;
  const nav = createNavigator({ passable: (q, r) => !wet(q, r) && q >= 0 && q < 12 && r >= 0 && r < 12 });
  const walk = (a: Tile, b: Tile) => nav.findPath(a, b)!;

  it('routes through the gap and never steps on water', () => {
    const path = walk({ q: 1, r: 0 }, { q: 9, r: 0 });
    expect(path.some((t) => t.q === 5 && t.r === 3)).toBe(true);
    for (const t of path) expect(wet(t.q, t.r)).toBe(false);
  });

  it('picks the nearer crossing and does not cut corners across water', () => {
    const path = walk({ q: 1, r: 10 }, { q: 9, r: 10 });
    expect(path.some((t) => t.q === 5 && t.r === 9)).toBe(true);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!;
      expect(Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r))).toBe(1);
      expect(wet(a.q, b.r) || wet(b.q, a.r)).toBe(false);
    }
  });

  it('returns null when the far side is unreachable or the goal is water', () => {
    const sealed = createNavigator({ passable: (q, r) => q !== 5 && q >= 0 && q < 12 && r >= 0 && r < 12 });
    expect(sealed.findPath({ q: 1, r: 1 }, { q: 9, r: 1 })).toBeNull();
    expect(sealed.route({ x: 48, y: 48 }, { x: 5 * 32 + 16, y: 48 })).not.toBeNull(); // snaps to a bank
    expect(nav.findPath({ q: 1, r: 1 }, { q: 5, r: 1 })).toBeNull();
  });

  it('route() waypoints are all standable and snap water targets to the shore', () => {
    const way = nav.route({ x: 1 * 32 + 16, y: 5 * 32 + 16 }, { x: 5 * 32 + 16, y: 5 * 32 + 16 })!;
    expect(way.length).toBeGreaterThan(0);
    for (const p of way) expect(nav.walkableAt(p.x, p.y)).toBe(true);
  });
});

describe('navigator on generated worlds', () => {
  it('road points of every route (caravan wagons) always rest on land, bridge or ford', () => {
    for (const seed of SEEDS) {
      const { layout, nav } = setup(seed);
      expect(layout.routes.length).toBeGreaterThan(0);
      for (const route of layout.routes) for (let i = 0; i <= 600; i++) {
        const p = nav.roadPoint(route.path, i / 600);
        expect(nav.walkable(Math.round(p.q), Math.round(p.r)), `${seed} ${route.id} @${i}`).toBe(true);
      }
    }
  });

  it('a villager route across the river uses a ford or bridge, never open water', () => {
    let crossed = 0;
    for (const seed of SEEDS) {
      const t = setup(seed), ford = findFord(t, seed);
      if (!ford) continue;
      let lo = ford.r, hi = ford.r;
      while (t.terrain.isFord(ford.q, lo - 1)) lo--;
      while (t.terrain.isFord(ford.q, hi + 1)) hi++;
      const from = t.nav.centerOf(ford.q, lo - 3), to = t.nav.centerOf(ford.q, hi + 3);
      const way = t.nav.route(from, to);
      if (!way) continue; // banks sealed off by a lake: nothing to assert
      crossed++;
      let prev = from;
      for (const p of way) {
        for (let s = 0; s <= 8; s++) expect(t.nav.walkableAt(prev.x + (p.x - prev.x) * s / 8, prev.y + (p.y - prev.y) * s / 8)).toBe(true);
        prev = p;
      }
      const tiles = way.map((p) => t.nav.tileAt(p.x, p.y));
      expect(tiles.some((x) => t.terrain.isFord(x.q, x.r) || t.terrain.isDeck(x.q, x.r))).toBe(true);
    }
    expect(crossed).toBeGreaterThan(0);
  });
});
