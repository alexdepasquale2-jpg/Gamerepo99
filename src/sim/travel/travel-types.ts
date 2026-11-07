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
};

export type EncounterTable = {
  id: string;
  entries: EncounterEntry[];
};

export type TravelSimState = SimState & {
  routes?: TravelRoute[];
  encounterTables?: EncounterTable[];
  biomeTerrainMuls?: Record<string, number>;
  sizeTravelMuls?: Record<string, number>;
};
