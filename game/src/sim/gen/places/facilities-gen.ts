/** Seeded facility selection from facilities.json. Pure; no dyn/. */

import facilitiesJson from '../../../data/economy/facilities.json';
import { townRole } from '../../economy/town-roles';
import { districtOfTown } from '../../map/districts';
import type { Rng } from '../../rng';
import type { FacilityRow } from '../load/load-facilities-biomes';
import type { SettlementGen } from './settlements-gen';
import type { RouteGen } from './routes-gen';

export type FacilityGen = {
  id: string;
  name: string;
  kind: string;
  townId?: string | null;
  routeId?: string | null;
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
 * facilities.json names roads the authored way (route_<a>_<b>); map one onto this world's generated
 * road between the same two towns, or null when this world has no such road.
 */
export function resolveFacilityRoute(routes: RouteGen[], routeId: string | null | undefined): string | null {
  if (!routeId) return null;
  if (routes.some((r) => r.id === routeId)) return routeId;
  const body = routeId.replace(/^route_/, '');
  return routes.find((r) => body === `${r.fromId}_${r.toId}` || body === `${r.toId}_${r.fromId}`)?.id ?? null;
}

type Roles = {
  byLand: Record<string, string[]>;
  byTownKind: Record<string, string[]>;
  nameByKind: Record<string, string>;
};
const ROLES = (facilitiesJson as { roles?: Roles }).roles;

/**
 * A generated district's facilities, by role: each town keeps what its kind and its district's land call
 * for (facilities.json roles), on the first road out of it. No rng is drawn, so the world's later
 * geoRng picks (biomes) stay where they were. Ids are `fac_<townId>_<kind>`, so stable per town.
 */
export function roleFacilities(seed: number, settlements: SettlementGen[], routes: RouteGen[]): FacilityGen[] {
  if (!ROLES) return [];
  const out: FacilityGen[] = [];
  for (const s of settlements) {
    const role = townRole(seed, s.id);
    if (!role) continue;
    const land = ROLES.byLand[role.land] ?? ['mill'];
    const kinds = (ROLES.byTownKind[role.kind] ?? ['land:0']).map((k) => (k.startsWith('land:') ? land[Number(k.slice(5))] ?? land[0]! : k));
    const road = routes.filter((r) => r.fromId === s.id || r.toId === s.id).sort((a, b) => a.id.localeCompare(b.id))[0];
    // Facilities stand beside a road; a town with none would get a facility that is never placed.
    if (!road) continue;
    for (const kind of [...new Set(kinds)]) {
      out.push({
        id: `fac_${s.id}_${kind}`,
        name: (ROLES.nameByKind[kind] ?? `{town} ${kind}`).replace('{town}', s.name),
        kind, townId: s.id, routeId: road.id,
      });
    }
  }
  return out;
}

/**
 * Facilities whose town or route is selected. Seed-varying subset; always ≥1
 * when any match (or a synthetic mill on the first settlement).
 */
export function generateFacilities(
  rng: Rng,
  settlements: SettlementGen[],
  routes: RouteGen[],
  catalog: FacilityRow[],
  seed?: number,
): FacilityGen[] {
  // A generated district names none of the authored towns: its facilities come by role instead.
  if (seed !== undefined && settlements.length && settlements.every((s) => districtOfTown(s.id))) {
    const roles = roleFacilities(seed, settlements, routes);
    if (roles.length) return roles;
  }
  const townIds = new Set(settlements.map((s) => s.id));
  const routeIds = new Set(routes.map((r) => r.id));
  const matching = catalog.filter(
    (f) =>
      (f.townId != null && townIds.has(f.townId)) ||
      (f.routeId != null && routeIds.has(f.routeId)),
  );

  if (matching.length === 0) {
    const hub = settlements[0];
    const route = routes[0];
    return [
      {
        id: `fac_${hub?.id ?? 'hub'}_mill`,
        name: `${hub?.name ?? 'Hub'} Mill`,
        kind: 'mill',
        townId: hub?.id ?? null,
        routeId: route?.id ?? null,
      },
    ];
  }

  const keep = Math.max(1, rng.int(1, matching.length + 1));
  return shuffle(rng, matching)
    .slice(0, keep)
    .map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      townId: f.townId ?? null,
      // Selection above is unchanged (same rng draws); the road id is then this world's generated road.
      routeId: resolveFacilityRoute(routes, f.routeId),
    }));
}
