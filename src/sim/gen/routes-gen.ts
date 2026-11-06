/** Seeded route selection linking settlements. Pure; no dyn/. */

import type { Rng } from '../rng';
import type { RouteRow } from './load-world-tables';
import type { SettlementGen } from './settlements-gen';

export type RouteGen = {
  id: string;
  fromId: string;
  toId: string;
  days: number;
  biomeIds: string[];
};

/**
 * Prefer authored routes whose endpoints are both selected. If none match,
 * synthesize a gap-ordered chain so every world has ≥1 link.
 */
export function generateRoutes(
  rng: Rng,
  settlements: SettlementGen[],
  catalog: RouteRow[],
): RouteGen[] {
  const ids = new Set(settlements.map((s) => s.id));
  const matching = catalog.filter(
    (r) => ids.has(r.fromTownId) && ids.has(r.toTownId),
  );

  if (matching.length > 0) {
    // Seed-varying subset: keep 1..all matching routes.
    const keep = Math.max(1, rng.int(1, matching.length + 1));
    const shuffled = matching.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    return shuffled.slice(0, keep).map((r) => ({
      id: r.id,
      fromId: r.fromTownId,
      toId: r.toTownId,
      days: r.days ?? 1,
      biomeIds: r.biomeIds ?? [],
    }));
  }

  // Synthesize chain along gap axis.
  const ordered = settlements.slice().sort((a, b) => a.gap01 - b.gap01);
  const out: RouteGen[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    out.push({
      id: `route_${a.id}_${b.id}`,
      fromId: a.id,
      toId: b.id,
      days: 1 + rng.int(1, 4),
      biomeIds: [],
    });
  }
  return out.length > 0
    ? out
    : [
        {
          id: 'route_fallback',
          fromId: settlements[0]?.id ?? 'a',
          toId: settlements[1]?.id ?? settlements[0]?.id ?? 'b',
          days: 1,
          biomeIds: [],
        },
      ];
}
