/**
 * M4 Task A: off-screen dawn economy LOD — stock flow, spoil, starve/broken-route despair.
 * Driven only by economy-lod.json + dawn-stock.json (+ facilities/resources/routes).
 * Pure + deterministic: no Phaser/DOM/Math.random; never touches player spark.
 */

import type { DataTables } from '../load-data';
import { pushJuice } from '../packets';
import type { SimState } from '../types/runtime';
import type {
  EconomyLodHooks,
  EconomyLodResult,
  EconomyRouteState,
  TownEconomyState,
} from './economy-lod-types';

type TownRow = { id: string; economyOptIn?: boolean; stock?: Record<string, number>; despair?: number };

const noop = (): void => {};

function economyData(state: SimState): DataTables | undefined {
  const data = state.data as DataTables | undefined;
  return data?.economyLod && data.dawnStock ? data : undefined;
}

/** Lazily attach SimState.towns + SimState.economyRoutes from authored tables (idempotent). */
export function ensureEconomyState(state: SimState): void {
  const data = economyData(state);
  if (!data) return;
  if (!state.towns) {
    const towns: Record<string, TownEconomyState> = {};
    for (const row of data.towns as TownRow[]) {
      towns[row.id] = {
        id: row.id,
        economyOptIn: row.economyOptIn === true,
        stock: { ...(row.stock ?? {}) },
        despair: typeof row.despair === 'number' ? row.despair : 0,
      };
    }
    state.towns = towns;
  }
  if (!state.economyRoutes) {
    state.economyRoutes = data.economyRoutes.map((r) => ({
      ...r,
      receiveShare: r.receiveShare ? { ...r.receiveShare } : undefined,
      facilityIds: [...r.facilityIds],
    }));
  }
}

function receiveShareFor(route: EconomyRouteState, townId: string, data: DataTables): number {
  const share = route.receiveShare?.[townId];
  if (typeof share === 'number') return share;
  if (!route.extractive) return 0;
  // Extractive routes flow toward their destination (city) end.
  const d = data.economyLod.flow.extractiveDefaults;
  return townId === route.toTownId ? d.city : d.village;
}

function seedMissingStock(town: TownEconomyState, data: DataTables): void {
  if (town.economySeeded) return;
  const seed = data.dawnStock.seedStockByTown[town.id] ?? {};
  for (const [rid, qty] of Object.entries(seed)) {
    if (typeof town.stock[rid] !== 'number') town.stock[rid] = qty;
  }
  town.economySeeded = true;
}

/**
 * One dawn of economy LOD. Called from advanceToDawn after dawn hooks, before spark clamp.
 * Hooks: params override `state.economyHooks`; both default to no-ops.
 */
export function tickEconomyLod(state: SimState, hooks?: EconomyLodHooks): EconomyLodResult {
  const result: EconomyLodResult = { moved: [], starved: [] };
  const data = economyData(state);
  if (!data) return result;
  ensureEconomyState(state);

  const caravan = hooks?.caravan ?? state.economyHooks?.caravan ?? noop;
  const doctrine = hooks?.doctrine ?? state.economyHooks?.doctrine ?? noop;
  caravan(state);

  const lod = data.economyLod;
  const dawn = data.dawnStock;
  const despairCfg = lod.despair;
  const [despairMin, despairMax] = despairCfg.clamp;
  const facilitiesById = new Map(data.facilities.map((f) => [f.id, f]));
  const spoilById = new Map(data.economyResources.map((r) => [r.id, r.spoilPerDawn]));
  const foodId = despairCfg.foodResourceId ?? dawn.foodResourceId;
  const routes = state.economyRoutes ?? [];

  for (const town of Object.values(state.towns ?? {})) {
    if (town.economyOptIn !== true) continue;
    seedMissingStock(town, data);
    let despairAdd = 0;

    // 1–2. Flow along non-broken routes; broken routes add despair + notify doctrine.
    for (const route of routes) {
      if (route.fromTownId !== town.id && route.toTownId !== town.id) continue;
      if (route.broken && lod.flow.skipWhenRouteBroken) {
        despairAdd += despairCfg.onRouteBroken;
        doctrine(state, {
          townId: town.id,
          reason: 'route_broken',
          deltaRealDelivery: despairCfg.doctrineRealDeliveryHitOnBroken,
        });
        continue;
      }
      const share = receiveShareFor(route, town.id, data);
      if (share <= 0) continue;
      const produced = new Map<string, number>();
      for (const fid of route.facilityIds) {
        const fac = facilitiesById.get(fid);
        if (!fac) continue;
        for (const out of fac.outputs) {
          produced.set(out.resourceId, (produced.get(out.resourceId) ?? 0) + out.qtyPerDawn * fac.staffedMul);
        }
      }
      for (const [resourceId, base] of produced) {
        const qty = base * route.condition * share;
        if (!(qty > 0)) continue;
        town.stock[resourceId] = (town.stock[resourceId] ?? 0) + qty;
        result.moved.push({ routeId: route.id, resourceId, qty, toTownId: town.id });
        pushJuice(state, lod.juice.deliver, { townId: town.id, routeId: route.id, resourceId, qty });
      }
    }

    // 3. Spoil (after deliver, before starve).
    if (dawn.spoil.apply) {
      for (const [rid, qty] of Object.entries(town.stock)) {
        const rate = spoilById.get(rid) ?? 0;
        town.stock[rid] = Math.max(dawn.stockFloor, rate > 0 ? qty * (1 - rate) : qty);
      }
    }

    // 4. Starve.
    if ((town.stock[foodId] ?? 0) < despairCfg.starveWhenFoodBelow) {
      despairAdd += despairCfg.onStarve;
      result.starved.push(town.id);
      pushJuice(state, lod.juice.starve, { townId: town.id, food: town.stock[foodId] ?? 0 });
      doctrine(state, { townId: town.id, reason: 'starve', deltaRealDelivery: 0 });
    }

    // Mild: total despair add capped per dawn, then clamped.
    const add = Math.min(despairAdd, despairCfg.maxAddPerDawn);
    if (add > 0) {
      town.despair = Math.min(despairMax, Math.max(despairMin, town.despair + add));
    }
  }
  return result;
}
