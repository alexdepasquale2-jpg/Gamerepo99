/** Bind the authored economy machinery to the generated world's IDs and roads.
 * Also migrates older saves; stock/despair and surviving route conditions persist. */
import type { FabricWorld } from '../gen/world-types';
import type { SimState } from '../types/runtime';
import type { DataTables } from '../load-data';
import { layoutWorld } from '../map/world-layout';
import { ensureFacilityCrews, placeFacilities } from '../economy/facilities';
import { placeRoadsideInns } from '../economy/waystations';
import { tickCaravans } from '../caravans';
import { doctrineSupplyHook } from '../doctrine-tick';
import { assignSettlementTowns } from './play-session-boot';
import { FOOD_RES } from '../economy/food-stock';
import { supplyTown } from '../economy/village-economy';

export function bindWorldEconomy(state: SimState, world: FabricWorld): void {
  const data = state.data as DataTables;
  const layout = layoutWorld(world, state.seed);
  const oldTowns = state.towns ?? {};
  state.towns = Object.fromEntries(layout.settlements.map((s) => {
    const old = oldTowns[s.id];
    const stock: Record<string, number> = { food_grain: 12, timber: 8, ore_iron: 4, ...data.dawnStock.seedStockByTown[s.id], ...old?.stock };
    // One food stock (F6): a new town's food seed, or an older save's food_grain, moves into the village
    // ledger once; town.stock never holds food again.
    const food = old ? (old.stock?.[FOOD_RES] ?? 0) : (stock[FOOD_RES] ?? 0);
    delete stock[FOOD_RES];
    if (food > 0) supplyTown(state, s.id, 'grain', food);
    return [s.id, { ...old, id: s.id, q: s.q, r: s.r, stock, despair: old?.despair ?? 0, economyOptIn: true, economySeeded: true }];
  }));
  const oldRoutes = new Map((state.economyRoutes ?? []).map((r) => [r.id, r]));
  // Facilities are real places beside the roads: one producer per road (mill / wood camp / quarry, the
  // same output the old invisible producer gave) plus the world's generated facilities. Positions are
  // derived from seed + road geometry; crews persist in state.facilityStaff.
  const facilities = placeFacilities(world, layout, state.seed);
  facilities.push(...placeRoadsideInns(layout, state.seed, facilities));
  data.facilities = facilities;
  const producerOf = new Map(facilities.filter((f) => f.producer).map((f) => [f.routeId, f]));
  state.economyRoutes = (world.routes ?? []).map((r) => ({
    id: r.id, fromTownId: r.fromId, toTownId: r.toId, days: r.days,
    condition: oldRoutes.get(r.id)?.condition ?? 1, broken: oldRoutes.get(r.id)?.broken ?? false,
    extractive: false, receiveShare: { [r.fromId]: 0.5, [r.toId]: 0.5 },
    facilityIds: facilities.filter((f) => f.routeId === r.id).map((f) => f.id),
  }));
  data.caravanSchedules = state.economyRoutes.map((r, i) => ({
    id: `caravan_${r.id}`, routeId: r.id, departDawnMod: i % 3, periodDays: 3,
    cargoResourceId: producerOf.get(r.id)?.outputs[0]?.resourceId ?? 'food_grain', qty: 3, lean: 'good', maxConcurrent: 2,
  }));
  const schedules = new Set(data.caravanSchedules.map((s) => s.id));
  state.caravans = (state.caravans ?? []).filter((m) => schedules.has(m.scheduleId));
  state.economyHooks = { caravan: (s) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
  assignSettlementTowns(state.people, world);
  ensureFacilityCrews(state);
  if (!state.flags.caravansStarted) {
    tickCaravans(state, state.day);
    state.flags.caravansStarted = true;
  }
}
