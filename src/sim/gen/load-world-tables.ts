/** Load towns / routes / doctrines tables for worldgen. Pure; no dyn/. */

import townsJson from '../../data/world/towns.json';
import routesJson from '../../data/world/routes.json';
import doctrinesJson from '../../data/systems/doctrines.json';

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

export type WorldTables = {
  towns: TownRow[];
  routes: RouteRow[];
  doctrines: DoctrineRow[];
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

export function loadWorldTables(): WorldTables {
  return {
    towns: asTowns(townsJson),
    routes: asRoutes(routesJson),
    doctrines: asDoctrines(doctrinesJson),
  };
}
