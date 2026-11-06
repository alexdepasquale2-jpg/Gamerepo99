/** Seeded route selection with shape routePolicy. Pure; no dyn/. */

import type { Rng } from '../../rng';
import type { RouteRow, WorldShape } from '../load/load-world-tables';
import type { SettlementGen } from './settlements-gen';

export type RouteGen = {
  id: string;
  fromId: string;
  toId: string;
  days: number;
  biomeIds: string[];
};

function synthesizeSpine(rng: Rng, settlements: SettlementGen[]): RouteGen[] {
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
  return out;
}

function synthesizeMesh(rng: Rng, settlements: SettlementGen[]): RouteGen[] {
  const spine = synthesizeSpine(rng, settlements);
  if (settlements.length < 4) return spine;
  const ordered = settlements.slice().sort((a, b) => a.gap01 - b.gap01);
  // One skip-edge so diameter can exceed a pure path when count is high.
  const a = ordered[0]!;
  const b = ordered[Math.min(ordered.length - 1, 2)]!;
  const skip = {
    id: `route_${a.id}_${b.id}_skip`,
    fromId: a.id,
    toId: b.id,
    days: 1 + rng.int(1, 3),
    biomeIds: [] as string[],
  };
  if (spine.some((r) => r.fromId === skip.fromId && r.toId === skip.toId)) return spine;
  return [...spine, skip];
}

/**
 * Prefer authored routes whose endpoints are both selected.
 * Spine policy keeps a gap-ordered chain (diameter ≥ n-1 when synthesized);
 * mesh_light adds a light chord.
 */
export function generateRoutes(
  rng: Rng,
  settlements: SettlementGen[],
  catalog: RouteRow[],
  shape?: WorldShape,
): RouteGen[] {
  const ids = new Set(settlements.map((s) => s.id));
  const matching = catalog.filter(
    (r) => ids.has(r.fromTownId) && ids.has(r.toTownId),
  );
  const policy = shape?.routePolicy ?? 'spine';

  if (matching.length > 0) {
    // Keep enough edges for diameter: spine wants a connecting set.
    const keep =
      policy === 'mesh_light'
        ? Math.max(1, rng.int(Math.min(2, matching.length), matching.length + 1))
        : Math.max(1, rng.int(1, matching.length + 1));
    const shuffled = matching.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    const picked = shuffled.slice(0, keep).map((r) => ({
      id: r.id,
      fromId: r.fromTownId,
      toId: r.toTownId,
      days: r.days ?? 1,
      biomeIds: r.biomeIds ?? [],
    }));
    // If authored subset is disconnected / short, pad with spine links.
    if (settlements.length >= 5 && picked.length < settlements.length - 1) {
      const syn = synthesizeSpine(rng, settlements);
      const seen = new Set(picked.map((r) => `${r.fromId}|${r.toId}`));
      for (const r of syn) {
        const key = `${r.fromId}|${r.toId}`;
        const rev = `${r.toId}|${r.fromId}`;
        if (seen.has(key) || seen.has(rev)) continue;
        picked.push(r);
        seen.add(key);
        if (picked.length >= settlements.length - 1) break;
      }
    }
    return picked;
  }

  const syn =
    policy === 'mesh_light' ? synthesizeMesh(rng, settlements) : synthesizeSpine(rng, settlements);
  if (syn.length > 0) return syn;
  return [
    {
      id: 'route_fallback',
      fromId: settlements[0]?.id ?? 'a',
      toId: settlements[1]?.id ?? settlements[0]?.id ?? 'b',
      days: 1,
      biomeIds: [],
    },
  ];
}
