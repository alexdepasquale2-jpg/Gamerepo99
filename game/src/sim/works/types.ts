/**
 * The Works: a progression layer over the living world. You open yards (depots) in towns, raise
 * buildings in them, craft and cook by hand, set townsfolk to manufacturing lines, assemble vehicles
 * from parts, run convoys between your yards and into hungry towns, fill town contracts, raise and
 * feed a war band, and walk five arcs (industry, trade, war, hearth, sky) whose milestones pay renown.
 * Renown climbs the Eras, and each Era opens more of the tree. Saved on SimState.works (created lazily).
 */
export type Stock = Record<string, number>;

export type Depot = { townId: string; stock: Stock; buildings: string[]; opened: number };

export type Line = {
  id: string;
  townId: string;
  recipeId: string;
  workers: string[];
  /** 1..3: caps how many hands it can use (tuning.lineLevelCap). */
  level: number;
  on: boolean;
  /** Feed the crew a ration each dawn (half again the output). */
  fed: boolean;
  made: number;
  /** Why it stood idle at the last dawn ('' when it ran). */
  status: string;
};

export type VehicleJob = 'idle' | 'convoy' | 'band' | 'voyage';
export type Vehicle = { id: string; design: string; name: string; townId: string; mods: string[]; condition: number; job: VehicleJob; built: number };

export type RouteLeg = { dir: 'out' | 'back'; daysLeft: number; load: Stock };
export type Route = {
  id: string;
  from: string;
  to: string;
  vehicleId: string;
  /** What to load at the origin, in order, up to the vehicle's capacity (empty: every good in the yard). */
  goods: string[];
  /** haul: into your yard at the far end; sell: to the far town (coin, and relief when it is short). */
  mode: 'haul' | 'sell';
  on: boolean;
  leg?: RouteLeg;
  trips: number;
  status: string;
};

export type March = { target: string; daysLeft: number };
export type Band = { townId: string; soldiers: string[]; kit: Stock; vehicles: string[]; morale: number; march?: March; battles: number };
export type Vassal = { townId: string; since: number; feastUntil?: number };
export type Contract = { id: string; townId: string; good: string; qty: number; coin: number; due: number };
export type Voyage = { vehicleId: string; leg: number; daysLeft: number };
export type WorksNews = { day: number; text: string; who?: string; townId?: string };

export type WorksState = {
  v: 1;
  renown: number;
  /** Arc tiers met: `${arcId}:${tierIndex}` -> day. */
  claimed: Record<string, number>;
  /** Running counters the arcs read (made, produced, deliveries, trade_coin, ...). */
  stats: Record<string, number>;
  dishes: string[];
  fedTowns: string[];
  depots: Record<string, Depot>;
  lines: Line[];
  vehicles: Vehicle[];
  routes: Route[];
  band?: Band;
  vassals: Vassal[];
  contracts: Contract[];
  voyage?: Voyage;
  news: WorksNews[];
  /** Capstone boons in force (arc ids). */
  boons: string[];
  next: number;
};

export type Result = { ok: boolean; line: string; hours?: number };
