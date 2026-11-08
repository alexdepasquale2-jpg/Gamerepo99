/**
 * The realm: a grid of districts (data/world/districts.json). The home district holds the world the game
 * generates today; every other district is a pure function of (seed, col, row): its name, the wound the
 * place carries, where it sits between village and city, the doctrine that rules it, its land and naming
 * culture, its starting despair, and its towns (names, sizes, positions in world tiles). Nothing here is
 * stored: a district is worked out again whenever the map, a road or a letter needs it, and the live sim
 * only ever holds the district the player is in. Pure, deterministic (deriveRng), no Phaser/DOM.
 */
import table from '../../data/world/districts.json';
import { deriveRng, type Rng } from '../rng';
import type { SettlementKind } from './world-layout';

type Wound = { id: string; label: string; despair: [number, number]; epithet: string };
type Style = { id: string; name: string; promise: string };
type Land = { id: string; noun: string[] };
/** A naming culture: town roots + suffixes, and the given (`people`) and family names its folk carry (sim/names). */
export type Culture = { id: string; roots: string[]; town: string[]; people: string[]; family: string[] };
type Table = {
  grid: { cols: number; rows: number; homeCol: number; homeRow: number };
  districtTiles: number; marginTiles: number; minSpacingTiles: number;
  settlements: [number, number];
  kinds: Record<SettlementKind, number>;
  peoplePerKind: Record<SettlementKind, number>;
  wounds: Wound[]; doctrineStyles: Style[]; doctrineWords: string[]; lands: Land[]; cultures: Culture[];
};
export const DISTRICTS = table as unknown as Table;

export type DistrictTown = { id: string; name: string; kind: SettlementKind; q: number; r: number; people: number; seat: boolean };
export type DistrictCharacter = {
  wound: string; woundLabel: string; epithet: string;
  /** 0 = scattered villages … 1 = one great city (the game's gap axis). */
  gapAxis: number;
  doctrine: { name: string; style: string; promise: string };
  land: string; culture: string;
};
export type District = {
  id: string; col: number; row: number; home: boolean;
  name: string;
  character: DistrictCharacter;
  /** Starting despair of its towns (0..1). */
  despair: number;
  /** World-tile box this district covers: q in [q0, q1), r in [r0, r1). */
  box: { q0: number; r0: number; q1: number; r1: number };
  /** Its towns (empty for the home district: the live world layout holds those). */
  towns: DistrictTown[];
  population: number;
};

const D = (): number => DISTRICTS.districtTiles;

/** Names of every generated town worked out so far (ids are `d<col>_<row>_t<i>`), for labels anywhere. */
const TOWN_NAMES = new Map<string, string>();
/** A town's spoken name: a generated district town's own name, else the id in title case. */
export function prettyTownId(id: string): string {
  return TOWN_NAMES.get(id) ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
/** The district a generated town belongs to (null for home towns). */
export function districtOfTown(id: string): { col: number; row: number } | null {
  const m = /^d(\d+)_(\d+)_t\d+$/.exec(id);
  return m ? { col: Number(m[1]), row: Number(m[2]) } : null;
}
export const districtId = (col: number, row: number): string => `d${col}_${row}`;
export const cultureById = (id: string): Culture | undefined => DISTRICTS.cultures.find((c) => c.id === id);
export const isHome = (col: number, row: number): boolean => col === DISTRICTS.grid.homeCol && row === DISTRICTS.grid.homeRow;
export const inGrid = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < DISTRICTS.grid.cols && row < DISTRICTS.grid.rows;

/** The tile box of a district: the home district is centred on the origin. */
export function districtBox(col: number, row: number): District['box'] {
  const d = D(), g = DISTRICTS.grid;
  const q0 = (col - g.homeCol) * d - Math.floor(d / 2), r0 = (row - g.homeRow) * d - Math.floor(d / 2);
  return { q0, r0, q1: q0 + d, r1: r0 + d };
}

/** Which district a world tile lies in (null outside the realm). */
export function districtAtTile(q: number, r: number): { col: number; row: number } | null {
  const d = D(), g = DISTRICTS.grid;
  const col = Math.floor((q + Math.floor(d / 2)) / d) + g.homeCol, row = Math.floor((r + Math.floor(d / 2)) / d) + g.homeRow;
  return inGrid(col, row) ? { col, row } : null;
}

/** The realm's tile bounds (all districts). */
export function realmBox(): District['box'] {
  const a = districtBox(0, 0), b = districtBox(DISTRICTS.grid.cols - 1, DISTRICTS.grid.rows - 1);
  return { q0: a.q0, r0: a.r0, q1: b.q1, r1: b.r1 };
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[rng.int(0, xs.length)]!;
function weighted<K extends string>(rng: Rng, w: Record<K, number>): K {
  const keys = Object.keys(w) as K[];
  let r = rng.next() * keys.reduce((a, k) => a + w[k], 0);
  for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
  return keys[keys.length - 1]!;
}

/** A smooth 0..1 field over the grid (neighbouring districts lean alike): value noise on a coarse lattice. */
function field(seed: number, tag: string, col: number, row: number): number {
  const cell = 3;
  const at = (x: number, y: number) => deriveRng(seed, 'district-field', tag, x, y).next();
  const fx = col / cell, fy = row / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * s(tx);
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * s(tx);
  return a + (b - a) * s(ty);
}

/** A town name in a culture ("Emberford", "Sedgewick"). */
export function townName(rng: Rng, c: Culture): string {
  const root = pick(rng, c.roots);
  // No echoes ("Scarscar", "Stonestone"): pick a suffix the root does not already say.
  const ok = c.town.filter((t) => !root.toLowerCase().includes(t) && !t.includes(root.toLowerCase()));
  return `${root}${pick(rng, ok.length ? ok : c.town)}`;
}

/** Work out one district from the seed. */
export function districtAt(seed: number, col: number, row: number): District {
  const rng = deriveRng(seed, 'district', col, row);
  const home = isHome(col, row);
  // Neighbouring districts share land and culture often (fields), with a seeded twist.
  const culture = DISTRICTS.cultures[Math.floor(field(seed, 'culture', col, row) * DISTRICTS.cultures.length) % DISTRICTS.cultures.length]!;
  const land = DISTRICTS.lands[Math.floor(field(seed, 'land', col, row) * DISTRICTS.lands.length) % DISTRICTS.lands.length]!;
  const wound = pick(rng, DISTRICTS.wounds);
  const style = pick(rng, DISTRICTS.doctrineStyles);
  const gapAxis = Math.min(1, Math.max(0, field(seed, 'gap', col, row) * 0.8 + rng.next() * 0.2));
  const despair = wound.despair[0] + rng.next() * (wound.despair[1] - wound.despair[0]);
  const root = pick(rng, culture.roots);
  const name = home ? 'The Hearthlands' : `The ${wound.epithet} ${root} ${pick(rng, land.noun)}`;
  const box = districtBox(col, row);
  const towns = home ? [] : placeTowns(seed, col, row, box, culture, gapAxis);
  return {
    id: districtId(col, row), col, row, home, name, despair: home ? 0.3 : despair, box, towns,
    population: towns.reduce((a, t) => a + t.people, 0),
    character: {
      wound: wound.id, woundLabel: wound.label, epithet: wound.epithet, gapAxis,
      doctrine: { name: `${pick(rng, DISTRICTS.doctrineWords)} ${style.name}`, style: style.id, promise: style.promise },
      land: land.id, culture: culture.id,
    },
  };
}

/** Towns in a district: the seat first (bigger where the gap axis leans city), spread by best-candidate. */
function placeTowns(seed: number, col: number, row: number, box: District['box'], c: Culture, gap: number): DistrictTown[] {
  const rng = deriveRng(seed, 'district-towns', col, row);
  const [lo, hi] = DISTRICTS.settlements;
  // City-leaning districts have fewer, bigger places; village-leaning ones more, smaller.
  const n = Math.round(lo + (hi - lo) * (1 - gap) * 0.7 + rng.next() * (hi - lo) * 0.3);
  const m = DISTRICTS.marginTiles, out: DistrictTown[] = [];
  const names = new Set<string>();
  for (let i = 0; i < n; i++) {
    let best: { q: number; r: number } | null = null, bestD = -1;
    for (let k = 0; k < 24; k++) {
      const q = box.q0 + m + rng.int(0, box.q1 - box.q0 - 2 * m), r = box.r0 + m + rng.int(0, box.r1 - box.r0 - 2 * m);
      const d = out.length ? Math.min(...out.map((t) => Math.hypot(t.q - q, t.r - r))) : 1e9;
      if (d > bestD) { bestD = d; best = { q, r }; }
    }
    if (!best || (out.length && bestD < DISTRICTS.minSpacingTiles)) continue;
    let kind: SettlementKind = weighted(rng, DISTRICTS.kinds);
    if (i === 0) kind = gap > 0.6 ? 'city' : 'town';
    else if (kind === 'city' && gap < 0.5) kind = 'town';
    let name = townName(rng, c);
    for (let k = 0; names.has(name) && k < 6; k++) name = townName(rng, c);
    names.add(name);
    const base = DISTRICTS.peoplePerKind[kind];
    TOWN_NAMES.set(`${districtId(col, row)}_t${i}`, name);
    out.push({ id: `${districtId(col, row)}_t${i}`, name, kind, q: best.q, r: best.r, people: base + rng.int(0, Math.ceil(base / 3)), seat: i === 0 });
  }
  return out;
}

/** Every district in the realm (cheap: a few hundred hashes; cached per seed). */
const realmCache = new Map<number, District[]>();
export function realm(seed: number): District[] {
  let r = realmCache.get(seed);
  if (!r) {
    r = [];
    for (let row = 0; row < DISTRICTS.grid.rows; row++) for (let col = 0; col < DISTRICTS.grid.cols; col++) r.push(districtAt(seed, col, row));
    if (realmCache.size > 4) realmCache.clear();
    realmCache.set(seed, r);
  }
  return r;
}

/** Neighbouring districts (4-way) inside the grid. */
export function neighbours(col: number, row: number): { col: number; row: number }[] {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => ({ col: col + dc!, row: row + dr! })).filter((d) => inGrid(d.col, d.row));
}
