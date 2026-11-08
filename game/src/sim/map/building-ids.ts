/**
 * Older saves keyed per-building flags by `${townId}:${planIndex}`; buildings are now `${townId}:${slot}`
 * (sim/map/town-plan slots). Rather than bump the save version, the flags are adopted lazily: whoever
 * reads a town's building flags first hands its buildings here, and any legacy key moves to the new id.
 * A legacy key always ends in digits after the last ':' and a slot never does, so the two cannot collide.
 */
import type { SimState } from '../types/runtime';
import type { Building } from './interiors';

/** state.flags maps keyed by building id. Add a key here when a new per-building flag appears. */
export const BUILDING_FLAG_KEYS = ['lanternLit'] as const;

const LEGACY = /:\d+$/;
export const isLegacyBuildingId = (id: string): boolean => LEGACY.test(id);

/**
 * Move legacy-keyed flags for these buildings (one town's, or all) onto their stable ids. Idempotent;
 * a value already stored under the new id wins. Returns how many keys moved.
 */
export function adoptLegacyBuildingFlags(state: SimState, buildings: readonly Building[]): number {
  let moved = 0;
  for (const key of BUILDING_FLAG_KEYS) {
    const map = state.flags[key] as Record<string, unknown> | undefined;
    if (!map || typeof map !== 'object') continue;
    // Cheap out: most saves have no legacy keys at all (or none left).
    if (!Object.keys(map).some(isLegacyBuildingId)) continue;
    for (const b of buildings) {
      if (!(b.legacyId in map)) continue;
      if (!(b.id in map)) map[b.id] = map[b.legacyId];
      delete map[b.legacyId];
      moved++;
    }
  }
  return moved;
}
