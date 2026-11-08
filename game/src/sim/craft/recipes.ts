/**
 * Crafting recipes (data/items/recipes.json) and the stations they are made at. A recipe has the shape of
 * a village job's recipe ({in, out}) so the same goods flow by hand as by trade; the station says where,
 * and an optional tool must be carried (kept). Pure: no Phaser/DOM, no state.
 */
import table from '../../data/items/recipes.json';

export type StationId = 'hearth' | 'workbench' | 'forge';
export type StationRow = {
  name: string;
  /** The ring verb's full label at this station. */
  label: string;
  /** Every town hearth is this station. */
  hearth?: boolean;
  /** Facility kinds (economy/facilities.json) that keep one. */
  facilities?: string[];
  /** Building ids (items/buildings.json) of the player's own built workshops that keep one. */
  buildings?: string[];
};
export type Recipe = {
  id: string; label: string; short: string; station: StationId;
  in: Record<string, number>; out: Record<string, number>;
  /** Any one of these items must be carried (kept, not spent). */
  tool?: string[];
  /** Hours the work takes (default 1). */
  hours?: number;
};

type RecipeTable = { stations: Record<StationId, StationRow>; recipes: Recipe[] };
const T = table as unknown as RecipeTable;

export const STATIONS: Readonly<Record<StationId, StationRow>> = T.stations;
export const STATION_IDS = Object.keys(T.stations) as StationId[];
export const RECIPES: readonly Recipe[] = T.recipes;
const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const recipeById = (id: string): Recipe | undefined => BY_ID.get(id);
export const recipesAt = (station: StationId): Recipe[] => RECIPES.filter((r) => r.station === station);
export const recipeHours = (r: Recipe): number => r.hours ?? 1;

/** The station a facility of this kind keeps, if any. */
export const stationForFacility = (kind: string): StationId | undefined =>
  STATION_IDS.find((s) => STATIONS[s].facilities?.includes(kind));
/** The station one of your built workshops keeps, if any. */
export const stationForBuilding = (buildingId: string): StationId | undefined =>
  STATION_IDS.find((s) => STATIONS[s].buildings?.includes(buildingId));
