/**
 * Facilities as real places on the roads between towns.
 *
 * Every road keeps one producer (the mill, wood camp or quarry the land it crosses supports — the same
 * output the invisible per-road producer used to give), and the world's generated facilities
 * (facilities.json picks: a named mill, a waystation, a quarry spur…) join it: one that matches the
 * road's producer lends it its name; any other stands as a second place on a road touching its town.
 * Each sits a few tiles beside its road, derived from the road geometry and seed, so positions never
 * need saving.
 *
 * Staffing (facility-workers.json): each facility has a crew, one person per worker role, dealt from
 * its road's towns. A crew member works while their flame holds; an empty slot is taken up only by
 * someone rekindled. Output scales down to `unstaffedMul` when nobody is at work.
 *
 * Working a shift is the player's day's work at one facility: its goods go to the road's towns and a
 * share comes home in the satchel; any shift lifts the spark a little, meaningful work more.
 * Pure + deterministic: no Phaser/DOM/Math.random.
 */

import workersJson from '../../data/economy/facility-workers.json';
import facilitiesJson from '../../data/economy/facilities.json';
import type { FabricWorld } from '../gen/world-types';
import type { DataTables } from '../load-data';
import { biomeAt } from '../map/terrain';
import { pointOnRoad, type LayoutRoute, type MapPoint, type WorldLayout } from '../map/world-layout';
import { WORLD_SCALE } from '../map/constants';
import { deriveRng } from '../rng';
import { addItem, itemName } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import type { FacilityRow } from './economy-lod-types';

type Worker = { id: string; role: string; shiftHours: number; sparkDrainIfHelp: number; meaningTag: string };
type KindBlock = {
  facilityKind: string;
  label?: string;
  shiftItems?: Record<string, string>;
  shiftCoin?: number;
  shiftRoadRepair?: number;
  workers: Worker[];
};
type WorkersTable = {
  staffing: { ableFlame: number; restaffFlame: number; unstaffedMul: number };
  shift: { meaningSpark: number; workSpark: number; playerShare: number };
  byKind: KindBlock[];
};
type CatalogRow = {
  id: string; name: string; kind: string;
  outputs?: { resourceId: string; qtyPerDawn: number }[];
  inputs?: { resourceId: string; qtyPerDawn: number }[];
  staffedMul?: number; workTags?: string[]; prism?: string;
};

export const FACILITY_WORKERS = workersJson as unknown as WorkersTable;
const KINDS = new Map(FACILITY_WORKERS.byKind.map((b) => [b.facilityKind, b]));
const CATALOG = new Map(((facilitiesJson as { facilities: CatalogRow[] }).facilities).map((f) => [f.id, f]));

/** A facility placed in the world. `townIds` are its road's two towns (the ones it produces for). */
export type FacilityPlace = FacilityRow & {
  name: string; kind: string; q: number; r: number; routeId: string;
  townIds: string[]; workTags: string[];
  /** True for the road's own producer (the one caravans haul from). */
  producer?: boolean;
};

/** Persisted per-facility staffing (state.facilityStaff). */
export type FacilityStaff = {
  /** One slot per worker role: a person id, or null when nobody has taken it. */
  crew: (string | null)[];
  /** Slots whose person is fit to work right now (updated each dawn). */
  staffed: number;
  idle: boolean;
  /** Day of the last idle/restaffed change, and which way it went. */
  changedDay?: number;
  change?: 'idle' | 'restaffed';
  /** Person behind the change (the one who stopped, or the one who came back). */
  by?: string;
};

const RESOURCE_KIND: Record<string, string> = { food_grain: 'mill', timber: 'lumber_camp', ore_iron: 'mine' };

/** Work tags for a kind: the first facilities.json row of that kind (mill: meaning; camp, quarry: exhaust). */
const kindTags = (kind: string): string[] =>
  [...([...CATALOG.values()].find((c) => c.kind === kind)?.workTags ?? (kind === 'mill' ? ['meaning'] : ['exhaust']))];

export const kindLabel = (kind: string): string => KINDS.get(kind)?.label ?? kind.replace(/_/g, ' ');
export const rolesFor = (kind: string): number => Math.max(1, KINDS.get(kind)?.workers.length ?? 1);

/** The resource a road's producer yields: what the land at the road's middle supports. */
function producerResource(seed: number, route: LayoutRoute): string {
  const mid = pointOnRoad(route.path, 0.5);
  const biome = biomeAt(seed, mid.q, mid.r);
  return biome === 'hills' ? 'ore_iron' : biome === 'forest' ? 'timber' : 'food_grain';
}

/** A dry tile a few tiles off the road near `progress`, side chosen by seed; tries nearby spots before giving up. */
function besideRoad(seed: number, route: LayoutRoute, progress: number, id: string): MapPoint {
  const side = deriveRng(seed, 'facility-side', id).next() < 0.5 ? -1 : 1;
  const off = Math.max(3, Math.round(0.7 * WORLD_SCALE));
  // The building's footprint (3 wide, 2 deep above its foot) must be dry ground.
  const dry = (q: number, r: number): boolean => {
    for (let dq = -1; dq <= 1; dq++) for (let dr = -1; dr <= 0; dr++) if (biomeAt(seed, q + dq, r + dr) === 'water') return false;
    return true;
  };
  let first: MapPoint | null = null;
  for (const df of [0, 0.03, -0.03, 0.06, -0.06, 0.1, -0.1, 0.15, -0.15, 0.2, -0.2]) for (const k of [1, 2, 3]) for (const s of [side, -side]) {
    const f = Math.max(0.05, Math.min(0.95, progress + df));
    const p = pointOnRoad(route.path, f);
    const a = pointOnRoad(route.path, f - 0.01), b = pointOnRoad(route.path, f + 0.01);
    const dx = b.q - a.q, dy = b.r - a.r, len = Math.hypot(dx, dy) || 1;
    const at = { q: Math.round(p.q - (dy / len) * off * k * s), r: Math.round(p.r + (dx / len) * off * k * s) };
    first ??= at;
    if (dry(at.q, at.r)) return at;
  }
  return first ?? { q: 0, r: 0 };
}

/** Resolve a facilities.json route id (route_<a>_<b>) to the generated road between the same towns. */
function generatedRoad(routes: LayoutRoute[], routeId: string | null | undefined): LayoutRoute | undefined {
  if (!routeId) return undefined;
  const exact = routes.find((r) => r.id === routeId);
  if (exact) return exact;
  const body = routeId.replace(/^route_/, '');
  return routes.find((r) => body === `${r.from}_${r.to}` || body === `${r.to}_${r.from}`);
}

/**
 * Deterministic facility places for a world: one producer per road, plus the generated facilities.
 * Same world + seed -> same ids, names and positions.
 */
export function placeFacilities(world: FabricWorld, layout: WorldLayout, seed: number): FacilityPlace[] {
  const townName = new Map((world.settlements ?? []).map((s) => [s.id, s.name]));
  // "The Reach (City Pole)" -> "The Reach": the bracket is a map note, not part of a name you'd paint on a sign.
  const nameOf = (id: string): string => (townName.get(id) ?? id).replace(/\s*\(.*\)\s*$/, '');
  const used = new Set<string>();
  const uniqueName = (options: string[]): string => {
    const n = options.find((o) => !used.has(o)) ?? `${options[0]} ${used.size + 1}`;
    used.add(n);
    return n;
  };
  const nameOptions = new Map<string, string[]>();
  const producers: FacilityPlace[] = layout.routes.map((route) => {
    const resourceId = producerResource(seed, route);
    const kind = RESOURCE_KIND[resourceId]!;
    const label = kindLabel(kind);
    const id = `producer_${route.id}`;
    nameOptions.set(id, [`${nameOf(route.from)} ${label}`, `${nameOf(route.to)} ${label}`, `${label} on the ${nameOf(route.from)} road`]);
    return {
      id, townId: null, routeId: route.id, staffedMul: 1, producer: true,
      outputs: [{ resourceId, qtyPerDawn: resourceId === 'food_grain' ? 4 : 2 }], inputs: [],
      name: '', kind, workTags: kindTags(kind),
      townIds: [route.from, route.to], ...besideRoad(seed, route, 0.5, id),
    };
  });
  const extras: FacilityPlace[] = [];
  const named = new Map<string, { name: string; id: string; workTags?: string[]; prism?: string }>();
  const extraOnRoad = new Map<string, number>();
  for (const gen of world.facilities ?? []) {
    const row = CATALOG.get(gen.id);
    const exact = generatedRoad(layout.routes, gen.routeId);
    const touching = layout.routes.filter((r) => r.id !== exact?.id && gen.townId && (r.from === gen.townId || r.to === gen.townId))
      .sort((a, b) => a.id.localeCompare(b.id));
    const candidates = exact ? [exact, ...touching] : touching;
    if (!candidates.length) continue;
    // A generated facility of the road producer's own kind is that producer, by name.
    const match = candidates.find((r) => !named.has(r.id) && producers.find((p) => p.routeId === r.id)?.kind === gen.kind);
    if (match) {
      named.set(match.id, { name: gen.name, id: gen.id, workTags: row?.workTags, prism: row?.prism });
      used.add(gen.name);
      continue;
    }
    const route = candidates.reduce((best, r) => ((extraOnRoad.get(r.id) ?? 0) < (extraOnRoad.get(best.id) ?? 0) ? r : best), candidates[0]!);
    const n = extraOnRoad.get(route.id) ?? 0;
    extraOnRoad.set(route.id, n + 1);
    // Stand nearer the facility's own town: a quarter of the way out, further along for each extra.
    const near = 0.22 + n * 0.08;
    const progress = gen.townId === route.to ? 1 - near : near;
    used.add(gen.name);
    extras.push({
      id: gen.id, townId: gen.townId ?? null, routeId: route.id,
      staffedMul: row?.staffedMul ?? 1,
      outputs: (row?.outputs ?? []).map((o) => ({ ...o })), inputs: (row?.inputs ?? []).map((o) => ({ ...o })),
      name: gen.name, kind: gen.kind, workTags: [...(row?.workTags ?? [])], prism: row?.prism,
      townIds: [route.from, route.to], ...besideRoad(seed, route, progress, gen.id),
    });
  }
  for (const p of producers) {
    const n = named.get(p.routeId);
    if (n) {
      p.id = n.id; p.name = n.name;
      if (n.workTags?.length) p.workTags = [...n.workTags];
      if (n.prism) p.prism = n.prism;
    }
  }
  for (const p of producers) if (!p.name) p.name = uniqueName(nameOptions.get(`producer_${p.routeId}`) ?? [kindLabel(p.kind)]);
  return [...producers, ...extras];
}

/** Placed facilities in this state (data.facilities rows that have a position). */
export function facilityPlaces(state: SimState | undefined): FacilityPlace[] {
  const rows = (state?.data as DataTables | undefined)?.facilities ?? [];
  return rows.filter((f): f is FacilityPlace => typeof f.q === 'number' && typeof f.r === 'number' && typeof f.name === 'string');
}

export function facilityById(state: SimState, id: string): FacilityPlace | undefined {
  return facilityPlaces(state).find((f) => f.id === id);
}

const fitToWork = (state: SimState, place: FacilityPlace, pid: string | null, flame: number): boolean => {
  const p = pid ? state.people[pid] : undefined;
  return !!p && p.flame >= flame && !!p.townId && place.townIds.includes(p.townId) && !p.tags?.includes('retired');
};

const stableKey = (seed: number, a: string, b: string): number => deriveRng(seed, 'facility-crew', a, b).next();

function pickWorker(state: SimState, place: FacilityPlace, minFlame: number, taken: Set<string>): string | null {
  let best: string | null = null, bk = Infinity;
  for (const p of Object.values(state.people)) {
    if (taken.has(p.id) || !fitToWork(state, place, p.id, minFlame)) continue;
    const k = stableKey(state.seed, place.id, p.id);
    if (k < bk || (k === bk && best !== null && p.id < best)) { bk = k; best = p.id; }
  }
  return best;
}

/**
 * Deal crews to facilities that have none yet (new game, or an older save) and forget facilities
 * this world no longer has. Crews are dealt from people fit to work, one person per role.
 */
export function ensureFacilityCrews(state: SimState): void {
  const places = facilityPlaces(state);
  if (!places.length) return;
  const staff = (state.facilityStaff ??= {});
  const ids = new Set(places.map((p) => p.id));
  for (const id of Object.keys(staff)) if (!ids.has(id)) delete staff[id];
  const taken = new Set(Object.values(staff).flatMap((s) => s.crew.filter((c): c is string => !!c)));
  const { ableFlame } = FACILITY_WORKERS.staffing;
  for (const place of places) {
    if (staff[place.id]) continue;
    const crew: (string | null)[] = [];
    for (let i = 0; i < rolesFor(place.kind); i++) {
      const pid = pickWorker(state, place, ableFlame, taken);
      if (pid) taken.add(pid);
      crew.push(pid);
    }
    const staffed = crew.filter((c) => fitToWork(state, place, c, ableFlame)).length;
    staff[place.id] = { crew, staffed, idle: staffed === 0 };
  }
}

/**
 * One dawn of staffing: crew members fit to work keep their slot; a slot whose person can't (or an
 * empty one) is taken up by someone rekindled to `restaffFlame`, if the road's towns have anyone.
 * Records idle/restaffed changes on the day they happen (for the dawn lines).
 */
export function updateFacilityStaffing(state: SimState): void {
  ensureFacilityCrews(state);
  const staff = state.facilityStaff;
  if (!staff) return;
  const { ableFlame, restaffFlame } = FACILITY_WORKERS.staffing;
  const taken = new Set(Object.values(staff).flatMap((s) => s.crew.filter((c): c is string => !!c)));
  for (const place of facilityPlaces(state)) {
    const s = staff[place.id];
    if (!s) continue;
    const roles = rolesFor(place.kind);
    while (s.crew.length < roles) s.crew.push(null);
    s.crew.length = roles;
    let newcomer: string | undefined;
    for (let i = 0; i < roles; i++) {
      if (fitToWork(state, place, s.crew[i] ?? null, ableFlame)) continue;
      const pid = pickWorker(state, place, restaffFlame, taken);
      if (!pid) continue;
      if (s.crew[i]) taken.delete(s.crew[i]!);
      s.crew[i] = pid;
      taken.add(pid);
      newcomer ??= pid;
    }
    const fit = s.crew.filter((c) => fitToWork(state, place, c, ableFlame));
    s.staffed = fit.length;
    const idle = s.staffed === 0;
    if (idle !== s.idle) {
      s.changedDay = state.day;
      s.change = idle ? 'idle' : 'restaffed';
      s.by = idle ? (s.crew.find((c) => !!c) ?? undefined) : (newcomer ?? fit[0]!);
    }
    s.idle = idle;
  }
}

/** Output multiplier from staffing: unstaffedMul with nobody at work, 1 with every role filled. */
export function staffFactor(staffed: number, roles: number): number {
  const lo = FACILITY_WORKERS.staffing.unstaffedMul;
  const f = Math.max(0, Math.min(1, staffed / Math.max(1, roles)));
  return lo + (1 - lo) * f;
}

/** Staffing multiplier for a facility id (1 when it has no staffing record, e.g. authored LOD rows). */
export function facilityStaffMul(state: SimState, facilityId: string, kind?: string): number {
  const s = state.facilityStaff?.[facilityId];
  if (!s) return 1;
  return staffFactor(s.staffed, kind ? rolesFor(kind) : s.crew.length);
}

/** Per-dawn output of a placed facility right now (base qty × staffedMul × staffing). */
export function facilityOutput(state: SimState, place: FacilityPlace): { resourceId: string; qty: number }[] {
  const mul = place.staffedMul * facilityStaffMul(state, place.id, place.kind);
  return place.outputs.map((o) => ({ resourceId: o.resourceId, qty: o.qtyPerDawn * mul }));
}

export type ShiftResult = {
  ok: boolean;
  line: string;
  /** Items put in the satchel. */
  items?: Record<string, number>;
  /** Stock added to each of the road's towns: townId -> resourceId -> qty. */
  stock?: Record<string, Record<string, number>>;
  sparkDelta?: number;
  /** Hours the shift took (the scene moves the day on by this much). */
  hours?: number;
};

const SHIFT_DAY = 'facilityShiftDay';

/** True when the player has already worked a shift today. */
export const shiftWorkedToday = (state: SimState): boolean => state.flags[SHIFT_DAY] === state.day;

function sparkMax(state: SimState): number {
  if (typeof state.player.sparkMax === 'number') return state.player.sparkMax;
  const d = ((state.data as DataTables | undefined)?.player as { defaults?: { sparkMax?: number } } | undefined)?.defaults;
  return typeof d?.sparkMax === 'number' ? d.sparkMax : 100;
}

/**
 * Work one shift at a facility: the day's work (one shift per day). The facility's goods go to its
 * road's towns (by the road's receive share) and a share comes home in the satchel; a waystation
 * shift earns coin and mends the road instead. Every shift lifts the spark a little, meaningful
 * work more. Pure: mutates state only.
 */
export function workShift(state: SimState, facilityId: string, nameOf: (townId: string) => string = (t) => t): ShiftResult {
  const place = facilityById(state, facilityId);
  if (!place) return { ok: false, line: 'There is no work here.' };
  if (shiftWorkedToday(state)) return { ok: false, line: 'You have already done a day\'s work. Rest, and come back after dawn.' };
  const block = KINDS.get(place.kind);
  const worker = block?.workers[0];
  const hours = worker?.shiftHours ?? 8;
  const route = state.economyRoutes?.find((r) => r.id === place.routeId);
  const shares = route?.receiveShare ?? Object.fromEntries(place.townIds.map((t) => [t, 1 / place.townIds.length]));
  const items: Record<string, number> = {};
  const stock: Record<string, Record<string, number>> = {};
  const { playerShare, meaningSpark, workSpark } = FACILITY_WORKERS.shift;
  for (const out of place.outputs) {
    // A full shift's worth: what the facility makes in a day with its whole crew.
    const qty = Math.max(1, Math.round(out.qtyPerDawn * place.staffedMul));
    for (const [townId, share] of Object.entries(shares)) {
      const town = state.towns?.[townId];
      if (!town || !(share > 0)) continue;
      town.stock[out.resourceId] = (town.stock[out.resourceId] ?? 0) + qty * share;
      (stock[townId] ??= {})[out.resourceId] = qty * share;
    }
    const itemId = block?.shiftItems?.[out.resourceId];
    if (itemId) items[itemId] = (items[itemId] ?? 0) + Math.max(1, Math.round(qty * playerShare));
  }
  if (block?.shiftCoin) items.coin = (items.coin ?? 0) + block.shiftCoin;
  for (const [itemId, n] of Object.entries(items)) addItem(state, itemId, n);
  let repaired = false;
  if (route && block?.shiftRoadRepair && route.condition < 1) {
    route.condition = Math.min(1, route.condition + block.shiftRoadRepair);
    repaired = true;
  }
  // A day's honest work steadies the spark a little; meaningful work (a mill, a waystation) more so.
  const before = state.player.spark;
  const lift = place.workTags.includes('meaning') ? meaningSpark : workSpark;
  state.player.spark = Math.max(before, Math.min(sparkMax(state), before + lift));
  const sparkDelta = state.player.spark - before;
  state.flags[SHIFT_DAY] = state.day;
  state.flags.facilityShiftId = place.id;

  const got = Object.entries(items).map(([id, n]) => `${n} ${itemName(id)}`).join(', ');
  const towns = Object.keys(stock).map(nameOf).join(' and ');
  const crew = state.facilityStaff?.[place.id];
  const company = crew?.idle ? ' Nobody else came to work today.' : '';
  const feel = sparkDelta >= meaningSpark ? ' Good, honest work; your spark steadies.' : sparkDelta > 0 ? ' Hard going, but it is something done.' : '';
  const road = repaired ? ' The road is a little better kept.' : '';
  const sent = towns && place.outputs.length ? ` The rest goes to ${towns}.` : '';
  const line = `You work a shift at ${place.name}${got ? `: ${got} in your satchel.` : '.'}${sent}${road}${company}${feel}`;
  return { ok: true, line, items, stock, sparkDelta, hours };
}

/** What you hear at dawn when a facility near you stopped or started again (through its people). */
export function facilityDawnLines(state: SimState): string[] {
  const staff = state.facilityStaff;
  if (!staff) return [];
  const here = state.player.townId;
  const nameOfPerson = (pid?: string): string => (pid && state.people[pid]?.name?.split(' ')[0]) || 'The crew';
  const changed = facilityPlaces(state)
    .filter((p) => staff[p.id]?.changedDay === state.day)
    .sort((a, b) => Number(!a.townIds.includes(here ?? '')) - Number(!b.townIds.includes(here ?? '')) || a.id.localeCompare(b.id));
  return changed.slice(0, 2).map((p) => {
    const s = staff[p.id]!;
    return s.change === 'idle'
      ? `${nameOfPerson(s.by)} didn't go out to ${p.name} this morning. It stands idle, and the road's towns will feel it.`
      : `${nameOfPerson(s.by)} has gone back to work at ${p.name}. It is turning again.`;
  });
}

/** Board lines: the works on this town's roads, who is at them, and what they make. */
export function facilityBoardLines(state: SimState, townId: string, nameOf: (townId: string) => string): string[] {
  const places = facilityPlaces(state).filter((p) => p.townIds.includes(townId));
  if (!places.length) return ['No works stand on our roads.'];
  const lines: string[] = ['Works on our roads', ''];
  for (const p of places) {
    const s = state.facilityStaff?.[p.id];
    const roles = rolesFor(p.kind);
    const at = s ? (s.idle ? 'standing idle' : `${s.staffed} of ${roles} at work`) : 'at work';
    const other = p.townIds.find((t) => t !== townId);
    const makes = facilityOutput(state, p).map((o) => `${Math.round(o.qty * 10) / 10} ${o.resourceId.replace(/_/g, ' ')}`).join(', ');
    lines.push(`• ${p.name} (${kindLabel(p.kind).toLowerCase()}, road to ${other ? nameOf(other) : 'nowhere'}): ${at}.${makes ? ` Makes ${makes} a day.` : ''}`);
  }
  lines.push('', 'Lend a hand: stand at a work on the road and press E to work a shift (one a day).');
  return lines;
}
