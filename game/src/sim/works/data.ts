/** The Works' tables (data/works/*.json) and lookups. Pure: no state. */
import arcsJson from '../../data/works/arcs.json';
import buildingsJson from '../../data/works/buildings.json';
import goodsJson from '../../data/works/goods.json';
import recipesJson from '../../data/works/recipes.json';
import vehiclesJson from '../../data/works/vehicles.json';
import { ITEM_BY_ID } from '../goods/inventory';
import type { Stock } from './types';

export type GoodRow = { id: string; name: string; kind: 'material' | 'part' | 'arms' | 'fuel' | 'meal' | 'project'; price: number; meal?: { spark: number; ration?: boolean } };
export type BuildingRow = { id: string; name: string; era: number; cost: Stock; coin: number; lines: number; blurb: string };
export type RecipeRow = { id: string; label: string; at: string; in?: Stock; out: Stock; era?: number; hours?: number; line?: boolean; spark?: number };
export type DesignRow = { id: string; name: string; era: number; parts: Stock; cap: number; speed: number; armor: number; fire: number; fuel: Stock; slots: number; flies?: boolean; needs?: string; blurb: string };
export type ModRow = { id: string; name: string; era: number; parts: Stock; cap?: number; armor?: number; fire?: number; speed?: number; wear?: number; stove?: boolean; engine?: boolean; blurb: string };
export type TierRow = { label: string; stat: string; n: number; renown: number; coin: number };
export type ArcRow = { id: string; name: string; role: string; blurb: string; boon: string; tiers: TierRow[] };
export type EraRow = { era: number; name: string; renown: number; depots: number };
export type Tuning = {
  depotCoin: number; wage: number; renownPerContract: number; renownPerVictory: number;
  lineLevelCap: number[]; lineUpgrade: Stock[]; fedBonus: number;
  raidBase: number; raidPerArmor: number; wearPerTrip: number;
  enlistCoin: number; bandMax: number[]; desertBelow: number;
  conquestDespair: number; revoltDespair: number; revoltOdds: number; tributeCoin: number;
  feastPlatters: number; feastDespair: number; feastFlame: number; reliefDespair: number;
  voyageDays: number; voyageRations: number; voyageFuel: number;
  contractsMax: number; contractDays: number;
};
export type VoyageRow = { name: string; coin: number; line: string };

export const GOODS = (goodsJson as unknown as { goods: GoodRow[] }).goods;
export const BUILDINGS = (buildingsJson as unknown as { buildings: BuildingRow[] }).buildings;
export const RECIPES = (recipesJson as unknown as { recipes: RecipeRow[] }).recipes;
const V = vehiclesJson as unknown as { catalogueMul: number; wholeMul: number; designs: DesignRow[]; mods: ModRow[]; names: string[] };
export const DESIGNS = V.designs;
export const MODS = V.mods;
export const VEHICLE_NAMES = V.names;
export const CATALOGUE_MUL = V.catalogueMul;
export const WHOLE_MUL = V.wholeMul;
const A = arcsJson as unknown as { eras: EraRow[]; arcs: ArcRow[]; tuning: Tuning; voyages: VoyageRow[] };
export const ERAS = A.eras;
export const ARCS = A.arcs;
export const TUNING = A.tuning;
export const VOYAGES = A.voyages;

const GOOD_BY_ID = new Map(GOODS.map((g) => [g.id, g]));
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
export const DESIGN_BY_ID = new Map(DESIGNS.map((d) => [d.id, d]));
export const MOD_BY_ID = new Map(MODS.map((m) => [m.id, m]));

export const goodRow = (id: string): GoodRow | undefined => GOOD_BY_ID.get(id);
export const goodName = (id: string): string => GOOD_BY_ID.get(id)?.name ?? ITEM_BY_ID.get(id)?.name ?? id.replace(/_/g, ' ');
export const goodPrice = (id: string): number => GOOD_BY_ID.get(id)?.price ?? ITEM_BY_ID.get(id)?.price ?? 1;
/** A works good (not a satchel item): lives only in yards. */
export const isWorksGood = (id: string): boolean => GOOD_BY_ID.has(id);
/** Food a crew or soldier can eat for a dawn: rations, hardtack, porridge, stew, and plain satchel food. */
const PLAIN_FOOD = ['bread', 'fish', 'berries'];
export const isRation = (id: string): boolean => !!GOOD_BY_ID.get(id)?.meal?.ration || PLAIN_FOOD.includes(id);
export const isMeal = (id: string): boolean => !!GOOD_BY_ID.get(id)?.meal;
export const recipeEra = (r: RecipeRow): number => r.era ?? BUILDING_BY_ID.get(r.at)?.era ?? 1;
export const recipeHours = (r: RecipeRow): number => r.hours ?? 1;

export const stockText = (s: Stock): string =>
  Object.entries(s).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${goodName(id).toLowerCase()}`).join(', ') || 'nothing';
export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
