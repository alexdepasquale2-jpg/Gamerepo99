/**
 * Older saves keyed per-building flags by `${townId}:${planIndex}`; buildings are now `${townId}:${slot}`
 * (sim/map/town-plan slots). Rather than bump the save version, the flags are adopted lazily: whoever
 * reads a town's building flags first hands its buildings here, and any legacy key moves to the new id.
 * A legacy key always ends in digits after the last ':' and a slot never does, so the two cannot collide.
 *
 * Plan order has changed since those saves (town plans now keep buildings off the roads through town), so
 * index i today need not be the building that was index i then. The plan those saves were made with is
 * still derivable: it is today's plan with no road lanes (lanes were the only placement change after
 * slots). A flag moves only to a building of today's plan with the same kind and the same door as that
 * plan's building i — the same lot — and is dropped otherwise, rather than light a lantern in someone
 * else's house.
 */
import type { SimState } from '../types/runtime';
import { townBuildings, type Building } from './interiors';
import type { LayoutSettlement } from './world-layout';

/** state.flags maps keyed by building id. Add a key here when a new per-building flag appears. */
export const BUILDING_FLAG_KEYS = ['lanternLit'] as const;

const LEGACY = /:\d+$/;
export const isLegacyBuildingId = (id: string): boolean => LEGACY.test(id);

/** The buildings of a town as the pre-slot saves laid them out (today's plan with no road lanes), by legacy id. */
export function legacyBuildingsOf(town: LayoutSettlement): Map<string, Building> {
  return new Map(townBuildings({ ...town, lanes: undefined }).map((b) => [b.legacyId, b]));
}

/** The same lot then and now: kind, stamp and door all agree. */
const sameLot = (then: Building, now: Building): boolean =>
  then.kind === now.kind && then.stampType === now.stampType && then.door.x === now.door.x && then.door.y === now.door.y;

/**
 * Move legacy-keyed flags for these buildings (one town's, or all) onto their stable ids: each legacy key goes
 * to today's building standing on the lot it named (same kind, same door), wherever it now sits in the plan,
 * and is dropped when no building does (see above). Idempotent; a value already stored under the new id
 * wins. Returns how many keys moved.
 */
export function adoptLegacyBuildingFlags(state: SimState, buildings: readonly Building[], towns: readonly LayoutSettlement[]): number {
  let moved = 0;
  const byTown = new Map<string, Building[]>();
  for (const b of buildings) byTown.set(b.townId, [...(byTown.get(b.townId) ?? []), b]);
  const legacy = new Map<string, Map<string, Building>>();
  const legacyOf = (townId: string): Map<string, Building> => {
    let m = legacy.get(townId);
    if (!m) { const t = towns.find((x) => x.id === townId); legacy.set(townId, (m = t ? legacyBuildingsOf(t) : new Map())); }
    return m;
  };
  for (const key of BUILDING_FLAG_KEYS) {
    const map = state.flags[key] as Record<string, unknown> | undefined;
    if (!map || typeof map !== 'object') continue;
    for (const k of Object.keys(map)) {
      if (!isLegacyBuildingId(k)) continue;
      const townId = k.slice(0, k.lastIndexOf(':'));
      const today = byTown.get(townId);
      if (!today) continue; // another town's key waits for that town's buildings
      const then = legacyOf(townId).get(k);
      const now = then && today.find((b) => sameLot(then, b));
      if (now) {
        if (!(now.id in map)) map[now.id] = map[k];
        moved++;
      }
      delete map[k];
    }
  }
  return moved;
}
