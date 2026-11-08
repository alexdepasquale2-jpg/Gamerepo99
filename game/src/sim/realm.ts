/**
 * The realm in play: which district is live, and what the others are while you are away. Only the active
 * district runs the full sim (people, economy, doctrines, happenings, the chronicle). When you leave one:
 *   - it is frozen whole (its share of SimState, as a save would write it) for the last FROZEN_KEEP visited;
 *   - every district you have been to keeps a small summary (despair, share lit, people, the day you left);
 *   - one you have never seen is only its seed (sim/map/districts).
 * Coming back to a frozen district thaws it and catches it up in one step for the days you were gone;
 * an older one is rebuilt from the seed with its summary laid back on. What is yours travels with you:
 * the player, satchel, coin, day, the hoard, legacy and patron deals, letters, flags and tile edits.
 * Pure over SimState (no Phaser/DOM).
 */
import { generateWorld } from './fabric/fabric-bake';
import type { FabricWorld } from './gen/world';
import type { DataTables } from './load-data';
import { DISTRICTS, districtAt, districtBox, districtId, districtOfTown, isHome, neighbours } from './map/districts';
import { CHRONICLE_TAG } from './chronicle';
import { deriveRng } from './rng';
import { catchUpDistrict } from './civic/clock';
import type { SaveBlob } from './save';
import type { PacketState, SimState } from './types/runtime';
import type { Flight, Pending } from './letters-scale';
import type { LetterReply } from './letter-replies';
import type { DistrictPolity } from './civic/district-relations';

export type DistrictRef = { col: number; row: number };
/** `lastTick` is the last dawn the away-tick drifted it (sim/realm-away); catch-up counts from there. */
export type DistrictSummary = { despair: number; lit: number; people: number; day: number; lastTick?: number };
export type FrozenDistrict = { day: number; blob: SaveBlob };
export type RealmState = {
  active: DistrictRef;
  frozen: Record<string, FrozenDistrict>;
  summaries: Record<string, DistrictSummary>;
  /** District ids most recently left first (decides which stay frozen whole). */
  recent: string[];
  /** Mail and news addressed to a district you are not in, applied when you next arrive (sim/realm-away). */
  inbox?: Record<string, InboxItem[]>;
  /** Districts as polities: leaders, and peace / pact / war per neighbouring pair (sim/civic/district-relations). Lazy. */
  polity?: DistrictPolity;
};
/** `due` is the day it would have landed; anything still on the road when you arrive goes back in flight. */
export type InboxItem =
  | { t: 'letter'; due: number; flight: Flight }
  | { t: 'packet'; due: number; packet: PacketState }
  | { t: 'pending'; pending: Pending }
  | { t: 'reply'; due: number; reply: LetterReply };

/** Districts kept whole after you leave (the rest fold to a summary). */
export const FROZEN_KEEP = 3;
/** Sim keys that belong to the player and travel with them; everything else belongs to the district. */
export const CARRIED_KEYS = ['player', 'inventory', 'itemInstances', 'day', 'flags', 'letters', 'cargo', 'legendTalk', 'bodyActs', 'tileEdits', 'worldNodes', 'realm', 'seed'] as const;
/** Top-level save fields that are the player's (unspoken stays with the district's people). */
export const CARRIED_TOP = ['hoard', 'legacy', 'patronDeals'] as const;
/** Tiles of road a trunk-road day covers (a made road between seats: faster than a village track). */
export const TRUNK_TILES_PER_DAY = 1500;

export const homeRef = (): DistrictRef => ({ col: DISTRICTS.grid.homeCol, row: DISTRICTS.grid.homeRow });
export const refId = (d: DistrictRef): string => districtId(d.col, d.row);
/** The realm if this state has one yet (a game that never left home has none). */
export const realmIfAny = (state: SimState | undefined): RealmState | undefined => (state as (SimState & { realm?: RealmState }) | undefined)?.realm;
export const realmOf = (state: SimState): RealmState =>
  ((state as SimState & { realm?: RealmState }).realm ??= { active: homeRef(), frozen: {}, summaries: {}, recent: [] });
export const activeDistrict = (state: SimState | undefined): DistrictRef => realmIfAny(state)?.active ?? homeRef();

/** The district a town is in (authored home towns carry no district in their id). */
export const districtOfTownRef = (townId: string): DistrictRef => districtOfTown(townId) ?? homeRef();
export function inboxOf(state: SimState, id: string): InboxItem[] {
  return ((realmOf(state).inbox ??= {})[id] ??= []);
}

/** The generated world of a district (the home district is the world the game always made). */
export function worldFor(seed: number, d: DistrictRef = homeRef()): FabricWorld {
  return generateWorld({ seed, includeAnchors: true, peopleCount: 60, ...(isHome(d.col, d.row) ? {} : { district: d }) });
}

/** Where you arrive in a district: its seat (home: your home hearth when it is there). */
export function arrivalTown(world: FabricWorld, d: DistrictRef, homeTownId?: string): string | undefined {
  const ids = (world.settlements ?? []).map((s) => s.id);
  if (isHome(d.col, d.row) && homeTownId && ids.includes(homeTownId)) return homeTownId;
  return ids[0];
}

/** How a district stands right now (its live towns and people). */
export function summarize(state: SimState): DistrictSummary {
  const towns = Object.values(state.towns ?? {}) as { despair?: number }[];
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  const folk = Object.values(state.people).filter((p) => !p.tags?.includes('retired'));
  return {
    despair: towns.length ? towns.reduce((a, t) => a + (t.despair ?? 0), 0) / towns.length : 0.3,
    lit: folk.length ? folk.filter((p) => p.flame >= burnAt).length / folk.length : 0,
    people: folk.length,
    day: state.day,
  };
}

/** A district's save blob with the player's parts taken out (they travel on) and its chronicle kept. */
export function freezeBlob(blob: SaveBlob, state: SimState): SaveBlob {
  const sim = { ...(blob.sim ?? {}) };
  for (const k of CARRIED_KEYS) delete sim[k];
  sim.chronicle = (state.history ?? []).filter((h) => h.tags?.includes(CHRONICLE_TAG));
  const out: SaveBlob = { ...blob, sim };
  for (const k of CARRIED_TOP) delete (out as Record<string, unknown>)[k];
  return out;
}

/** Lay the player's parts from `from` onto a district blob (frozen or fresh), ready for loadState. */
export function withCarried(blob: SaveBlob, from: SaveBlob): SaveBlob {
  const sim = { ...(blob.sim ?? {}) };
  for (const k of CARRIED_KEYS) if (from.sim && k in from.sim) sim[k] = from.sim[k];
  const out: SaveBlob = { ...blob, sim, tick: from.tick, coin: from.coin };
  for (const k of CARRIED_TOP) (out as Record<string, unknown>)[k] = (from as Record<string, unknown>)[k];
  return out;
}

/**
 * Days away, in one step: the district lives them on the LOD day (civic/lod via civic/clock): its people
 * age, die, pair and have children, its stores fill and empty, despair follows neglect, hunger and flame,
 * its doctrines tick. The calendar (the player's) is already on today; the district is run up to it.
 */
export function catchUp(state: SimState, days: number): void {
  if (days > 0) catchUpDistrict(state, state.day - days);
}

/** One town's (or a whole away district's) despair after `days` of the dawn's neglect and flame relief. */
export function driftDespair(state: SimState, despair: number, lit: number, days: number): number {
  const cfg = (state.data as DataTables | undefined)?.economyLod as { despair?: { neglect?: { onNeglect: number; neglectCap: number }; flameRelief?: { perDawn: number } } } | undefined;
  const neg = cfg?.despair?.neglect, relief = cfg?.despair?.flameRelief;
  const perDay = (neg?.onNeglect ?? 0.01) - (relief?.perDawn ?? 0.025) * lit;
  const cap = neg?.neglectCap ?? 0.6;
  if (perDay > 0) return despair < cap ? Math.min(cap, despair + perDay * days) : despair;
  return Math.max(0, despair + perDay * days);
}

/** A never-seen district's first look: its towns carry the district's despair (a little each way). */
export function settleFresh(state: SimState, d: DistrictRef): void {
  if (isHome(d.col, d.row)) return;
  const dist = districtAt(state.seed, d.col, d.row);
  for (const [id, t] of Object.entries(state.towns ?? {}) as [string, { despair: number }][]) {
    const wobble = deriveRng(state.seed, 'district-town-despair', id).next() - 0.5;
    t.despair = Math.min(0.9, Math.max(0.05, dist.despair + wobble * 0.2));
  }
}

/** Trunk roads out of a district: one to each neighbour, seat to seat, with days on the road. */
export function trunkRoads(seed: number, from: DistrictRef): { to: DistrictRef; id: string; name: string; days: number; despair: number }[] {
  const seatOf = (d: DistrictRef): { q: number; r: number } => {
    if (isHome(d.col, d.row)) { const b = districtBox(d.col, d.row); return { q: (b.q0 + b.q1) / 2, r: (b.r0 + b.r1) / 2 }; }
    const t = districtAt(seed, d.col, d.row).towns[0];
    const b = districtBox(d.col, d.row);
    return t ?? { q: (b.q0 + b.q1) / 2, r: (b.r0 + b.r1) / 2 };
  };
  const a = seatOf(from);
  return neighbours(from.col, from.row).map((to) => {
    const dist = districtAt(seed, to.col, to.row), b = seatOf(to);
    return { to, id: dist.id, name: dist.name, days: Math.max(2, Math.ceil(Math.hypot(b.q - a.q, b.r - a.r) / TRUNK_TILES_PER_DAY)), despair: dist.despair };
  });
}

const DAYS_MEMO = new Map<string, number>();
/**
 * Days for mail between two districts: the trunk roads, hop by hop (each hop steps toward the target).
 * Same district: 0 (the caller uses its own town-to-town roads).
 */
export function districtDays(seed: number, a: DistrictRef, b: DistrictRef): number {
  const key = `${seed}:${refId(a)}:${refId(b)}`;
  const hit = DAYS_MEMO.get(key);
  if (hit !== undefined) return hit;
  let cur = a, days = 0;
  for (let guard = 0; guard < 64 && (cur.col !== b.col || cur.row !== b.row); guard++) {
    const gap = (d: DistrictRef) => Math.abs(d.col - b.col) + Math.abs(d.row - b.row);
    const hop = trunkRoads(seed, cur).sort((x, y) => gap(x.to) - gap(y.to) || x.days - y.days)[0];
    if (!hop) break;
    days += hop.days;
    cur = hop.to;
  }
  DAYS_MEMO.set(key, days);
  return days;
}

/** Note a district as left: summary always, frozen whole if among the most recent. */
export function noteLeft(realm: RealmState, id: string, summary: DistrictSummary, frozen: FrozenDistrict): void {
  realm.summaries[id] = summary;
  realm.frozen[id] = frozen;
  realm.recent = [id, ...realm.recent.filter((x) => x !== id)];
  for (const old of realm.recent.slice(FROZEN_KEEP)) delete realm.frozen[old];
}
