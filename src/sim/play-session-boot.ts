/** Play-session boot helpers: people index + town pick + snapshot. */

import type { FabricWorld } from './gen/world';
import type { DataTables } from './load-data';
import { siteKindFromSiteId } from './scenario-resolve';
import { isBurnedOut } from './succession';
import type { PlaySnapshot } from './play-session-types';
import type { PersonState, SimState } from './types/runtime';

/** Spread unset townIds across settlements so Fabric kin can be cross-town. */
export function assignSettlementTowns(
  people: Record<string, PersonState>,
  world: FabricWorld,
): void {
  const settlements = (world.settlements ?? []).map((s) => s.id);
  if (settlements.length === 0) return;
  let i = 0;
  for (const p of Object.values(people)) {
    if (p.townId) continue;
    p.townId = settlements[i % settlements.length]!;
    i += 1;
  }
}

export function peopleFromWorld(world: FabricWorld, data: DataTables): Record<string, PersonState> {
  const out: Record<string, PersonState> = {};
  for (const draft of world.people) {
    const row = data.peopleById[draft.id];
    const start = Number(row?.flameStart ?? 20);
    const siteId = typeof row?.siteId === 'string' ? row.siteId : undefined;
    out[draft.id] = {
      id: draft.id,
      flame: start,
      flameStart: start,
      townId: typeof row?.townId === 'string' ? row.townId : undefined,
      siteId,
      woundId: typeof row?.woundId === 'string' ? row.woundId : undefined,
      tags: Array.isArray(row?.tags) ? [...(row.tags as string[])] : [],
      marks: [],
      age: typeof row?.age === 'number' ? row.age : undefined,
      siteKind: siteKindFromSiteId(siteId),
      anchor: row?.anchor === true || row?.authored === true || draft.anchor === true,
    };
  }
  assignSettlementTowns(out, world);
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

export function buildPlaySnapshot(opts: {
  tickN: number;
  state: SimState | null;
  world: FabricWorld | null;
  successionOpen: boolean;
}): PlaySnapshot {
  const { tickN, state, world, successionOpen } = opts;
  const player = state?.player;
  const spark = player?.spark ?? 0;
  const burnAt = (state?.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  let reignitedCount = 0;
  let hollowCount = 0;
  for (const p of Object.values(state?.people ?? {})) {
    if (p.flame >= burnAt) reignitedCount += 1;
    if ((p.marks ?? []).some((m) => m.markId === 'hollowness')) hollowCount += 1;
  }
  return {
    tick: tickN,
    day: state?.day ?? 0,
    spark,
    burnedOut:
      successionOpen ||
      (player ? isBurnedOut(player, state?.data as DataTables | undefined) : spark <= 0),
    townId: player?.townId ?? 'unknown',
    townCount: world?.gapSites?.length ?? world?.settlements?.length ?? 0,
    fingerprint: `${world?.fingerprint ?? 'unbooted'}-t${tickN}`,
    reignitedCount,
    hollowCount,
  };
}
