/** Play-session boot helpers: people index + town pick + snapshot. */

import type { FabricWorld } from '../gen/world';
import type { DataTables } from '../load-data';
import { siteKindFromSiteId } from '../scenario/scenario-resolve';
import { isBurnedOut } from '../succession';
import type { PlaySnapshot } from './play-session-types';
import { deriveRng } from '../rng';
import type { PersonState, SimState } from '../types/runtime';
import { createCompatRuntime, type CompatRuntime, type InteractionTables } from '../interaction';

/** Default trust for people seeded into the interaction compat runtime (no trust in PersonState yet). */
export const COMPAT_TRUST_DEFAULT = 0.35;

/** One compat runtime with every person seeded from flame (0..100 → flame01) + trust default. */
export function interactionRuntimeFromPeople(
  people: Record<string, PersonState>,
  playerSpark: number,
  tables: InteractionTables,
): CompatRuntime {
  const seeds = Object.values(people).map((p) => ({
    id: p.id,
    flame01: Math.min(1, Math.max(0, p.flame / 100)),
    trust: COMPAT_TRUST_DEFAULT,
    marks: {},
    touchScore: 0,
    presence: 0,
    bond: 0,
    spark: playerSpark,
  }));
  const rt = createCompatRuntime(
    tables,
    seeds[0] ?? { id: '__none__', flame01: 0, trust: 0, marks: {}, touchScore: 0, presence: 0, bond: 0, spark: playerSpark },
  );
  if (!seeds[0]) rt.people.clear();
  for (const s of seeds.slice(1)) rt.people.set(s.id, s);
  return rt;
}

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

/** Deterministic generated names; kin-edge components share a family name. Own rng streams only. */
function assignNames(out: Record<string, PersonState>, world: FabricWorld, data: DataTables, seed: number): void {
  const { given, family } = data.names;
  if (!given?.length || !family?.length) return;
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    while ((parent[x] ?? x) !== x) x = parent[x]!;
    return x;
  };
  for (const e of world.kinEdges ?? []) {
    if (e.kind !== 'kin' || !out[e.from] || !out[e.to]) continue;
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) (a < b ? (parent[b] = a) : (parent[a] = b));
  }
  for (const p of Object.values(out)) {
    if (p.name) continue;
    const g = given[deriveRng(seed, p.id, 'name').int(0, given.length)]!;
    const f = family[deriveRng(seed, find(p.id), 'family').int(0, family.length)]!;
    p.name = `${g} ${f}`;
  }
}

export function peopleFromWorld(world: FabricWorld, data: DataTables, seed = 0): Record<string, PersonState> {
  const out: Record<string, PersonState> = {};
  for (const draft of world.people) {
    const row = data.peopleById[draft.id];
    const start = Number(row?.flameStart ?? 20);
    const siteId = typeof row?.siteId === 'string' ? row.siteId : undefined;
    out[draft.id] = {
      id: draft.id,
      name: typeof row?.name === 'string' && row.name ? row.name : undefined,
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
  assignNames(out, world, data, seed);
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
    unspoken: state?.unspoken ? structuredClone(state.unspoken) : undefined,
  };
}
