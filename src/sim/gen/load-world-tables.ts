/** Load towns / routes / doctrines / shapes / kin for worldgen. Pure; no dyn/. */

import townsJson from '../../data/world/towns.json';
import gapPolesJson from '../../data/world/towns/gap-poles.json';
import routesJson from '../../data/world/routes.json';
import doctrinesJson from '../../data/systems/doctrines.json';
import shapesJson from '../../data/world/world-shapes.json';
import kinPatternsJson from '../../data/world/kin-patterns.json';
import type { Rng } from '../rng';

export type TownRow = {
  id: string;
  name: string;
  gapAxis: number;
  mapWidth?: number;
  mapHeight?: number;
  doctrineId?: string;
};

export type RouteRow = {
  id: string;
  fromTownId: string;
  toTownId: string;
  days?: number;
  biomeIds?: string[];
};

export type DoctrineRow = {
  id: string;
  name: string;
  townId: string;
  blurb?: string;
};

export type GapBias = 'low' | 'mid' | 'high' | 'bimodal';

export type WorldShape = {
  id: string;
  weight: number;
  settlementCount: [number, number];
  gapBands: Array<[number, number]>;
  gapBias: GapBias;
  rivalArcChance: number;
  doctrinePressure: number;
  routePolicy: 'spine' | 'mesh_light';
  biomeTags: string[];
};

export type KinPattern = {
  id: string;
  weight: number;
  treeAttach: 'previous' | 'hub' | 'random_earlier';
  kindBag: string[];
  extraChordMul: number;
  chordKinds: string[];
};

export type WorldTables = {
  towns: TownRow[];
  routes: RouteRow[];
  doctrines: DoctrineRow[];
  shapes: WorldShape[];
  kinPatterns: KinPattern[];
};

function asTowns(raw: unknown): TownRow[] {
  const list = (raw as { towns?: unknown[] } | null)?.towns;
  if (!Array.isArray(list)) return [];
  const out: TownRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    const gap =
      typeof r.gapAxis === 'number' && Number.isFinite(r.gapAxis) ? r.gapAxis : 0.5;
    out.push({
      id: r.id,
      name: r.name,
      gapAxis: Math.max(0, Math.min(1, gap)),
      mapWidth: typeof r.mapWidth === 'number' ? r.mapWidth : undefined,
      mapHeight: typeof r.mapHeight === 'number' ? r.mapHeight : undefined,
      doctrineId: typeof r.doctrineId === 'string' ? r.doctrineId : undefined,
    });
  }
  return out;
}

function asRoutes(raw: unknown): RouteRow[] {
  const list = (raw as { routes?: unknown[] } | null)?.routes;
  if (!Array.isArray(list)) return [];
  const out: RouteRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.fromTownId !== 'string' ||
      typeof r.toTownId !== 'string'
    ) {
      continue;
    }
    out.push({
      id: r.id,
      fromTownId: r.fromTownId,
      toTownId: r.toTownId,
      days: typeof r.days === 'number' ? r.days : undefined,
      biomeIds: Array.isArray(r.biomeIds)
        ? r.biomeIds.filter((b): b is string => typeof b === 'string')
        : undefined,
    });
  }
  return out;
}

function asDoctrines(raw: unknown): DoctrineRow[] {
  const list = (raw as { doctrines?: unknown[] } | null)?.doctrines;
  if (!Array.isArray(list)) return [];
  const out: DoctrineRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.name !== 'string' ||
      typeof r.townId !== 'string'
    ) {
      continue;
    }
    out.push({
      id: r.id,
      name: r.name,
      townId: r.townId,
      blurb: typeof r.blurb === 'string' ? r.blurb : undefined,
    });
  }
  return out;
}

function asShapes(raw: unknown): WorldShape[] {
  const list = (raw as { shapes?: unknown[] } | null)?.shapes;
  if (!Array.isArray(list)) return [];
  const out: WorldShape[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string') continue;
    const count = Array.isArray(r.settlementCount) ? r.settlementCount : [3, 4];
    const lo = typeof count[0] === 'number' ? count[0] : 3;
    const hi = typeof count[1] === 'number' ? count[1] : lo;
    const bandsRaw = Array.isArray(r.gapBands) ? r.gapBands : [];
    const gapBands: Array<[number, number]> = [];
    for (const b of bandsRaw) {
      if (!Array.isArray(b) || b.length < 2) continue;
      if (typeof b[0] !== 'number' || typeof b[1] !== 'number') continue;
      gapBands.push([b[0], b[1]]);
    }
    const bias = r.gapBias;
    const gapBias: GapBias =
      bias === 'low' || bias === 'mid' || bias === 'high' || bias === 'bimodal'
        ? bias
        : 'mid';
    const policy = r.routePolicy === 'mesh_light' ? 'mesh_light' : 'spine';
    out.push({
      id: r.id,
      weight: typeof r.weight === 'number' ? r.weight : 1,
      settlementCount: [lo, hi],
      gapBands,
      gapBias,
      rivalArcChance: typeof r.rivalArcChance === 'number' ? r.rivalArcChance : 0.35,
      doctrinePressure: typeof r.doctrinePressure === 'number' ? r.doctrinePressure : 1,
      routePolicy: policy,
      biomeTags: Array.isArray(r.biomeTags)
        ? r.biomeTags.filter((t): t is string => typeof t === 'string')
        : [],
    });
  }
  return out;
}

function asKinPatterns(raw: unknown): KinPattern[] {
  const list = (raw as { patterns?: unknown[] } | null)?.patterns;
  if (!Array.isArray(list)) return [];
  const out: KinPattern[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string') continue;
    const attach =
      r.treeAttach === 'previous' || r.treeAttach === 'hub' || r.treeAttach === 'random_earlier'
        ? r.treeAttach
        : 'random_earlier';
    out.push({
      id: r.id,
      weight: typeof r.weight === 'number' ? r.weight : 1,
      treeAttach: attach,
      kindBag: Array.isArray(r.kindBag)
        ? r.kindBag.filter((k): k is string => typeof k === 'string')
        : ['kin', 'friend'],
      extraChordMul: typeof r.extraChordMul === 'number' ? r.extraChordMul : 0.5,
      chordKinds: Array.isArray(r.chordKinds)
        ? r.chordKinds.filter((k): k is string => typeof k === 'string')
        : ['friend', 'pen_pal'],
    });
  }
  return out;
}

function pickWeighted<T extends { weight: number }>(rng: Rng, items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  const total = items.reduce((n, it) => n + Math.max(0, it.weight), 0);
  if (total <= 0) return items[rng.int(0, items.length)];
  let ticket = rng.next() * total;
  for (const it of items) {
    ticket -= Math.max(0, it.weight);
    if (ticket < 0) return it;
  }
  return items[items.length - 1];
}

export function pickWorldShape(rng: Rng, shapes: WorldShape[]): WorldShape | undefined {
  return pickWeighted(rng, shapes);
}

export function pickKinPattern(rng: Rng, patterns: KinPattern[]): KinPattern | undefined {
  return pickWeighted(rng, patterns);
}

export function loadWorldTables(): WorldTables {
  const base = asTowns(townsJson);
  const poles = asTowns(gapPolesJson);
  const seen = new Set(base.map((t) => t.id));
  const towns = base.concat(poles.filter((t) => !seen.has(t.id)));
  return {
    towns,
    routes: asRoutes(routesJson),
    doctrines: asDoctrines(doctrinesJson),
    shapes: asShapes(shapesJson),
    kinPatterns: asKinPatterns(kinPatternsJson),
  };
}
