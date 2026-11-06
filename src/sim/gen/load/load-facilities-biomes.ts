/** Load facilities + biomes tables for worldgen. Pure; no dyn/. */

import facilitiesJson from '../../../data/economy/facilities.json';
import biomesJson from '../../../data/world/biomes.json';

export type FacilityRow = {
  id: string;
  name: string;
  kind: string;
  townId?: string | null;
  routeId?: string | null;
};

export type BiomeRow = {
  id: string;
  name: string;
  tags?: string[];
};

export type FacilitiesBiomesTables = {
  facilities: FacilityRow[];
  biomes: BiomeRow[];
};

function asFacilities(raw: unknown): FacilityRow[] {
  const list = (raw as { facilities?: unknown[] } | null)?.facilities;
  if (!Array.isArray(list)) return [];
  const out: FacilityRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    out.push({
      id: r.id,
      name: r.name,
      kind: typeof r.kind === 'string' ? r.kind : 'unknown',
      townId: typeof r.townId === 'string' ? r.townId : null,
      routeId: typeof r.routeId === 'string' ? r.routeId : null,
    });
  }
  return out;
}

function asBiomes(raw: unknown): BiomeRow[] {
  const list = (raw as { biomes?: unknown[] } | null)?.biomes;
  if (!Array.isArray(list)) return [];
  const out: BiomeRow[] = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    out.push({
      id: r.id,
      name: r.name,
      tags: Array.isArray(r.tags)
        ? r.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
    });
  }
  return out;
}

export function loadFacilitiesBiomesTables(): FacilitiesBiomesTables {
  return {
    facilities: asFacilities(facilitiesJson),
    biomes: asBiomes(biomesJson),
  };
}
