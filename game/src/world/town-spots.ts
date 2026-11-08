/**
 * Where each town's fixed things stand (world px, foot points), relative to the settlement's centre
 * tile, all read from the town's plan (sim/map/town-plan). Doors come via townBuildings, so actors that read the sim's
 * residency put people at the same doors the world draws.
 */
import { TILE_PX } from '../sim/map/constants';
import type { LayoutSettlement } from '../sim/map/world-layout';
import { townBuildings, type Building } from '../sim/map/interiors';
import { graveOff, townPlan, type TileOff } from '../sim/map/town-plan';
import { tileFoot, type Pt } from './depth';

export type TownSpots = {
  town: LayoutSettlement;
  centre: Pt;
  hearth: Pt;
  board: Pt;
  signpost: Pt;
  stall: Pt;
  chest: Pt;
  well: Pt;
  spawn: Pt;
  buildings: Building[];
  /** Grave n's foot (the plan's small yard beside the plaza). */
  grave(n: number): Pt;
};

const T = TILE_PX;

export function townSpots(town: LayoutSettlement): TownSpots {
  const c = tileFoot(town.q, town.r);
  const plan = townPlan(town);
  const off = (dq: number, dr: number): Pt => ({ x: Math.round(c.x + dq * T), y: Math.round(c.y + dr * T) });
  const at = (p: TileOff): Pt => off(p.q, p.r);
  return {
    town,
    centre: c,
    hearth: at(plan.hearth),
    board: at(plan.board),
    signpost: at(plan.signpost),
    stall: at(plan.stall),
    chest: at(plan.chest),
    well: at(plan.well),
    spawn: at(plan.spawn),
    buildings: townBuildings(town),
    grave: (n) => at(graveOff(plan, n)),
  };
}

/** Is a world point within a town's ground (the same box terrain-access calls inTown)? */
export const inTownBox = (town: LayoutSettlement, p: Pt): boolean =>
  Math.abs(Math.floor(p.x / T) - town.q) <= 13 && Math.abs(Math.floor((p.y - 2) / T) - town.r) <= 13;
