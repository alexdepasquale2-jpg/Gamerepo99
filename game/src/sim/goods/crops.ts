/**
 * Crops (data/economy/crops.json): what a farm's field grows and how far along it is today. A farm picks
 * its crop from the ground it stands on and what it backs onto (a wood's edge grows roots, wet ground
 * reeds), so the same seed always sows the same fields. The stage turns with the day, shifted per crop,
 * and gleaning takes what that stage gives. Pure and deterministic: no state is stored.
 */
import cropsJson from '../../data/economy/crops.json';
import type { Biome } from '../map/terrain';
import { noteUse } from '../data-use-world';
import { fhash } from '../map/ladder/features';

export type CropStage = { id: 'sown' | 'green' | 'ripe' | 'stubble'; name: string; from: number; glean: number; done: string };
export type CropRow = { id: string; name: string; biomeIds: string[]; resourceId: string; itemId: string; sow: number; tags: string[] };
type CropsTable = { yearDays: number; edgeTiles: number; fabric: Record<Biome, string[]>; stages: CropStage[]; crops: CropRow[] };

export const CROPS_TABLE = cropsJson as unknown as CropsTable;
export const CROPS: readonly CropRow[] = CROPS_TABLE.crops;
const BY_ID = new Map(CROPS.map((c) => [c.id, c]));
export const cropById = (id: string | undefined): CropRow | undefined => (id ? BY_ID.get(id) : undefined);

/**
 * The crop of a farm whose ground (and edges) show these coarse biomes. `roll` in [0,1) is the farm's own
 * hash. Crops of the farm's own biome come first; an edge crop (wood, water) is sown only on such a rim.
 */
export function cropForFarm(own: Biome, rim: readonly Biome[], roll: number): CropRow {
  const fabricOf = (b: Biome) => CROPS_TABLE.fabric[b] ?? [];
  const fits = (bs: readonly Biome[]) => CROPS.filter((c) => bs.some((b) => c.biomeIds.some((id) => fabricOf(b).includes(id))));
  const home = fits([own]);
  const edge = fits(rim.filter((b) => b !== own)).filter((c) => !home.includes(c));
  // A farm on the rim of a wood or a wet bottom grows that ground's crop half the time.
  const pool = edge.length && roll < 0.5 ? edge : home.length ? home : CROPS;
  const pick = pool[Math.floor((edge.length && roll < 0.5 ? roll * 2 : roll) * pool.length) % pool.length]!;
  noteUse('crops', pick.id);
  return pick;
}

/**
 * The crop of any field prop: its own (a farm's field carries it as its state), else, for a hamlet's or a
 * roadside field that was sown without one, a field crop picked by the tile so it never changes.
 */
export function fieldCrop(state: string | undefined, q: number, r: number): CropRow {
  return cropById(state) ?? cropForFarm('fields', [], fhash(0xc409, q, r, 2));
}

/** Where a crop is in its year on `day`. */
export function cropStage(crop: CropRow, day: number): CropStage {
  const Y = CROPS_TABLE.yearDays;
  const t = (((day + crop.sow) % Y) + Y) % Y;
  let cur = CROPS_TABLE.stages[0]!;
  for (const s of CROPS_TABLE.stages) if (t >= s.from) cur = s;
  noteUse('crops.stage', `${crop.id}.${cur.id}`);
  return cur;
}

/** The prompt's name for a field of this crop today ("Wheat field · ripe"). */
export const fieldLabel = (crop: CropRow, day: number): string => `${crop.name} field · ${cropStage(crop, day).name}`;
