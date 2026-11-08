/** Travel route / encounter shapes shared by travel + travel-tables. */

import type { SimState } from '../types/runtime';

export type TravelRoute = {
  id: string;
  fromId: string;
  toId: string;
  days: number;
  biomeIds?: string[];
  encounterTableId?: string;
};

export type EncounterEntry = {
  id: string;
  weight: number;
  blurb?: string;
  prism?: string;
  /** notoriety.json attractor id: weight grows with notoriety (>= its minNotoriety). */
  attractorId?: string;
  /** Authored effects (road-encounters.json): player.spark, town.stock.*, town.despair, route.condition apply on a journey. */
  effects?: EncounterEffect[];
  tags?: string[];
  quiet?: boolean;
  /** What someone at the far end says about it when you arrive. */
  heard?: string;
};

export type EncounterEffect = { target: string; op: string; value: number; townId?: string; routeId?: string };

export type EncounterTable = {
  id: string;
  entries: EncounterEntry[];
};

export type TravelSimState = SimState & {
  routes?: TravelRoute[];
  encounterTables?: EncounterTable[];
  biomeTerrainMuls?: Record<string, number>;
  sizeTravelMuls?: Record<string, number>;
  /** Road memory (journey.ts): who cheated you, how many journeys. Optional; old saves have none. */
  road?: import('./road-trades').RoadMemory;
};
