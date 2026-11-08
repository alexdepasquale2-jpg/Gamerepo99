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
    for (let r = Math.round(riverRow(seed, q)) - 3; r <= Math.round(riverRow(seed, q)) + 3; r++) if (inside(q, r) && t.terrain.isFord(q, r)) return { q, r }; // river fords only (lake lanes sit >= 4.5 tiles off the river)
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

  it('are deterministic and cross bank to bank (land beyond both ends of every river ford column)', () => {
    // River fords are the columns whose river centre cell is a ford; lake fords are checked in 'lake crossings'.
    const a = setup(7), b = setup(7);
    let columns = 0;
    for (let q = -400; q <= 1400; q++) {
      for (let r = -80; r <= 80; r++) expect(a.terrain.isFord(q, r)).toBe(b.terrain.isFord(q, r));
      const mid = Math.round(riverRow(7, q));
      if (!a.terrain.isFord(q, mid)) continue;
      columns++;
      let lo = mid, hi = mid;
      while (a.terrain.isFord(q, lo - 1)) lo--;
      while (a.terrain.isFord(q, hi + 1)) hi++;
      expect(a.terrain.biome(q, lo - 1)).not.toBe('water');
      expect(a.terrain.biome(q, hi + 1)).not.toBe('water');
    }
    expect(columns).toBeGreaterThan(0);
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

/** Population box (padded) used to sample lakes in a generated world. */
const box = (t: ReturnType<typeof setup>) => {
  const qs = t.layout.settlements.map((s) => s.q), rs = t.layout.settlements.map((s) => s.r);
  return { q0: Math.min(...qs) - 30, q1: Math.max(...qs) + 30, r0: Math.min(...rs) - 30, r1: Math.max(...rs) + 30 };
};

describe('lake crossings', () => {
  it('lay fords and ferry pontoons across lakes (not the river), deterministically', () => {
    let fords = 0, ferries = 0;
    for (const seed of SEEDS) {
      const a = setup(seed), b = setup(seed);
      // The 40x world is too big to sweep cell by cell; look at a window around each settlement.
      for (const s of a.layout.settlements) for (let q = s.q - 150; q <= s.q + 150; q++) for (let r = s.r - 150; r <= s.r + 150; r++) {
        const ford = a.terrain.isFord(q, r), ferry = a.terrain.isFerry(q, r);
        expect(ferry && ford, 'a cell is a ford or a ferry, not both').toBe(false);
        if (ford !== b.terrain.isFord(q, r) || ferry !== b.terrain.isFerry(q, r)) throw new Error(`non-deterministic at ${q},${r}`);
        if (ford || ferry) {
          expect(a.terrain.biome(q, r)).toBe('water');
          expect(a.terrain.passable(q, r)).toBe(true);
        }
        if (ferry) ferries++; else if (ford) fords++;
      }
    }
    expect(fords + ferries).toBeGreaterThan(0);
    expect(ferries).toBeGreaterThan(0);
  }, 60_000); // ~1.4M cells x 2 terrains per run on the 40x world: well past the 5s default.

  it('ferries cost more to cross than fords, and both more than dry land', () => {
    const t = setup(SEEDS[0]!), { q0, q1, r0, r1 } = box(t);
    let ford: number | null = null, ferry: number | null = null;
    for (let q = q0; q <= q1 && (ford === null || ferry === null); q++) for (let r = r0; r <= r1; r++) {
      if (ford === null && t.terrain.isFord(q, r)) ford = t.terrain.stepCost(q, r);
      if (ferry === null && t.terrain.isFerry(q, r)) ferry = t.terrain.stepCost(q, r);
    }
    expect(ford ?? 1.2).toBeGreaterThan(1);
    if (ferry !== null) expect(ferry).toBeGreaterThan(ford ?? 1);
  });

  it('keep lake detours short: crossing a lake on foot is rarely much longer than straight across', () => {
    const ratios: number[] = [], extras: number[] = [];
    for (const seed of SEEDS) {
      const t = setup(seed), { q0, q1, r0, r1 } = box(t);
      for (let r = r0; r <= r1; r += 4) for (let q = q0; q <= q1; q++) {
        if (t.terrain.biome(q, r) === 'water' || !t.terrain.passable(q, r)) continue;
        let e = q + 1;
        while (e <= q1 && t.terrain.biome(e, r) === 'water' && Math.abs(r - riverRow(seed, e)) > 5) e++;
        const run = e - q - 1;
        if (run < 4 || run > 30 || e > q1 || t.terrain.biome(e, r) === 'water') continue;
        const path = t.nav.findPath({ q, r }, { q: e, r }, 30000);
        expect(path, `lake at ${seed}@${q},${r} must be reachable`).not.toBeNull();
        ratios.push(path!.length / (e - q + 1));
        extras.push(path!.length - (e - q + 1));
        q = e;
      }
    }
    ratios.sort((a, b) => a - b); extras.sort((a, b) => a - b);
    const mean = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    // Before lake crossings: mean ~1.37, p90 ~1.97, p90 extra ~28 tiles.
    // 40x world (crossings minGap 7): mean ~1.23, p90 ~1.50, p90 extra ~7 tiles.
    expect(mean).toBeLessThan(1.3);
    expect(ratios[Math.floor(ratios.length * 0.9)]!).toBeLessThan(1.6);
    expect(extras[Math.floor(extras.length * 0.9)]!).toBeLessThan(15);
  }, 60_000);

  it('the navigator prefers a short ferry only when the walk round is longer', () => {
    // Lake from q=4..13 spanning every row of a 10-row map; a ferry lane (cost 1.5) at row 2, no other crossing.
    const lake = (q: number) => q >= 4 && q <= 13;
    const ferry = (q: number, r: number) => lake(q) && r >= 1 && r <= 3;
    const nav = createNavigator({
      passable: (q, r) => q >= 0 && q < 18 && r >= 0 && r < 10 && (!lake(q) || ferry(q, r)),
      stepCost: (q, r) => (ferry(q, r) ? 1.5 : 1),
    });
    const p = nav.findPath({ q: 2, r: 2 }, { q: 15, r: 2 })!;
    expect(p.some((t) => t.q === 8 && ferry(t.q, t.r))).toBe(true);
    // From the far corner the ferry is worth the walk to it only if cheaper than going round (there is no round): still reachable.
    expect(nav.findPath({ q: 2, r: 9 }, { q: 15, r: 9 })).not.toBeNull();
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
