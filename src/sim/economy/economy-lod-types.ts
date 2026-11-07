/** M4 Task A: dawn economy LOD shapes + B/C hook slots. Pure types. */

import type { SimState } from '../types/runtime';

/** Task B fills later — dawn may call no-op. */
export type CaravanDawnHook = (state: SimState) => void;

/** Task C fills later — broken-route / starve may notify. */
export type DoctrineSupplyHook = (
  state: SimState,
  args: { townId: string; reason: 'route_broken' | 'starve'; deltaRealDelivery: number },
) => void;

export type EconomyLodHooks = {
  caravan?: CaravanDawnHook;
  doctrine?: DoctrineSupplyHook;
};

export type EconomyLodResult = {
  moved: { routeId: string; resourceId: string; qty: number; toTownId: string }[];
  starved: string[];
};

/** Mutable per-town economy state on SimState.towns. */
export type TownEconomyState = {
  id: string;
  economyOptIn: boolean;
  stock: Record<string, number>;
  despair: number;
  /** Settlement centre in map tiles (set when the world is bound; used by borders). */
  q?: number;
  r?: number;
  /** 0..1 civic standing earned by player voice acts; absent = 0. */
  standing?: number;
  /** Set once stock has been seeded from dawn-stock on first opt-in tick. */
  economySeeded?: boolean;
  /** Running totals of what caravans really moved through this town. */
  caravanTrade?: { visits: number; received: number; sold: number; relieved: number };
};

/** Mutable route condition on SimState.economyRoutes (from world/routes.json). */
export type EconomyRouteState = {
  id: string;
  fromTownId: string;
  toTownId: string;
  days: number;
  condition: number;
  broken: boolean;
  extractive: boolean;
  receiveShare?: Record<string, number>;
  facilityIds: string[];
};

/** economy-lod.json */
export type EconomyLodTable = {
  flow: {
    skipWhenRouteBroken: boolean;
    extractiveDefaults: { city: number; village: number };
  };
  despair: {
    onRouteBroken: number;
    onStarve: number;
    maxAddPerDawn: number;
    clamp: [number, number];
    starveWhenFoodBelow: number;
    foodResourceId: string;
    doctrineRealDeliveryHitOnBroken: number;
  };
  juice: { deliver: string; starve: string; routeBreak?: string };
};

/** dawn-stock.json */
export type DawnStockTable = {
  foodResourceId: string;
  seedStockByTown: Record<string, Record<string, number>>;
  stockFloor: number;
  spoil: { apply: boolean; order: string };
  deliverJuice: string;
  starveJuice: string;
};

export type FacilityRow = {
  id: string;
  townId: string | null;
  routeId?: string;
  outputs: { resourceId: string; qtyPerDawn: number }[];
  inputs?: { resourceId: string; qtyPerDawn: number }[];
  staffedMul: number;
};

export type EconomyResourceRow = { id: string; spoilPerDawn: number };
