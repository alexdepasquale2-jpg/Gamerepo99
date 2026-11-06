/** Travel days + roadside encounters. Pure sim; no Phaser/DOM/Math.random; no gen/ imports. */

import type { Rng } from './rng';
import { advanceToDawn } from './scenario-advance';
import {
  loadBiomeTerrainMuls,
  loadEncounterTables,
  loadSizeTravelMuls,
  toTravelRoutes,
} from './travel-tables';
import type {
  EncounterEntry,
  EncounterTable,
  TravelRoute,
  TravelSimState,
} from './travel-types';
import type { Inhabitant, SimState } from './types/runtime';

export type { TravelRoute, EncounterEntry, EncounterTable, TravelSimState } from './travel-types';
export { loadBiomeTerrainMuls, loadEncounterTables, loadSizeTravelMuls, toTravelRoutes };

export function listRoutesFrom(routes: TravelRoute[], townId: string): string[] {
  const out: string[] = [];
  for (const r of routes) {
    if (r.fromId === townId || r.toId === townId) out.push(r.id);
  }
  return out;
}

function pushJuice(state: SimState, eventId: string, payload?: unknown): void {
  const bus = (state.bus ??= { lastIds: [] }) as {
    lastIds?: string[];
    emit?: (e: string, p: unknown) => void;
  };
  (bus.lastIds ??= []).push(eventId);
  bus.emit?.(eventId, payload);
}

function sizeMulFor(player: Inhabitant, muls: Record<string, number>): number {
  const emb = player.embodiment as { tags?: string[]; footprint?: { tags?: string[] } };
  const tags = [
    ...(Array.isArray(emb?.tags) ? emb.tags : []),
    ...(Array.isArray(emb?.footprint?.tags) ? emb.footprint!.tags! : []),
  ];
  if (tags.includes('large') && typeof muls.large === 'number') return muls.large;
  if (tags.includes('multi') && typeof muls.multi === 'number') return muls.multi;
  return typeof muls.human === 'number' ? muls.human : 1;
}

function terrainMulFor(
  biomeIds: string[] | undefined,
  muls: Record<string, number> | undefined,
): number {
  if (!biomeIds?.length || !muls) return 1;
  let sum = 0;
  let n = 0;
  for (const id of biomeIds) {
    const m = muls[id];
    if (typeof m === 'number') {
      sum += m;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 1;
}

function pickEncounter(
  table: EncounterTable | undefined,
  rng: Rng | undefined,
): EncounterEntry | null {
  if (!table?.entries.length) return null;
  const total = table.entries.reduce((a, e) => a + Math.max(0, e.weight), 0);
  if (total <= 0) return table.entries[0] ?? null;
  let roll = rng ? rng.next() * total : 0;
  for (const e of table.entries) {
    roll -= Math.max(0, e.weight);
    if (roll < 0) return e;
  }
  return table.entries[table.entries.length - 1] ?? null;
}

function resolveDaysEff(route: TravelRoute, state: TravelSimState): number {
  const terrain = terrainMulFor(route.biomeIds, state.biomeTerrainMuls);
  const size = sizeMulFor(state.player, state.sizeTravelMuls ?? loadSizeTravelMuls());
  return Math.max(1, Math.ceil(route.days * terrain * size));
}

/**
 * Advance daysEff dawns along route; emit route.travel_step each day;
 * roll encounter table and emit encounter.spawn when an entry hits.
 */
export function startTravel(state: TravelSimState, routeId: string): { daysEff: number } {
  const routes = state.routes ?? [];
  const route = routes.find((r) => r.id === routeId);
  if (!route) return { daysEff: 0 };

  const townId = state.player.townId;
  if (townId !== route.fromId && townId !== route.toId) return { daysEff: 0 };

  const dest = townId === route.fromId ? route.toId : route.fromId;
  const daysEff = resolveDaysEff(route, state);

  const tables = state.encounterTables ?? loadEncounterTables();
  const tableId = route.encounterTableId ?? tables[0]?.id;
  const table = tables.find((t) => t.id === tableId) ?? tables[0];
  const rng = state.rng as Rng | undefined;

  for (let i = 0; i < daysEff; i++) {
    // Same dawn recovery path as advance:dawn so road days regenerate spark.
    advanceToDawn(state);
    pushJuice(state, 'route.travel_step', { routeId, step: i + 1, daysEff, day: state.day });
    const entry = pickEncounter(table, rng);
    if (entry) {
      pushJuice(state, 'encounter.spawn', {
        routeId,
        encounterId: entry.id,
        blurb: entry.blurb,
        prism: entry.prism,
      });
    }
  }

  state.player.townId = dest;
  return { daysEff };
}
