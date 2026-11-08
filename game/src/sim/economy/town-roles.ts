/**
 * A generated district town's economic role: what kind of place it is (village/town/city) and the land
 * and culture of its district. The authored economy tables (stash sites, seed stock, facilities) key rows
 * by the eight home town ids; a district town (`d<col>_<row>_t<i>`) has no row there, so those tables
 * fall back to rules keyed by role instead. Home towns have no role (null), so the home world reads only
 * the authored rows, exactly as before. Pure + deterministic.
 */
import dawnStockJson from '../../data/economy/dawn-stock.json';
import { noteUse } from '../data-use-civic';
import { districtAt, districtOfTown, type District } from '../map/districts';
import type { SettlementKind } from '../map/world-layout';

export type TownRole = { townId: string; name: string; kind: SettlementKind; land: string; culture: string; districtId: string };

type StockRoles = {
  base: Record<SettlementKind, Record<string, number>>;
  landBonus: Record<string, Record<string, number>>;
  /** The ledger food item a land's seed food arrives as (water towns eat fish, not grain). */
  landFood?: Record<string, string>;
};
const STOCK = (dawnStockJson as { seedStockByRole?: StockRoles }).seedStockByRole;

// districtAt re-places every town of a district; the economy asks per town, so keep the last few.
const CACHE = new Map<string, District>();
function districtCached(seed: number, col: number, row: number): District {
  const key = `${seed >>> 0}|${col}|${row}`;
  let d = CACHE.get(key);
  if (!d) {
    if (CACHE.size >= 16) CACHE.delete(CACHE.keys().next().value!);
    d = districtAt(seed >>> 0, col, row);
    CACHE.set(key, d);
  }
  return d;
}

/** The role of a generated district town; null for home (authored) towns and unknown ids. */
export function townRole(seed: number, townId: string): TownRole | null {
  const at = districtOfTown(townId);
  if (!at) return null;
  const d = districtCached(seed, at.col, at.row);
  const t = d.towns.find((x) => x.id === townId);
  if (!t) return null;
  return { townId, name: t.name, kind: t.kind, land: d.character.land, culture: d.character.culture, districtId: d.id };
}

/** Starting stock for a district town by its kind and land (null for home towns: authored seeds only). */
export function roleStock(seed: number, townId: string): Record<string, number> | null {
  const role = townRole(seed, townId);
  if (!role || !STOCK) return null;
  const out: Record<string, number> = { ...(STOCK.base[role.kind] ?? {}) };
  for (const [rid, n] of Object.entries(STOCK.landBonus[role.land] ?? {})) out[rid] = (out[rid] ?? 0) + n;
  return out;
}

/** A new town's opening stock was laid down: the dawn-stock rows it came from, and each resource in it. */
export function noteSeedRows(seed: number, townId: string, authored: boolean, stock: Record<string, number>): void {
  const role = townRole(seed, townId);
  if (authored) noteUse('economy/dawn-stock', `town:${townId}`);
  if (role && STOCK) {
    noteUse('economy/dawn-stock', `base:${role.kind}`);
    if (STOCK.landBonus[role.land]) noteUse('economy/dawn-stock', `land:${role.land}`);
    if (STOCK.landFood?.[role.land]) noteUse('economy/dawn-stock', `landFood:${role.land}`);
  }
  for (const [rid, q] of Object.entries(stock)) if (q > 0) noteUse('economy/economy-resources', rid);
}

/** Which ledger item a town's seeded food arrives as ('grain' unless its land says otherwise). */
export function roleFoodItem(seed: number, townId: string): string {
  const role = townRole(seed, townId);
  return (role && STOCK?.landFood?.[role.land]) || 'grain';
}
