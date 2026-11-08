/** Shared collision/ground classification. Roads are safe crossings, settlements dry land. */
import { biomeAt, riverDistance, riversAt, RIVER_HALF, terrainHash, type Biome, type RiverCurve } from './terrain';
import { bresenhamLine, cellKey } from './corridor';
import type { WorldLayout } from './world-layout';
import { editAt, type TileEdits } from './tile-edits';
import crossingCfg from '../../data/world/crossings.json';

/** River fords: one candidate per FORD_SLOT tiles along each river, FORD_WIDTH tiles wide. */
export const FORD_SLOT = 40;
export const FORD_WIDTH = 3;
const FORD_CHANCE = 0.7;
const LAKE = crossingCfg;
/** A ford is only laid where the whole wet run is this short (a true shallow). */
const FORD_MAX_RUN = 12;

const BIOMES = new Set<string>(['forest', 'hills', 'water', 'fields', 'meadow']);

/**
 * `edits` (live SimState.tileEdits) changes the land the player has worked: an edited ford is
 * passable water, an edited track is road-like ground, an edited biome replaces the natural one.
 * Generated crossings (river fords, lake lanes) always come from the natural land.
 */
export function createTerrainAccess(layout: WorldLayout, seed: number, raster?: Map<string, unknown>, edits?: () => TileEdits | undefined) {
  const roads = new Set(raster?.keys());
  if (!raster) for (const route of layout.routes) for (let i = 1; i < route.path.length; i++) {
    const a = route.path[i - 1]!, b = route.path[i]!;
    for (const c of bresenhamLine(Math.round(a.q), Math.round(a.r), Math.round(b.q), Math.round(b.r))) roads.add(cellKey(c.q, c.r));
  }
  const inTown = (q: number, r: number) => layout.settlements.some((t) => Math.abs(q - t.q) <= 13 && Math.abs(r - t.r) <= 13);
  /** The land as generated, ignoring the player's edits. */
  const natural = (q: number, r: number): Biome => inTown(q, r) ? 'meadow' : biomeAt(seed, q, r);
  const biome = natural; // generation below (fords, lanes) reads only the natural land
  // Hot path (A*, foot tests): nothing to look up until the first edit exists.
  const edit = (q: number, r: number): string | undefined => { const e = edits?.(); return e ? editAt(e, q, r) : undefined; };
  const isBridge = (q: number, r: number) => roads.has(cellKey(q, r)) && biome(q, r) === 'water';
  const isDeck = (q: number, r: number): boolean => {
    if (biome(q, r) !== 'water') return false;
    for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) if (roads.has(cellKey(q + dq, r + dr))) return true;
    return false;
  };
  // Fords: shallow crossings laid across each river where it is narrow enough to wade. Slots run
  // along the river's own axis (columns for a west-east river, rows for a north-south one); each
  // slot yields at most one strip, and every wet cell of its lines (bank to bank) is ford.
  const slots = new Map<RiverCurve, Map<number, Set<string>>>();
  let slotCount = 0;
  const fordSlot = (river: RiverCurve, slot: number): Set<string> => {
    let mine = slots.get(river);
    const cached = mine?.get(slot);
    if (cached) return cached;
    // Bounded: a long walk only ever needs nearby slots, and they regenerate identically.
    if (++slotCount > 50_000) { slots.clear(); slotCount = 1; mine = undefined; }
    if (!mine) { mine = new Map(); slots.set(river, mine); }
    const cells = new Set<string>();
    mine.set(slot, cells);
    // The home river (hashId 0) keeps the exact fords it always had.
    const fs = seed ^ 0xf04d ^ river.hashId;
    if (terrainHash(fs, slot, 1) >= FORD_CHANCE) return cells;
    const u0 = slot * FORD_SLOT + 6 + Math.floor(terrainHash(fs, slot, 2) * (FORD_SLOT - 12 - FORD_WIDTH));
    if (u0 < river.ua || u0 + FORD_WIDTH > river.ub) return cells; // strip must lie on this river's own run
    const at = (u: number, v: number) => (river.axis === 0 ? biome(u, v) : biome(v, u));
    const key2 = (u: number, v: number) => (river.axis === 0 ? cellKey(u, v) : cellKey(v, u));
    const strip: string[] = [];
    for (let u = u0; u < u0 + FORD_WIDTH; u++) {
      const mid = Math.round(river.centre(u));
      if (at(u, mid) !== 'water') return cells;
      let top = mid, bottom = mid;
      while (at(u, top - 1) === 'water' && mid - top < FORD_MAX_RUN) top--;
      while (at(u, bottom + 1) === 'water' && bottom - mid < FORD_MAX_RUN) bottom++;
      if (at(u, top - 1) === 'water' || at(u, bottom + 1) === 'water' || bottom - top + 1 > FORD_MAX_RUN) return cells;
      for (let v = top; v <= bottom; v++) strip.push(key2(u, v));
    }
    for (const k of strip) cells.add(k);
    return cells;
  };
  // A strip spans bank to bank (up to FORD_MAX_RUN); dist is inflated up to 1/0.45 near springs.
  const FORD_REACH = (RIVER_HALF + FORD_MAX_RUN) / 0.45;
  const riverFord = (q: number, r: number): boolean => {
    const k = cellKey(q, r);
    for (const c of riversAt(seed, q, r)) {
      const u = c.axis === 0 ? q : r, v = c.axis === 0 ? r : q;
      if (c.dist(u, v) < FORD_REACH && fordSlot(c, Math.floor(u / FORD_SLOT)).has(k)) return true;
    }
    return false;
  };
  // Lake crossings: per square slot, the shortest bank-to-bank water runs among a few seeded lines
  // become lanes (ford when wadeable, ferry pontoon when wider). A lane may run past its slot's
  // edge (lakes do not respect the grid), so every cell lands in one global index and a lookup
  // first makes sure the slots around it have been generated.
  const lakeCells = new Map<string, 'ford' | 'ferry'>();
  const lakeDone = new Set<string>();
  const nearRiver = (q: number, r: number) => riverDistance(seed, q, r) < 4.5;
  const genLakeSlot = (sq: number, sr: number): void => {
    const S = LAKE.slotTiles, mix = sq * 7919 + sr * 104729;
    if (terrainHash(seed ^ 0x1a4e, mix, 1) >= LAKE.chance) return;
    const half = Math.floor(LAKE.width / 2), M = LAKE.ferryMaxRun + 2;
    type Cand = { cells: string[]; run: number; cq: number; cr: number };
    const cands: Cand[] = [];
    const jitter = Math.floor(terrainHash(seed ^ 0x1a4e, mix, 2) * LAKE.lineStep);
    const lines = Math.floor((S - 2 * half - 2 - jitter) / LAKE.lineStep) + 1;
    for (let t = 0; t < lines * 2; t++) {
      const horiz = t % 2 === 0;
      const off = half + 1 + jitter + Math.floor(t / 2) * LAKE.lineStep;
      const at = (along: number, across: number) => (horiz ? { q: sq * S + along, r: sr * S + across } : { q: sq * S + across, r: sr * S + along });
      let a = Number.NaN;
      for (let i = -M; i < S + M; i++) {
        const c = at(i, off);
        const wet = biome(c.q, c.r) === 'water';
        if (wet && Number.isNaN(a)) a = i;
        if (!Number.isNaN(a) && (!wet || i === S + M - 1)) {
          const b = wet ? i : i - 1; // last wet index of the run
          const run = b - a + 1;
          // Land on both banks (a > -M proves land at a-1) and the run must start inside this slot.
          let clean = a > -M && !wet && a >= 0 && a < S && run >= LAKE.minRun && run <= LAKE.ferryMaxRun;
          for (let j = a; clean && j <= b; j++) { const w = at(j, off); if (nearRiver(w.q, w.r) || isDeck(w.q, w.r)) clean = false; }
          if (clean) {
            const cells: string[] = [];
            for (let k = -half; k <= half; k++) for (let j = a; j <= b; j++) {
              const w = at(j, off + k);
              if (biome(w.q, w.r) === 'water') cells.push(cellKey(w.q, w.r));
            }
            const mid = at((a + b) >> 1, off);
            cands.push({ cells, run, cq: mid.q, cr: mid.r });
          }
          a = Number.NaN;
        }
      }
    }
    // Shortest crossings first; keep a few per slot, spaced apart so one lake is not walled with lanes.
    cands.sort((x, y) => x.run - y.run || x.cq - y.cq || x.cr - y.cr);
    const kept: Cand[] = [];
    for (const c of cands) {
      if (kept.length >= LAKE.maxPerSlot) break;
      if (kept.some((k) => Math.max(Math.abs(k.cq - c.cq), Math.abs(k.cr - c.cr)) < LAKE.minGap)) continue;
      kept.push(c);
      for (const key of c.cells) if (!lakeCells.has(key) || c.run <= LAKE.fordMaxRun) lakeCells.set(key, c.run <= LAKE.fordMaxRun ? 'ford' : 'ferry');
    }
  };
  // Slots whose whole neighbourhood is generated: one lookup per call on the navigator's hot path.
  const lakeReady = new Set<string>();
  const lakeAt = (q: number, r: number): 'ford' | 'ferry' | undefined => {
    const sq = Math.floor(q / LAKE.slotTiles), sr = Math.floor(r / LAKE.slotTiles), sk = `${sq},${sr}`;
    if (!lakeReady.has(sk)) {
      lakeReady.add(sk);
      const reach = Math.ceil((LAKE.ferryMaxRun + 2) / LAKE.slotTiles);
      for (let dr = -reach; dr <= reach; dr++) for (let dq = -reach; dq <= reach; dq++) {
        const k = `${sq + dq},${sr + dr}`;
        if (!lakeDone.has(k)) { lakeDone.add(k); genLakeSlot(sq + dq, sr + dr); }
      }
    }
    return lakeCells.get(cellKey(q, r));
  };
  const naturalFord = (q: number, r: number): boolean =>
    biome(q, r) === 'water' && !isDeck(q, r) && (riverFord(q, r) || lakeAt(q, r) === 'ford');
  const isFord = (q: number, r: number): boolean => {
    const e = edit(q, r);
    return e !== undefined ? e === 'ford' : naturalFord(q, r);
  };
  /** A ferry pontoon lane across a lake too wide to wade. */
  const isFerry = (q: number, r: number): boolean =>
    edit(q, r) === undefined && biome(q, r) === 'water' && !isDeck(q, r) && !naturalFord(q, r) && lakeAt(q, r) === 'ferry';
  /** Ground as it is now: an edited biome, edited fords read as (shallow) water, tracks keep the land under them. */
  const biomeNow = (q: number, r: number): Biome => {
    const e = edit(q, r);
    if (e === undefined) return natural(q, r);
    if (BIOMES.has(e)) return e as Biome;
    // A track is cleared footing: over water or forest it reads as open ground.
    const n = natural(q, r);
    return e === 'ford' ? 'water' : n === 'water' || n === 'forest' ? 'meadow' : n;
  };
  /** A worked track (or any edited road tile): road-like footing. */
  const isTrack = (q: number, r: number): boolean => edit(q, r)?.startsWith('road') ?? false;
  /** A generated road or a worked track. */
  const onRoad = (q: number, r: number): boolean => roads.has(cellKey(q, r)) || isTrack(q, r);
  // Broad deck accommodates diagonal road joins and the character's feet.
  const passable = (q: number, r: number): boolean => {
    const e = edit(q, r);
    if (e !== undefined) return e !== 'water';
    if (biome(q, r) !== 'water') return true;
    return isDeck(q, r) || naturalFord(q, r) || isFerry(q, r);
  };
  /** Per-tile walking weight for the navigator: wading and the ferry are slower than dry land. */
  const stepCost = (q: number, r: number): number => {
    const e = edit(q, r);
    if (e !== undefined) return e === 'ford' ? LAKE.fordStepCost : 1;
    if (biome(q, r) !== 'water' || isDeck(q, r)) return 1;
    return naturalFord(q, r) ? LAKE.fordStepCost : isFerry(q, r) ? LAKE.ferryStepCost : 1;
  };
  return { biome: biomeNow, natural, edit, isTrack, onRoad, inTown, isBridge, isDeck, isFord, isFerry, passable, stepCost };
}

export type TerrainAccess = ReturnType<typeof createTerrainAccess>;
