/**
 * Vehicles: pre-baked designs (handcart, ox wagon, war cart, steam wagon, landship, airship) that the
 * assembly yard puts together from parts; mods fitted into a design's slots change its stats. Parts and
 * whole vehicles can also be bought from the Wright's catalogue at a markup, so coin can stand in for a
 * missing line. Vehicles carry convoys, march with the band, fly voyages, or carry you down the road.
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { CATALOGUE_MUL, DESIGNS, DESIGN_BY_ID, GOODS, MOD_BY_ID, TUNING, VEHICLE_NAMES, WHOLE_MUL, goodName, goodPrice, type DesignRow } from './data';
import { addStock, bump, coinOf, depotAt, eraOf, hasBuilding, hereOf, nextId, roadDays, shortfall, take, townName, worksIfAny, worksOf } from './state';
import type { Result, Stock, Vehicle } from './types';

export type VehicleStats = { cap: number; speed: number; armor: number; fire: number; wear: number; stove: boolean; flies: boolean; engined: boolean };

export function statsOf(v: Vehicle): VehicleStats {
  const d = DESIGN_BY_ID.get(v.design)!;
  const engined = !!d.parts.engine;
  const s: VehicleStats = { cap: d.cap, speed: d.speed, armor: d.armor, fire: d.fire, wear: 1, stove: false, flies: !!d.flies, engined };
  for (const id of v.mods) {
    const m = MOD_BY_ID.get(id);
    if (!m) continue;
    s.cap += m.cap ?? 0;
    s.armor += m.armor ?? 0;
    s.fire += m.fire ?? 0;
    if (m.speed && (!m.engine || engined)) s.speed += m.speed;
    if (m.wear) s.wear *= m.wear;
    if (m.stove) s.stove = true;
  }
  // A worn vehicle is slower and weaker.
  const c = Math.max(0.4, v.condition);
  s.speed = Math.round(s.speed * (0.6 + 0.4 * c) * 100) / 100;
  s.fire = Math.round(s.fire * c);
  return s;
}

export const vehiclesIn = (state: SimState, townId: string): Vehicle[] => (worksIfAny(state)?.vehicles ?? []).filter((v) => v.townId === townId && v.job !== 'voyage');
export const vehicleById = (state: SimState, id: string): Vehicle | undefined => worksIfAny(state)?.vehicles.find((v) => v.id === id);
export const designName = (id: string): string => DESIGN_BY_ID.get(id)?.name ?? id;
export const isWarMachine = (v: Vehicle): boolean => (DESIGN_BY_ID.get(v.design)?.fire ?? 0) > 0 || v.mods.includes('gun_mount');

function nameFor(state: SimState): string {
  const used = new Set((worksIfAny(state)?.vehicles ?? []).map((v) => v.name));
  const pool = VEHICLE_NAMES.filter((n) => !used.has(n));
  const n = worksOf(state).next;
  return pool.length ? pool[(n * 7 + state.seed) % pool.length]! : `No. ${n}`;
}

function blockers(state: SimState, townId: string, d: DesignRow): string[] {
  const out: string[] = [];
  if (d.era > eraOf(state)) out.push(`the ${['', 'Hearth', 'Cart', 'Forge', 'Steam', 'Sky'][d.era]} Age`);
  if (!hasBuilding(state, townId, 'assembly') && d.id !== 'handcart') out.push('an assembly yard');
  if (d.needs && !hasBuilding(state, townId, d.needs)) out.push(`a ${d.needs.replace(/_/g, ' ')}`);
  return out;
}

export function designsView(state: SimState, townId: string): { row: DesignRow; blocked: string[]; short: string[]; price: number }[] {
  const here = hereOf(state) === townId;
  return DESIGNS.map((row) => ({ row, blocked: blockers(state, townId, row), short: shortfall(state, townId, row.parts, here), price: wholePrice(row) }));
}

function addVehicle(state: SimState, townId: string, design: string): Vehicle {
  const w = worksOf(state);
  const v: Vehicle = { id: nextId(w, 'veh'), design, name: nameFor(state), townId, mods: [], condition: 1, job: 'idle', built: state.day };
  w.vehicles.push(v);
  bump(w, 'vehicles_built');
  return v;
}

/** Put a design together from parts in the yard (and your satchel). A handcart needs no assembly yard. */
export function assemble(state: SimState, townId: string, designId: string): Result {
  const d = DESIGN_BY_ID.get(designId);
  if (!d || !depotAt(state, townId)) return { ok: false, line: 'There is no yard here to build in.' };
  const b = blockers(state, townId, d);
  if (b.length) return { ok: false, line: `A ${d.name.toLowerCase()} needs ${b.join(' and ')}.` };
  const here = hereOf(state) === townId;
  const short = shortfall(state, townId, d.parts, here);
  if (short.length) return { ok: false, line: `A ${d.name.toLowerCase()} needs ${short.join(' and ')}.` };
  take(state, townId, d.parts, here);
  const v = addVehicle(state, townId, d.id);
  return { ok: true, line: `The ${d.name.toLowerCase()} is put together. You call it ${v.name}.`, hours: 3 };
}

// ---- The Wright's catalogue ----
export const partPrice = (id: string): number => Math.ceil(goodPrice(id) * CATALOGUE_MUL);
export const wholePrice = (d: DesignRow): number => Math.ceil(Object.entries(d.parts).reduce((n, [id, q]) => n + goodPrice(id) * q, 0) * WHOLE_MUL);
/** Parts the catalogue sells in this Era: anything a design or mod of this Era uses. */
export function catalogueParts(state: SimState): string[] {
  const era = eraOf(state);
  const ids = new Set<string>();
  for (const d of DESIGNS) if (d.era <= era) for (const id of Object.keys(d.parts)) ids.add(id);
  for (const m of MOD_BY_ID.values()) if (m.era <= era) for (const id of Object.keys(m.parts)) ids.add(id);
  return GOODS.filter((g) => g.kind === 'part' && ids.has(g.id) && g.id !== 'spark_core').map((g) => g.id);
}
export function buyPart(state: SimState, townId: string, partId: string, n = 1): Result {
  if (!depotAt(state, townId)) return { ok: false, line: 'Parts are delivered to a yard. You keep none here.' };
  if (!catalogueParts(state).includes(partId)) return { ok: false, line: 'The catalogue does not list that this age.' };
  const price = partPrice(partId) * n;
  if (coinOf(state) < price) return { ok: false, line: `${n} ${goodName(partId).toLowerCase()} costs ${price} coin.` };
  addItem(state, 'coin', -price);
  addStock(state, townId, partId, n);
  bump(worksOf(state), 'bought_parts', n);
  return { ok: true, line: `A ${goodName(partId).toLowerCase()} arrives from the Wright's for ${price} coin.` };
}
export function buyWhole(state: SimState, townId: string, designId: string): Result {
  const d = DESIGN_BY_ID.get(designId);
  if (!d || !depotAt(state, townId)) return { ok: false, line: 'Vehicles are delivered to a yard. You keep none here.' };
  const b = blockers(state, townId, d).filter((x) => x !== 'an assembly yard');
  if (b.length) return { ok: false, line: `The Wright's will not sell a ${d.name.toLowerCase()} until you have ${b.join(' and ')}.` };
  const price = wholePrice(d);
  if (coinOf(state) < price) return { ok: false, line: `A ready-built ${d.name.toLowerCase()} costs ${price} coin.` };
  addItem(state, 'coin', -price);
  const v = addVehicle(state, townId, d.id);
  return { ok: true, line: `A ready-built ${d.name.toLowerCase()} rolls in from the Wright's. They painted ${v.name} on the side.` };
}

// ---- Mods and upkeep ----
export function modsFor(state: SimState, v: Vehicle): string[] {
  const era = eraOf(state);
  const engined = statsOf(v).engined;
  return [...MOD_BY_ID.values()].filter((m) => m.era <= era && !v.mods.includes(m.id) && (!m.engine || engined)).map((m) => m.id);
}
export function fitMod(state: SimState, vehicleId: string, modId: string): Result {
  const v = vehicleById(state, vehicleId);
  const m = MOD_BY_ID.get(modId);
  if (!v || !m) return { ok: false, line: 'Nothing to fit.' };
  const d = DESIGN_BY_ID.get(v.design)!;
  if (v.mods.length >= d.slots) return { ok: false, line: `${v.name} has no room for more.` };
  if (!modsFor(state, v).includes(m.id)) return { ok: false, line: `A ${m.name.toLowerCase()} won't go on ${v.name}.` };
  if (v.job !== 'idle') return { ok: false, line: `${v.name} is out working.` };
  const here = hereOf(state) === v.townId;
  const short = shortfall(state, v.townId, m.parts, here);
  if (short.length) return { ok: false, line: `A ${m.name.toLowerCase()} needs ${short.join(' and ')}.` };
  take(state, v.townId, m.parts, here);
  v.mods.push(m.id);
  return { ok: true, line: `${v.name} gets a ${m.name.toLowerCase()}.`, hours: 1 };
}
export const repairCost = (v: Vehicle): Stock => (statsOf(v).engined ? { iron: 2, plank: 2 } : { plank: 2, nails: 1 });
export function repair(state: SimState, vehicleId: string): Result {
  const v = vehicleById(state, vehicleId);
  if (!v) return { ok: false, line: 'No such vehicle.' };
  if (v.condition >= 0.99) return { ok: false, line: `${v.name} is sound.` };
  const cost = repairCost(v);
  const here = hereOf(state) === v.townId;
  const short = shortfall(state, v.townId, cost, here);
  if (short.length) return { ok: false, line: `Mending ${v.name} needs ${short.join(' and ')}.` };
  take(state, v.townId, cost, here);
  v.condition = 1;
  return { ok: true, line: `${v.name} is mended good as new.`, hours: 1 };
}
export function wear(v: Vehicle, times = 1): void {
  v.condition = Math.max(0.2, Math.round((v.condition - TUNING.wearPerTrip * statsOf(v).wear * times) * 1000) / 1000);
}

// ---- Driving yourself ----
/** Days a drive takes in this vehicle (rounded up, at least one), and its fuel. */
export function driveDays(state: SimState, v: Vehicle, to: string): number {
  const days = roadDays(state, v.townId, to);
  if (!Number.isFinite(days)) return statsOf(v).flies ? 2 : Infinity;
  return Math.max(1, Math.ceil(days / statsOf(v).speed));
}
/** Check and pay for a drive (fuel from the yard; the vehicle moves). The app then passes the days and puts you there. */
export function drive(state: SimState, vehicleId: string, to: string): Result & { days?: number } {
  const v = vehicleById(state, vehicleId);
  if (!v || v.townId !== hereOf(state)) return { ok: false, line: 'Your vehicle is not here.' };
  if (v.job !== 'idle') return { ok: false, line: `${v.name} is out working.` };
  const days = driveDays(state, v, to);
  if (!Number.isFinite(days) || to === v.townId) return { ok: false, line: 'There is no road there.' };
  const fuel = DESIGN_BY_ID.get(v.design)!.fuel;
  if (Object.keys(fuel).length && !take(state, v.townId, fuel, true)) return { ok: false, line: `${v.name} needs ${Object.entries(fuel).map(([id, n]) => `${n} ${goodName(id).toLowerCase()}`).join(' and ')} to go.` };
  wear(v);
  v.townId = to;
  bump(worksOf(state), 'drives');
  return { ok: true, line: `You take ${v.name} to ${townName(state, to)}.`, days };
}
