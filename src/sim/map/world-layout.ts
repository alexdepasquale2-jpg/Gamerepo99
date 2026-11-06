/** Assign world q,r to Fabric settlements along the gap01 spine. Pure. */

import type { FabricWorld } from '../gen/world-types';
import { createRng } from '../rng';
import { LAYOUT_JITTER, SPINE_SPACING } from './constants';

export type LayoutSettlement = { id: string; q: number; r: number };
export type LayoutRoute = { id: string; from: string; to: string };

export type WorldLayout = {
  settlements: LayoutSettlement[];
  routes: LayoutRoute[];
};

/**
 * Place settlements along the gap01 axis with minutes-scale spacing and
 * light seeded perpendicular jitter. Routes remap fromId/toId → from/to.
 */
export function layoutWorld(world: FabricWorld, seed: number): WorldLayout {
  const rng = createRng(seed >>> 0);
  const raw = (world.settlements ?? [])
    .slice()
    .sort((a, b) => a.gap01 - b.gap01 || a.id.localeCompare(b.id));

  const settlements: LayoutSettlement[] = raw.map((s, i) => {
    const jitter = rng.int(-LAYOUT_JITTER, LAYOUT_JITTER + 1);
    return {
      id: s.id,
      q: i * SPINE_SPACING,
      r: jitter,
    };
  });

  const idSet = new Set(settlements.map((s) => s.id));
  const routes: LayoutRoute[] = [];
  for (const route of world.routes ?? []) {
    if (!idSet.has(route.fromId) || !idSet.has(route.toId)) continue;
    routes.push({ id: route.id, from: route.fromId, to: route.toId });
  }

  return { settlements, routes };
}
