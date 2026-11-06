/** Seeded biome selection from biomes.json. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { BiomeRow } from './load-facilities-biomes';
import type { RouteGen } from './routes-gen';

export type BiomeGen = {
  id: string;
  name: string;
  tags?: string[];
};

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Prefer biomes referenced by selected routes; otherwise draw from catalog.
 * Seed-varying subset; always ≥1.
 */
export function generateBiomes(
  rng: Rng,
  routes: RouteGen[],
  catalog: BiomeRow[],
): BiomeGen[] {
  const referenced = new Set<string>();
  for (const r of routes) {
    for (const id of r.biomeIds ?? []) referenced.add(id);
  }

  const fromRoutes = catalog.filter((b) => referenced.has(b.id));
  const pool = fromRoutes.length > 0 ? fromRoutes : catalog;

  if (pool.length === 0) {
    return [{ id: 'biome_fallback', name: 'Open Country', tags: ['open'] }];
  }

  const keep = Math.max(1, rng.int(1, pool.length + 1));
  return shuffle(rng, pool)
    .slice(0, keep)
    .map((b) => ({
      id: b.id,
      name: b.name,
      tags: b.tags,
    }));
}
