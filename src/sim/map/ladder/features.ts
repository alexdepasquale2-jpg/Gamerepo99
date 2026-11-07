/**
 * Structured wilderness: farms, rock outcrops, streams, build sites. Each feature
 * hangs off a seeded anchor cell and is a pure function of (seed, cell), so any
 * chunk can rebuild the features overlapping it (lazy, collapse-on-observation).
 */
import cfg from '../../../data/world/features.json';
import { biomeAt, type Biome } from '../terrain';

export type Pt = { q: number; r: number };
export type Farm = { kind: 'farm'; id: string; house: Pt; field: { q: number; r: number; w: number; h: number }; gate: Pt; sheep: Pt[] };
export type Outcrop = { kind: 'outcrop'; id: string; center: Pt; rocks: Pt[]; hills: boolean };
export type Stream = { kind: 'stream'; id: string; cells: Pt[] };
/** A wild place to stumble on: camp, ruin, shrine, thicket, herd, pond, cart, ... (see features.json spot). */
export type Spot = { kind: 'spot'; id: string; type: string; center: Pt; biome: Biome };
export type Feature = Farm | Outcrop | Stream | Spot;
type Town = { q: number; r: number };

export function fhash(seed: number, a: number, b: number, c: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const span = (lo: number, hi: number, t: number) => lo + Math.floor(t * (hi - lo + 1));
const townDist = (towns: Town[], q: number, r: number) => Math.min(Infinity, ...towns.map((t) => Math.hypot(t.q - q, t.r - r)));

function farmAt(seed: number, towns: Town[], X: number, Y: number): Farm | null {
  const A = cfg.anchorTiles, F = cfg.farm, h = (i: number) => fhash(seed ^ 0xfa53, X, Y, i);
  if (h(0) >= F.chance) return null;
  const house = { q: X * A + 3 + Math.floor(h(1) * (A - 14)), r: Y * A + 3 + Math.floor(h(2) * (A - 12)) };
  if (!F.biomes.includes(biomeAt(seed, house.q, house.r)) || townDist(towns, house.q, house.r) < cfg.townClearTiles) return null;
  const w = span(F.fieldW[0]!, F.fieldW[1]!, h(3)), fh = span(F.fieldH[0]!, F.fieldH[1]!, h(4));
  const field = { q: house.q + 2, r: house.r - Math.floor(fh / 2), w, h: fh };
  for (let r = field.r - 1; r <= field.r + fh; r++) for (let q = house.q - 1; q <= field.q + w; q++) if (biomeAt(seed, q, r) === 'water') return null;
  const gate = { q: field.q, r: field.r + Math.floor(fh / 2) };
  const sheep: Pt[] = [];
  const ns = span(F.sheep[0]!, F.sheep[1]!, h(5));
  for (let i = 0; i < ns; i++) sheep.push({ q: house.q - 1 - Math.floor(h(10 + i) * 4), r: field.r + fh + 1 + Math.floor(h(20 + i) * 3) });
  return { kind: 'farm', id: `farm#${X},${Y}`, house, field, gate, sheep };
}

function spotAt(seed: number, towns: Town[], X: number, Y: number): Spot | null {
  const A = cfg.anchorTiles, h = (i: number) => fhash(seed ^ 0x5b07, X, Y, i);
  if (h(0) >= cfg.spot.chance) return null;
  const center = { q: X * A + 4 + Math.floor(h(1) * (A - 8)), r: Y * A + 4 + Math.floor(h(2) * (A - 8)) };
  const biome = biomeAt(seed, center.q, center.r);
  const table = (cfg.spot.byBiome as Record<string, Record<string, number>>)[biome];
  if (!table || townDist(towns, center.q, center.r) < cfg.townClearTiles * 0.7) return null;
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let roll = h(3) * total, type = Object.keys(table)[0]!;
  for (const [k, w] of Object.entries(table)) { if ((roll -= w) < 0) { type = k; break; } }
  return { kind: 'spot', id: `spot#${X},${Y}`, type, center, biome };
}

function outcropAt(seed: number, towns: Town[], X: number, Y: number): Outcrop | null {
  const A = cfg.anchorTiles, O = cfg.outcrop, h = (i: number) => fhash(seed ^ 0x0c70, X, Y, i);
  const center = { q: X * A + 4 + Math.floor(h(1) * (A - 8)), r: Y * A + 4 + Math.floor(h(2) * (A - 8)) };
  const b = biomeAt(seed, center.q, center.r);
  if (b === 'water' || h(0) >= (b === 'hills' ? O.chanceHills : O.chanceOther)) return null;
  if (townDist(towns, center.q, center.r) < cfg.townClearTiles * 0.6) return null;
  const rocks: Pt[] = [];
  const n = span(O.rocks[0]!, O.rocks[1]!, h(3));
  for (let i = 0; i < n; i++) {
    const a = h(10 + i) * Math.PI * 2, d = Math.sqrt(h(30 + i)) * O.radius;
    const p = { q: Math.round(center.q + Math.cos(a) * d), r: Math.round(center.r + Math.sin(a) * d) };
    if (biomeAt(seed, p.q, p.r) !== 'water' && !rocks.some((o) => o.q === p.q && o.r === p.r)) rocks.push(p);
  }
  return { kind: 'outcrop', id: `outcrop#${X},${Y}`, center, rocks, hills: b === 'hills' };
}

const streamCache = new Map<string, Stream | null>();
function streamAt(seed: number, towns: Town[], X: number, Y: number): Stream | null {
  const key = `${seed}:${X},${Y}`;
  if (streamCache.has(key)) return streamCache.get(key)!;
  const S = cfg.stream, C = S.cellTiles, h = (i: number) => fhash(seed ^ 0x57e4, X, Y, i);
  let out: Stream | null = null;
  if (h(0) < S.chance) {
    let q = X * C + h(1) * C, r = Y * C + h(2) * C, dir = h(3) * Math.PI * 2;
    const len = span(S.length[0]!, S.length[1]!, h(4));
    const cells: Pt[] = [], seen = new Set<string>();
    for (let i = 0; i < len; i++) {
      dir += (fhash(seed ^ 0x57e4, X * 977 + i, Y, 9) - 0.5) * 0.7;
      q += Math.cos(dir); r += Math.sin(dir);
      const c = { q: Math.round(q), r: Math.round(r) };
      if (biomeAt(seed, c.q, c.r) === 'water') break; // runs into a lake or the river
      if (townDist(towns, c.q, c.r) < 20) break;
      const k = `${c.q},${c.r}`;
      if (!seen.has(k)) { seen.add(k); cells.push(c); }
    }
    if (cells.length >= 12) out = { kind: 'stream', id: `stream#${X},${Y}`, cells };
  }
  if (streamCache.size > 4096) streamCache.clear();
  streamCache.set(key, out);
  return out;
}

/** Every feature that may touch the tile rect [q0,q1) x [r0,r1). */
export function featuresIn(seed: number, towns: Town[], q0: number, r0: number, q1: number, r1: number): Feature[] {
  const out: Feature[] = [];
  const A = cfg.anchorTiles;
  for (let Y = Math.floor(r0 / A) - 1; Y <= Math.floor((r1 - 1) / A) + 1; Y++) for (let X = Math.floor(q0 / A) - 1; X <= Math.floor((q1 - 1) / A) + 1; X++) {
    // One feature per anchor cell: farm, else outcrop, else a wild spot.
    const f = farmAt(seed, towns, X, Y) ?? outcropAt(seed, towns, X, Y) ?? spotAt(seed, towns, X, Y);
    if (f) out.push(f);
  }
  const C = cfg.stream.cellTiles, reach = Math.ceil(cfg.stream.length[1]! / C);
  for (let Y = Math.floor(r0 / C) - reach; Y <= Math.floor((r1 - 1) / C) + reach; Y++) for (let X = Math.floor(q0 / C) - reach; X <= Math.floor((q1 - 1) / C) + reach; X++) {
    const s = streamAt(seed, towns, X, Y);
    if (s && s.cells.some((c) => c.q >= q0 - 1 && c.q <= q1 && c.r >= r0 - 1 && c.r <= r1)) out.push(s);
  }
  return out;
}

export const inRect = (p: Pt, q0: number, r0: number, q1: number, r1: number) => p.q >= q0 && p.q < q1 && p.r >= r0 && p.r < r1;
export const FEATURES = cfg;
export type { Biome };
