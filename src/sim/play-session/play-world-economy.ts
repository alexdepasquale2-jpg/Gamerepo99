/** Bind the authored economy machinery to the generated world's IDs and roads.
 * Also migrates older saves; stock/despair and surviving route conditions persist. */
import type { FabricWorld } from '../gen/world-types';
import type { SimState } from '../types/runtime';
import type { DataTables } from '../load-data';
import { layoutWorld, pointOnRoad } from '../map/world-layout';
import { biomeAt } from '../map/terrain';
import { tickCaravans } from '../caravans';
import { doctrineSupplyHook } from '../doctrine-tick';
import { assignSettlementTowns } from './play-session-boot';

export function bindWorldEconomy(state: SimState, world: FabricWorld): void {
  const data = state.data as DataTables;
  const layout = layoutWorld(world, state.seed);
  const oldTowns = state.towns ?? {};
  state.towns = Object.fromEntries(layout.settlements.map((s) => {
    const old = oldTowns[s.id];
    const stock = { food_grain: 12, timber: 8, ore_iron: 4, ...data.dawnStock.seedStockByTown[s.id], ...old?.stock };
    return [s.id, { ...old, id: s.id, stock, despair: old?.despair ?? 0, economyOptIn: true, economySeeded: true }];
  }));
  const oldRoutes = new Map((state.economyRoutes ?? []).map((r) => [r.id, r]));
  // Per-road producers keep the existing condition/shortage/repair machinery;
  // no authored route with endpoints outside this world survives the binding.
  const facilities = layout.routes.map((r) => {
    const mid = pointOnRoad(r.path, 0.5);
    const biome = biomeAt(state.seed, mid.q, mid.r);
    const resourceId = biome === 'hills' ? 'ore_iron' : biome === 'forest' ? 'timber' : 'food_grain';
    return { id: `producer_${r.id}`, townId: null, routeId: r.id, staffedMul: 1,
      outputs: [{ resourceId, qtyPerDawn: resourceId === 'food_grain' ? 4 : 2 }] };
  });
  data.facilities = facilities;
  state.economyRoutes = (world.routes ?? []).map((r) => ({
    id: r.id, fromTownId: r.fromId, toTownId: r.toId, days: r.days,
    condition: oldRoutes.get(r.id)?.condition ?? 1, broken: oldRoutes.get(r.id)?.broken ?? false,
    extractive: false, receiveShare: { [r.fromId]: 0.5, [r.toId]: 0.5 }, facilityIds: [`producer_${r.id}`],
  }));
  data.caravanSchedules = state.economyRoutes.map((r, i) => ({
    id: `caravan_${r.id}`, routeId: r.id, departDawnMod: i % 3, periodDays: 3,
    cargoResourceId: facilities[i]!.outputs[0]!.resourceId, qty: 3, lean: 'good', maxConcurrent: 2,
  }));
  const schedules = new Set(data.caravanSchedules.map((s) => s.id));
  state.caravans = (state.caravans ?? []).filter((m) => schedules.has(m.scheduleId));
  state.economyHooks = { caravan: (s) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
  assignSettlementTowns(state.people, world);
}
