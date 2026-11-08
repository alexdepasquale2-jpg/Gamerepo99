/** Seeded settlement selection from towns + world-shapes. Pure; no dyn/. */

import type { Rng } from '../../rng';
import type { DoctrineRow, TownRow, WorldShape } from '../load/load-world-tables';

export type SettlementGen = {
  id: string;
  name: string;
  gap01: number;
  /** mapWidth * mapHeight proxy for polity scale. */
  politySize: number;
  /** A generated district's town: its fixed spot in world tiles (layout uses it as is). */
  at?: { q: number; r: number };
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
  const area = w * h;
  if (area <= 1) return Math.round(200 + t.gapAxis * 800);
  return area;
}

function inBand(gap: number, band: [number, number]): boolean {
  return gap >= band[0] && gap <= band[1];
}

/**
 * ≥3 settlements drawn from authored towns. Shape drives count + gapBands.
 * When catalog ≥6, leave ≥2 towns out so pairwise sets diverge.
 */
export function generateSettlements(
  rng: Rng,
  towns: TownRow[],
  doctrines: DoctrineRow[],
  shape?: WorldShape,
): SettlementGen[] {
  if (towns.length === 0) {
    return [
      { id: 'settlement_a', name: 'Settlement A', gap01: 0.1, politySize: 100 },
      { id: 'settlement_b', name: 'Settlement B', gap01: 0.5, politySize: 200 },
      { id: 'settlement_c', name: 'Settlement C', gap01: 0.9, politySize: 300 },
    ];
  }

  const [lo, hi] = shape?.settlementCount ?? [3, Math.min(4, towns.length)];
  let target = Math.max(3, rng.int(lo, hi + 1));
  // Never force the full catalog when towns.length ≥ 6 — leave ≥2 out.
  if (towns.length >= 6) {
    target = Math.min(target, towns.length - 2);
  }
  target = Math.max(3, Math.min(towns.length, target));

  const doctrineTowns = new Set(doctrines.map((d) => d.townId));
  const picked: TownRow[] = [];
  const used = new Set<string>();

  const take = (t: TownRow | undefined) => {
    if (!t || used.has(t.id) || picked.length >= target) return;
    picked.push(t);
    used.add(t.id);
  };

  // Each gap band contributes ≥1 town when available.
  for (const band of shape?.gapBands ?? []) {
    const candidates = shuffle(
      rng,
      towns.filter((t) => !used.has(t.id) && inBand(t.gapAxis, band)),
    );
    take(candidates[0]);
  }

  // Guarantee one doctrine-bearing town when any exist.
  if (![...used].some((id) => {
    const t = towns.find((x) => x.id === id);
    return t && (doctrineTowns.has(t.id) || Boolean(t.doctrineId));
  })) {
    const withDoc = shuffle(
      rng,
      towns.filter((t) => !used.has(t.id) && (doctrineTowns.has(t.id) || Boolean(t.doctrineId))),
    );
    take(withDoc[0]);
  }

  const rest = shuffle(
    rng,
    towns.filter((t) => !used.has(t.id)),
  );
  for (const t of rest) {
    if (picked.length >= target) break;
    take(t);
  }

  if (picked.length < 3) {
    for (const t of towns) {
      if (picked.length >= 3) break;
      take(t);
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
