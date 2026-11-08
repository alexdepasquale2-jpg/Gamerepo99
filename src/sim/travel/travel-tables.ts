/** Authored travel/encounter/biome tables for travel.ts. No gen/ imports. */

import biomesJson from '../../data/world/biomes.json';
import encounterDensityJson from '../../data/world/encounter-density.json';
import roadEncountersJson from '../../data/world/road-encounters.json';
import routesJson from '../../data/world/routes.json';
import type { EncounterEffect, EncounterTable, TravelRoute } from './travel-types';

type AuthoredRoute = {
  id?: string;
  encounterTableId?: string;
  biomeIds?: string[];
  days?: number;
};

const authoredById: Record<string, AuthoredRoute> = (() => {
  const list = (routesJson as { routes?: AuthoredRoute[] }).routes ?? [];
  const out: Record<string, AuthoredRoute> = {};
  for (const r of list) {
    if (r && typeof r.id === 'string') out[r.id] = r;
  }
  return out;
})();

export function loadEncounterTables(): EncounterTable[] {
  const tables = (roadEncountersJson as { tables?: unknown[] }).tables ?? [];
  const out: EncounterTable[] = [];
  for (const t of tables) {
    if (!t || typeof t !== 'object') continue;
    const row = t as { id?: string; entries?: unknown[] };
    if (typeof row.id !== 'string' || !Array.isArray(row.entries)) continue;
    const entries: EncounterTable['entries'] = [];
    for (const e of row.entries) {
      if (!e || typeof e !== 'object') continue;
      const er = e as {
        id?: string; weight?: number; blurb?: string; prism?: string; attractorId?: string;
        effects?: unknown; tags?: unknown; quiet?: boolean; heard?: string;
      };
      if (typeof er.id !== 'string') continue;
      entries.push({
        id: er.id,
        weight: typeof er.weight === 'number' ? er.weight : 1,
        blurb: typeof er.blurb === 'string' ? er.blurb : undefined,
        prism: typeof er.prism === 'string' ? er.prism : undefined,
        attractorId: typeof er.attractorId === 'string' ? er.attractorId : undefined,
        effects: Array.isArray(er.effects) ? (er.effects as EncounterEffect[]) : undefined,
        tags: Array.isArray(er.tags) ? (er.tags as string[]) : undefined,
        quiet: er.quiet === true || undefined,
        heard: typeof er.heard === 'string' ? er.heard : undefined,
      });
    }
    out.push({ id: row.id, entries });
  }
  return out;
}

export function loadBiomeTerrainMuls(): Record<string, number> {
  const list = (biomesJson as { biomes?: Array<{ id?: string; terrainMul?: number }> }).biomes ?? [];
  const out: Record<string, number> = {};
  for (const b of list) {
    if (b && typeof b.id === 'string' && typeof b.terrainMul === 'number') {
      out[b.id] = b.terrainMul;
    }
  }
  return out;
}

export function loadSizeTravelMuls(): Record<string, number> {
  const raw = (routesJson as { sizeTravelMuls?: Record<string, number> }).sizeTravelMuls;
  return raw && typeof raw === 'object' ? { ...raw } : { large: 1.2, human: 1.0, multi: 1.05 };
}

/** Enrich fabric routes with authored encounterTableId / biomeIds when present. */
export function toTravelRoutes(
  routes: Array<{ id: string; fromId: string; toId: string; days: number; biomeIds?: string[] }>,
): TravelRoute[] {
  return routes.map((r) => {
    const authored = authoredById[r.id];
    return {
      id: r.id,
      fromId: r.fromId,
      toId: r.toId,
      days: r.days,
      biomeIds: r.biomeIds?.length ? r.biomeIds : authored?.biomeIds,
      encounterTableId: authored?.encounterTableId,
    };
  });
}

export type EncounterDensity = {
  targetEncountersPerTravelDay: number;
  pSpawnClamp: { min: number; max: number };
  failChanceMul: number;
  biomeWeightMul: Record<string, number>;
  conditionWeightMul: { base: number; conditionCoef: number };
  cooldownTravelDays: number;
  cooldownBlocksTags: string[];
};

/** encounter-density.json (road-content-design §5). */
export function loadEncounterDensity(): EncounterDensity {
  return encounterDensityJson as unknown as EncounterDensity;
}
