/**
 * Where each town's fixed things stand (world px, foot points), relative to the settlement's centre
 * tile. Buildings and doors come from sim/map/interiors (townBuildings), so actors that read the sim's
 * residency put people at the same doors the world draws.
 */
import { TILE_PX } from '../sim/map/constants';
import type { LayoutSettlement } from '../sim/map/world-layout';
import { townBuildings, type Building } from '../sim/map/interiors';
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
  /** Grave n's foot (a small yard east of the centre). */
  grave(n: number): Pt;
};

const T = TILE_PX;

export function townSpots(town: LayoutSettlement): TownSpots {
  const c = tileFoot(town.q, town.r);
  const off = (dq: number, dr: number): Pt => ({ x: Math.round(c.x + dq * T), y: Math.round(c.y + dr * T) });
  return {
    town,
    centre: c,
    hearth: off(1.6, 2.1),
    board: off(-3.5, 3.2),
    signpost: off(3.5, 3.2),
    stall: off(-2.2, 2.6),
    chest: off(0.3, 0.6),
    well: off(-1.7, 1.6),
    spawn: off(0, 2),
    buildings: townBuildings(town),
    grave: (n) => off(7.2 + (n % 4) * 0.9, 3.6 + Math.floor(n / 4) * 0.8),
  };
}

/** Is a world point within a town's ground (the same box terrain-access calls inTown)? */
export const inTownBox = (town: LayoutSettlement, p: Pt): boolean =>
  Math.abs(Math.floor(p.x / T) - town.q) <= 13 && Math.abs(Math.floor((p.y - 2) / T) - town.r) <= 13;
