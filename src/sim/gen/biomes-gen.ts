/** Seeded biome selection from routes + shape biomeTags. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { WorldShape } from './load-world-tables';
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
 * Union of route biomes plus 1–2 from shape biomeTags so sets diverge by seed.
 */
export function generateBiomes(
  rng: Rng,
  routes: RouteGen[],
  catalog: BiomeRow[],
  shape?: WorldShape,
): BiomeGen[] {
  const referenced = new Set<string>();
  for (const r of routes) {
    for (const id of r.biomeIds ?? []) referenced.add(id);
  }

  const fromRoutes = catalog.filter((b) => referenced.has(b.id));
  const tagSet = new Set(shape?.biomeTags ?? []);
  const fromTags = catalog.filter(
    (b) => (b.tags ?? []).some((t) => tagSet.has(t)) && !referenced.has(b.id),
  );

  const picked: BiomeRow[] = [];
  const used = new Set<string>();
  const take = (b: BiomeRow | undefined) => {
    if (!b || used.has(b.id)) return;
    picked.push(b);
    used.add(b.id);
  };

  for (const b of shuffle(rng, fromRoutes)) take(b);

  const tagKeep = Math.min(fromTags.length, 1 + rng.int(0, 2)); // 1..2 when available
  for (const b of shuffle(rng, fromTags).slice(0, tagKeep)) take(b);

  if (picked.length === 0) {
    const pool = catalog.length > 0 ? catalog : [];
    if (pool.length === 0) {
      return [{ id: 'biome_fallback', name: 'Open Country', tags: ['open'] }];
    }
    const keep = Math.max(1, rng.int(1, pool.length + 1));
    return shuffle(rng, pool)
      .slice(0, keep)
      .map((b) => ({ id: b.id, name: b.name, tags: b.tags }));
  }

  return picked.map((b) => ({ id: b.id, name: b.name, tags: b.tags }));
}
