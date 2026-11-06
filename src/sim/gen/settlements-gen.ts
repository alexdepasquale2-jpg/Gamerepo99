/** Seeded settlement selection from towns.json. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { DoctrineRow, TownRow } from './load-world-tables';

export type SettlementGen = {
  id: string;
  name: string;
  gap01: number;
  /** mapWidth * mapHeight proxy for polity scale. */
  politySize: number;
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

function politySize(t: TownRow): number {
  const w = t.mapWidth ?? 10;
  const h = t.mapHeight ?? 10;
  // City pole may be 1×1 in data — fall back to gap-weighted size.
  const area = w * h;
  if (area <= 1) return Math.round(200 + t.gapAxis * 800);
  return area;
}

/**
 * ≥3 settlements drawn from authored towns. Always keeps ≥1 doctrine-bearing
 * town so doctrines-gen can stay non-empty. Subset varies by seed.
 */
export function generateSettlements(
  rng: Rng,
  towns: TownRow[],
  doctrines: DoctrineRow[],
): SettlementGen[] {
  if (towns.length === 0) {
    return [
      { id: 'settlement_a', name: 'Settlement A', gap01: 0.1, politySize: 100 },
      { id: 'settlement_b', name: 'Settlement B', gap01: 0.5, politySize: 200 },
      { id: 'settlement_c', name: 'Settlement C', gap01: 0.9, politySize: 300 },
    ];
  }

  const doctrineTowns = new Set(doctrines.map((d) => d.townId));
  const withDoc = shuffle(
    rng,
    towns.filter((t) => doctrineTowns.has(t.id) || Boolean(t.doctrineId)),
  );
  const withoutDoc = shuffle(
    rng,
    towns.filter((t) => !doctrineTowns.has(t.id) && !t.doctrineId),
  );

  const target = Math.min(towns.length, Math.max(3, rng.int(3, towns.length + 1)));
  const picked: TownRow[] = [];

  // Guarantee one doctrine-bearing town when any exist.
  if (withDoc.length > 0) {
    picked.push(withDoc[0]!);
  }

  const rest = shuffle(rng, [
    ...withDoc.slice(picked.length > 0 ? 1 : 0),
    ...withoutDoc,
  ]);
  for (const t of rest) {
    if (picked.length >= target) break;
    if (picked.some((p) => p.id === t.id)) continue;
    picked.push(t);
  }

  // Pad from full list if tables are tiny.
  if (picked.length < 3) {
    for (const t of towns) {
      if (picked.length >= 3) break;
      if (picked.some((p) => p.id === t.id)) continue;
      picked.push(t);
    }
  }

  return picked
    .map((t) => ({
      id: t.id,
      name: t.name,
      gap01: Math.round(t.gapAxis * 1000) / 1000,
      politySize: politySize(t),
    }))
    .sort((a, b) => a.gap01 - b.gap01 || a.id.localeCompare(b.id));
}
