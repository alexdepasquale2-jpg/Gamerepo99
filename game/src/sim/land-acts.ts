/**
 * Land acts: the player changes the ground beside them. Lay stepping stones into shallow water (a
 * ford), clear brush (forest to open ground), mend a path (ground to a worked track). Each act is a
 * tile edit (saved, drawn, read by passability and the navigator), costs items and a share of the
 * day's labour, and is talked about in the nearest town the next dawn. Rules and costs come from
 * data/world/land-acts.json. Pure: no Phaser/DOM, no archetype branches.
 */
import table from '../data/world/land-acts.json';
import { addItem, hasItem, itemName, removeItem } from './goods/inventory';
import { setTileEdit } from './map/tile-edits';
import type { TerrainAccess } from './map/terrain-access';
import type { SimState } from './types/runtime';

export type LandActRow = {
  id: string; label: string; short?: string; on: string[]; becomes: string;
  cost: Record<string, number>; labour: number; yield?: Record<string, number>;
  done: string; heard: string;
};
export type LandRules = {
  labourPerDay: number; shallowReach: number; noticeRadiusTiles: number; logCap: number; clearsProps: string[]; acts: LandActRow[];
};
export type LandWorkEntry = { act: string; q: number; r: number; day: number; townId?: string; townName?: string };
export type LandWork = { day: number; used: number; log: LandWorkEntry[] };
/**
 * The terrain a land act reads: the live, edit-aware access the overworld walks on, plus (optional)
 * what is drawn there: the tile's drawn ground id and the props standing on it.
 */
export type LandView = Pick<TerrainAccess, 'biome' | 'natural' | 'edit' | 'onRoad' | 'inTown' | 'passable'> & {
  drawn?: (q: number, r: number) => { ground?: string; props: string[] };
};
export type LandTown = { id: string; q: number; r: number; name?: string };
export type LandResult = { ok: boolean; line: string; act?: string; q?: number; r?: number };

export const LAND_RULES = table as unknown as LandRules;
const ACT_BY_ID = new Map(LAND_RULES.acts.map((a) => [a.id, a]));
const CLEARS = new Set(LAND_RULES.clearsProps);

function work(state: SimState): LandWork {
  const w = (state.landWork ??= { day: state.day, used: 0, log: [] });
  if (w.day !== state.day) { w.day = state.day; w.used = 0; }
  return w;
}

/** Labour left today (refills each dawn). */
export function labourLeft(state: SimState): number {
  return Math.max(0, LAND_RULES.labourPerDay - work(state).used);
}

/** Shallow: naturally dry land within shallowReach tiles (a bank, not open lake). */
function shallow(view: LandView, q: number, r: number): boolean {
  const R = LAND_RULES.shallowReach;
  for (let dr = -R; dr <= R; dr++) for (let dq = -R; dq <= R; dq++) if (view.natural(q + dq, r + dr) !== 'water') return true;
  return false;
}

/** Which act (if any) the ground at (q,r) allows, by terrain alone (costs are checked on work). */
export function landActOn(view: LandView, q: number, r: number): LandActRow | null {
  const ground = view.biome(q, r), edited = view.edit(q, r);
  for (const a of LAND_RULES.acts) {
    if (!a.on.includes(ground) || edited === a.becomes) continue;
    if (ground === 'water') {
      if (edited === undefined && !view.passable(q, r) && shallow(view, q, r)) return a;
      continue;
    }
    if (view.inTown(q, r) || view.onRoad(q, r)) continue;
    // Streams and farm tracks are drawn over the land; a farmstead, fence or field is in the way.
    const drawn = view.drawn?.(q, r);
    if (drawn && (drawn.ground === 'stream' || drawn.ground?.startsWith('road') || drawn.props.some((p) => !CLEARS.has(p)))) return null;
    return a;
  }
  return null;
}

/** Tiles in reach, nearest first: the one faced, the one stood on, then the 4 and the diagonal neighbours. */
export function reachTiles(at: { q: number; r: number }, face: { dx: number; dy: number }): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = [];
  const add = (dq: number, dr: number) => { if (!out.some((t) => t.q === at.q + dq && t.r === at.r + dr)) out.push({ q: at.q + dq, r: at.r + dr }); };
  const fx = Math.sign(face.dx), fy = Math.sign(face.dy);
  if (fx || fy) add(fx, fy);
  add(0, 0);
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) add(dq, dr);
  return out;
}

/** Why `act` cannot be paid for right now (labour or items), or null when it can. */
function shortfall(state: SimState, act: LandActRow): string | null {
  if (LAND_RULES.labourPerDay - work(state).used < act.labour) return 'Your back is done for today. Rest, and work the land tomorrow.';
  for (const [id, n] of Object.entries(act.cost)) {
    if (!hasItem(state, id, n)) return `${act.label} needs ${costText(act.cost)}. You have ${state.inventory?.[id] ?? 0} ${itemName(id).toLowerCase()}.`;
  }
  return null;
}

/**
 * The tile in reach to work: the nearest one the player can pay for, else the nearest workable one
 * (so the refusal names what is missing). With `itemId`, only acts that use that item (F with stone selected).
 */
export function pickLandWork(state: SimState, view: LandView, at: { q: number; r: number }, face: { dx: number; dy: number }, itemId?: string): { act: LandActRow; q: number; r: number } | null {
  let first: { act: LandActRow; q: number; r: number } | null = null;
  for (const t of reachTiles(at, face)) {
    const act = landActOn(view, t.q, t.r);
    if (!act || (itemId && !((act.cost[itemId] ?? 0) > 0))) continue;
    if (!shortfall(state, act)) return { act, q: t.q, r: t.r };
    first ??= { act, q: t.q, r: t.r };
  }
  return first;
}

const costText = (cost: Record<string, number>) => Object.entries(cost).map(([id, n]) => `${n} ${itemName(id).toLowerCase()}`).join(' and ');

/** Do one act on one tile: checks the ground, labour and costs, then edits the land. */
export function workLand(state: SimState, view: LandView, actId: string, q: number, r: number, towns: LandTown[] = []): LandResult {
  const act = ACT_BY_ID.get(actId);
  if (!act) return { ok: false, line: 'Nothing to do here.' };
  if (landActOn(view, q, r)?.id !== act.id) return { ok: false, line: `You can't ${act.label.toLowerCase()} there.` };
  const short = shortfall(state, act);
  if (short) return { ok: false, line: short };
  const w = work(state);
  for (const [id, n] of Object.entries(act.cost)) removeItem(state, id, n);
  for (const [id, n] of Object.entries(act.yield ?? {})) addItem(state, id, n);
  w.used += act.labour;
  setTileEdit(state, q, r, act.becomes);
  const town = nearestTown(towns, q, r);
  w.log.push({ act: act.id, q, r, day: state.day, ...(town ? { townId: town.id, townName: town.name ?? prettyTown(town.id) } : {}) });
  if (w.log.length > LAND_RULES.logCap) w.log.splice(0, w.log.length - LAND_RULES.logCap);
  return { ok: true, line: act.done, act: act.id, q, r };
}

/** X: work whatever ground is in reach. Null when `itemId` was given and nothing in reach uses it. */
export function workLandHere(state: SimState, view: LandView, at: { q: number; r: number }, face: { dx: number; dy: number }, towns: LandTown[] = [], itemId?: string): LandResult | null {
  const pick = pickLandWork(state, view, at, face, itemId);
  if (!pick) return itemId ? null : { ok: false, line: 'Nothing here to work. Stand by shallow water, brush or open ground.' };
  return workLand(state, view, pick.act.id, pick.q, pick.r, towns);
}

function nearestTown(towns: LandTown[], q: number, r: number): LandTown | undefined {
  let best: LandTown | undefined, bd = LAND_RULES.noticeRadiusTiles;
  for (const t of towns) { const d = Math.hypot(t.q - q, t.r - r); if (d <= bd) { bd = d; best = t; } }
  return best;
}

const prettyTown = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Dawn: townsfolk talk about yesterday's work near their town (one line per town, at most two). */
export function landDawnLines(state: SimState): string[] {
  const log = state.landWork?.log ?? [];
  const byTown = new Map<string, LandWorkEntry[]>();
  for (const e of log) if (e.townId && e.day === state.day - 1) byTown.set(e.townId, [...(byTown.get(e.townId) ?? []), e]);
  const out: string[] = [];
  for (const [townId, entries] of byTown) {
    if (out.length >= 2) break;
    // Data order is notability order (stones before paths before brush).
    const act = LAND_RULES.acts.find((a) => entries.some((e) => e.act === a.id));
    if (!act) continue;
    const folk = Object.values(state.people).filter((p) => p.townId === townId).sort((a, b) => a.id.localeCompare(b.id));
    const who = folk.length ? folk[state.day % folk.length]! : undefined;
    const town = entries[0]!.townName ?? prettyTown(townId);
    const name = who ? (who.name ?? prettyTown(who.id)).split(' ')[0] : 'A traveller';
    out.push(`${name} says someone ${act.heard} outside ${town}.`);
  }
  return out;
}
