/**
 * Seeded rivers, per district. Each district of the realm (districts.ts) carries 1-3 rivers: a
 * west-east one when either side border has a crossing, a north-south one likewise, and sometimes a
 * tributary from a spring down into one of them. Border crossings are worked out from the border's own
 * seed, so the two districts sharing it agree on where the water passes and rivers run on unbroken.
 * A river is a chord between its two ends plus a low-frequency meander faded to zero at the ends
 * (sin envelope), so it meets the border exactly at the crossing point. The home district keeps the
 * one river the game always had (riverRow), so its towns and roads stay where they were dry.
 * Pure function of (seed, q, r); district river sets are cached (bounded) because per-tile calls are hot.
 */
import { deriveRng } from '../rng';
import { WORLD_SCALE as S } from './constants';
import { DISTRICTS, districtAtTile, districtBox, isHome } from './districts';

/** Row (tile r) of the home river's centre line at column q. */
export function riverRow(seed: number, q: number): number {
  return (Math.sin(q / (86 * S) + seed * 0.001) * 34 + Math.sin(q / (31 * S)) * 7) * S;
}

/** River half-width in tiles (perpendicular). */
export const RIVER_HALF = 2.6;

export type RiverCurve = {
  /** Stable id within the realm (`home` or `col,row,i`) and an int form for hashing ford slots. */
  id: string; hashId: number;
  /** 0: runs west-east (u = q, v = r); 1: runs north-south (u = r, v = q). */
  axis: 0 | 1;
  ua: number; ub: number;
  /** Centre line across-coordinate at along-coordinate u. */
  centre: (u: number) => number;
  /** Effective distance from the river (river where < RIVER_HALF), Infinity when out of reach. */
  dist: (u: number, v: number) => number;
};

type End = { u: number; v: number; spring: boolean };

function curve(seed: number, id: string, hashId: number, axis: 0 | 1, a: End, b: End): RiverCurve {
  if (b.u < a.u) [a, b] = [b, a];
  const rng = deriveRng(seed, 'river-shape', id);
  const a1 = 120 + rng.next() * 180, l1 = 380 + rng.next() * 320, p1 = rng.next() * 6.283;
  const a2 = 25 + rng.next() * 35, l2 = 120 + rng.next() * 100, p2 = rng.next() * 6.283;
  const ua = a.u, ub = b.u, span = Math.max(1, ub - ua), dv = b.v - a.v, reach = a1 + a2 + 40;
  const wob = (u: number) => a1 * Math.sin(u / l1 + p1) + a2 * Math.sin(u / l2 + p2);
  const centre = (u: number) => {
    const t = (u - ua) / span;
    return a.v + dv * t + Math.sin(Math.PI * t) * wob(u);
  };
  const dist = (u: number, v: number): number => {
    if (u < ua || u >= ub) return Infinity;
    const t = (u - ua) / span, chord = a.v + dv * t;
    if (Math.abs(v - chord) > reach) return Infinity; // cheap reject before any trig
    const env = Math.sin(Math.PI * t), w = wob(u);
    const slope = dv / span + (Math.PI / span) * Math.cos(Math.PI * t) * w
      + env * ((a1 / l1) * Math.cos(u / l1 + p1) + (a2 / l2) * Math.cos(u / l2 + p2));
    // Vertical offset over sqrt(1+slope²) ≈ perpendicular distance: steep bends keep their width.
    let d = Math.abs(v - (chord + env * w)) / Math.sqrt(1 + slope * slope);
    // Springs start as a trickle and widen over the first few hundred tiles.
    const fromA = a.spring ? (u - ua) / 300 : 1, fromB = b.spring ? (ub - u) / 300 : 1;
    const taper = Math.max(0.45, Math.min(1, fromA, fromB));
    if (taper < 1) d /= taper;
    return d;
  };
  return { id, hashId, axis, ua, ub, centre, dist };
}

/** Where water crosses a district border: the side's own seed, so both neighbours read the same. */
type Edge = { has: boolean; pos: number };
const H = DISTRICTS.grid;
/** Border between columns c and c+1 in a row (a west-east river passes at row `pos`). */
function edgeV(seed: number, c: number, row: number): Edge {
  const box = districtBox(c + 1, row);
  if (row === H.homeRow && (c === H.homeCol - 1 || c === H.homeCol)) return { has: true, pos: riverRow(seed, box.q0) };
  const rng = deriveRng(seed, 'river-edge', 'v', c, row);
  return { has: rng.next() < 0.55, pos: box.r0 + (0.15 + rng.next() * 0.7) * DISTRICTS.districtTiles };
}
/** Border between rows c and c+1 in a column (a north-south river passes at column `pos`). */
function edgeH(seed: number, col: number, c: number): Edge {
  const box = districtBox(col, c + 1);
  if (col === H.homeCol && (c === H.homeRow - 1 || c === H.homeRow)) return { has: false, pos: 0 };
  const rng = deriveRng(seed, 'river-edge', 'h', col, c);
  return { has: rng.next() < 0.55, pos: box.q0 + (0.15 + rng.next() * 0.7) * DISTRICTS.districtTiles };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function buildDistrict(seed: number, col: number, row: number): RiverCurve[] {
  const box = districtBox(col, row), D = DISTRICTS.districtTiles;
  if (isHome(col, row)) {
    const centre = (q: number) => riverRow(seed, q);
    // The home river reads as it always has: plain vertical distance from riverRow.
    const dist = (q: number, r: number) => (q < box.q0 || q >= box.q1 ? Infinity : Math.abs(r - riverRow(seed, q)));
    return [{ id: 'home', hashId: 0, axis: 0, ua: box.q0, ub: box.q1, centre, dist }];
  }
  const rng = deriveRng(seed, 'river', col, row);
  const out: RiverCurve[] = [];
  const add = (axis: 0 | 1, a: End, b: End) => { const i = out.length; const id = `${col},${row},${i}`;
    // Odd, so never 0 (the home river's ford hash).
    out.push(curve(seed, id, (deriveRng(seed, 'river-ford', id).int(0, 0x3fffffff) << 1) | 1, axis, a, b)); };
  // Spring ends sit 20-45% into the district from the dry side, near the far end's line.
  const spring = (u0: number, u1: number, v: number, dryLow: boolean, v0: number, v1: number): End => {
    const f = 0.2 + rng.next() * 0.25;
    return { u: dryLow ? u0 + f * D : u1 - f * D, v: clamp(v + (rng.next() - 0.5) * 0.3 * D, v0 + 0.12 * D, v1 - 0.12 * D), spring: true };
  };
  // North-south first (its loose end is always a spring), so the west-east river may join it.
  const n = edgeH(seed, col, row - 1), s = edgeH(seed, col, row);
  if (n.has || s.has) {
    const a: End = n.has ? { u: box.r0, v: n.pos, spring: false } : spring(box.r0, box.r1, s.pos, true, box.q0, box.q1);
    const b: End = s.has ? { u: box.r1, v: s.pos, spring: false } : spring(box.r0, box.r1, n.pos, false, box.q0, box.q1);
    add(1, a, b);
  }
  const w = edgeV(seed, col - 1, row), e = edgeV(seed, col, row);
  if (w.has || e.has) {
    const ns = out[0];
    // A loose end flows into the north-south river (a confluence) when that leaves a long enough run.
    const join = (dryLow: boolean, v: number): End | null => {
      if (!ns) return null;
      const r = ns.ua + (0.3 + rng.next() * 0.4) * (ns.ub - ns.ua), q = ns.centre(r);
      const run = dryLow ? box.q1 - q : q - box.q0;
      return run > 0.3 * D && Math.abs(r - v) < 0.6 * run ? { u: q, v: r, spring: false } : null;
    };
    const a: End = w.has ? { u: box.q0, v: w.pos, spring: false } : join(true, e.pos) ?? spring(box.q0, box.q1, e.pos, true, box.r0, box.r1);
    const b: End = e.has ? { u: box.q1, v: e.pos, spring: false } : join(false, w.pos) ?? spring(box.q0, box.q1, w.pos, false, box.r0, box.r1);
    add(0, a, b);
  }
  // A tributary from a spring into one of the rivers (always, if the borders gave none).
  if (out.length === 0 || rng.next() < 0.4) {
    const m = 0.12 * D;
    if (out.length === 0) {
      const axis: 0 | 1 = rng.next() < 0.5 ? 0 : 1;
      const [u0, v0] = axis === 0 ? [box.q0, box.r0] : [box.r0, box.q0];
      const ua = u0 + (0.15 + rng.next() * 0.2) * D, ub = ua + (0.4 + rng.next() * 0.2) * D;
      const va = v0 + (0.25 + rng.next() * 0.5) * D, vb = clamp(va + (rng.next() - 0.5) * 0.3 * D, v0 + m, v0 + D - m);
      add(axis, { u: ua, v: va, spring: true }, { u: ub, v: vb, spring: true });
    } else {
      const host = out[rng.int(0, out.length)]!;
      const hu = host.ua + (0.3 + rng.next() * 0.4) * (host.ub - host.ua), hv = host.centre(hu);
      // Leave the host roughly square to it, on a seeded side, 25-40% of the district away.
      const len = (0.25 + rng.next() * 0.15) * D, side = rng.next() < 0.5 ? -1 : 1, slant = (rng.next() - 0.5) * 0.8;
      const du = slant * len, dv = side * len;
      const hq = host.axis === 0 ? hu : hv, hr = host.axis === 0 ? hv : hu;
      const sq = clamp(hq + (host.axis === 0 ? du : dv), box.q0 + m, box.q1 - m);
      const sr = clamp(hr + (host.axis === 0 ? dv : du), box.r0 + m, box.r1 - m);
      const axis: 0 | 1 = Math.abs(sq - hq) >= Math.abs(sr - hr) ? 0 : 1;
      const mouth: End = axis === 0 ? { u: hq, v: hr, spring: false } : { u: hr, v: hq, spring: false };
      const src: End = axis === 0 ? { u: sq, v: sr, spring: true } : { u: sr, v: sq, spring: true };
      if (Math.abs(mouth.u - src.u) > 0.12 * D) add(axis, mouth, src);
    }
  }
  return out;
}

const NONE: RiverCurve[] = [];
// Per seed, one slot per district (col + row * cols); a handful of seeds at most (bounded).
const cache = new Map<number, (RiverCurve[] | undefined)[]>();
let lastSeed = NaN, lastSeeded: (RiverCurve[] | undefined)[] = [];
/** The rivers of one district. */
export function districtRivers(seed: number, col: number, row: number): RiverCurve[] {
  if (seed !== lastSeed) {
    let s = cache.get(seed);
    if (!s) { if (cache.size >= 4) cache.clear(); s = []; cache.set(seed, s); }
    lastSeed = seed; lastSeeded = s;
  }
  const i = col + row * H.cols;
  return lastSeeded[i] ??= buildDistrict(seed, col, row);
}
/** The rivers that could touch tile (q, r): those of its district (none outside the realm). */
export function riversAt(seed: number, q: number, r: number): RiverCurve[] {
  const d = districtAtTile(q, r);
  return d ? districtRivers(seed, d.col, d.row) : NONE;
}
/** Effective distance from the nearest river (river where < RIVER_HALF). */
export function riverDistance(seed: number, q: number, r: number): number {
  let best = Infinity;
  for (const c of riversAt(seed, q, r)) {
    const d = c.axis === 0 ? c.dist(q, r) : c.dist(r, q);
    if (d < best) best = d;
  }
  return best;
}
