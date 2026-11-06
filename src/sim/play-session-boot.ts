/** Play-session boot helpers: people index + town pick on routed settlements. */

import type { FabricWorld } from './gen/world';
import type { DataTables } from './load-data';
import type { PersonState } from './types/runtime';

export function peopleFromWorld(world: FabricWorld, data: DataTables): Record<string, PersonState> {
  const out: Record<string, PersonState> = {};
  for (const draft of world.people) {
    const row = data.peopleById[draft.id];
    const start = Number(row?.flameStart ?? 20);
    out[draft.id] = {
      id: draft.id,
      flame: start,
      flameStart: start,
      townId: typeof row?.townId === 'string' ? row.townId : undefined,
      siteId: typeof row?.siteId === 'string' ? row.siteId : undefined,
      woundId: typeof row?.woundId === 'string' ? row.woundId : undefined,
      tags: Array.isArray(row?.tags) ? [...(row.tags as string[])] : [],
      marks: [],
    };
  }
  return out;
}

/** Prefer authored town when it sits on a generated route; else first routed settlement. */
export function pickTownId(playerTown: string | undefined, world: FabricWorld): string {
  const routes = world.routes ?? [];
  const endpoints = new Set<string>();
  for (const r of routes) {
    endpoints.add(r.fromId);
    endpoints.add(r.toId);
  }
  if (playerTown && endpoints.has(playerTown)) return playerTown;
  if (playerTown && (world.settlements ?? []).some((s) => s.id === playerTown)) {
    return playerTown;
  }
  const firstRouted = routes[0]?.fromId ?? routes[0]?.toId;
  if (firstRouted) return firstRouted;
  return world.settlements?.[0]?.id ?? world.gapSites?.[0]?.id ?? playerTown ?? 'unknown';
}
