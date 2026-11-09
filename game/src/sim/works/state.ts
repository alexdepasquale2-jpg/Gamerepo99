/**
 * The Works' saved state and the helpers every Works system shares: Eras, yards (depots) and their
 * stock, who in a town is free to work or fight, the road graph between towns, and news told at dawn.
 * Pure + deterministic: no Phaser/DOM, no Math.random.
 */
import { companyOf } from '../economy/companies';
import { addItem, inventoryOf } from '../goods/inventory';
import { prettyTownId } from '../map/districts';
import { firstNameOf } from '../names';
import type { SimState } from '../types/runtime';
import { ERAS, TUNING, goodName, isWorksGood, type EraRow } from './data';
import type { Depot, Result, Stock, WorksState } from './types';

export function worksOf(state: SimState): WorksState {
  const s = state as SimState & { works?: WorksState };
  return (s.works ??= {
    v: 1, renown: 0, claimed: {}, stats: {}, dishes: [], fedTowns: [], depots: {}, lines: [], vehicles: [],
    routes: [], vassals: [], contracts: [], news: [], boons: [], next: 1,
  });
}
/** Read without creating (null before you ever touch the Works). */
export const worksIfAny = (state: SimState): WorksState | undefined => (state as SimState & { works?: WorksState }).works;

export const nextId = (w: WorksState, prefix: string): string => `${prefix}${w.next++}`;
export const bump = (w: WorksState, stat: string, n = 1): void => { w.stats[stat] = (w.stats[stat] ?? 0) + n; };

// ---- Eras ----
export function eraRow(state: SimState): EraRow {
  const r = worksIfAny(state)?.renown ?? 0;
  return [...ERAS].reverse().find((e) => r >= e.renown) ?? ERAS[0]!;
}
export const eraOf = (state: SimState): number => eraRow(state).era;
export const nextEra = (state: SimState): EraRow | undefined => ERAS.find((e) => e.era === eraOf(state) + 1);
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// ---- Towns and names ----
export function townName(state: SimState, id: string | undefined): string {
  if (!id) return 'nowhere';
  const row = ((state.data as { towns?: { id: string; name?: string }[] } | undefined)?.towns ?? []).find((t) => t.id === id);
  return (row?.name ?? prettyTownId(id)).replace(/\s*\(.*\)\s*$/, '');
}
export const personFirst = (state: SimState, id: string): string => firstNameOf(state.people[id]?.name ?? id) ?? id;
export const knownTowns = (state: SimState): string[] => Object.keys(state.towns ?? {}).sort();
export const hereOf = (state: SimState): string => state.player.townId ?? '';

/** Shortest road days between two towns over the open roads (Infinity when cut off). */
export function roadDays(state: SimState, from: string, to: string): number {
  if (from === to) return 0;
  const routes = (state.economyRoutes ?? []).filter((r) => !r.broken);
  const dist = new Map<string, number>([[from, 0]]);
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist.get(a)! - dist.get(b)! || a.localeCompare(b));
    const at = open.shift()!;
    if (at === to) return dist.get(at)!;
    for (const r of routes) {
      const nb = r.fromTownId === at ? r.toTownId : r.toTownId === at ? r.fromTownId : null;
      if (!nb) continue;
      const d = dist.get(at)! + Math.max(1, r.days);
      if (d < (dist.get(nb) ?? Infinity)) { dist.set(nb, d); open.push(nb); }
    }
  }
  return Infinity;
}
/** Towns reachable by road from here (excluding here), nearest first. */
export function reachable(state: SimState, from: string): { townId: string; days: number }[] {
  return knownTowns(state).filter((t) => t !== from).map((townId) => ({ townId, days: roadDays(state, from, townId) }))
    .filter((t) => Number.isFinite(t.days)).sort((a, b) => a.days - b.days || a.townId.localeCompare(b.townId));
}

// ---- Yards (depots) ----
export const depotAt = (state: SimState, townId: string): Depot | undefined => worksIfAny(state)?.depots[townId];
export const depotCount = (state: SimState): number => Object.keys(worksIfAny(state)?.depots ?? {}).length;
export const depotCap = (state: SimState): number => eraRow(state).depots;
export const hasBuilding = (state: SimState, townId: string, b: string): boolean => !!depotAt(state, townId)?.buildings.includes(b);
export const anyBuilding = (state: SimState, b: string): boolean => Object.values(worksIfAny(state)?.depots ?? {}).some((d) => d.buildings.includes(b));

export function openDepot(state: SimState, townId: string): Result {
  const w = worksOf(state);
  if (!townId || !state.towns?.[townId]) return { ok: false, line: 'There is no town here to keep a yard in.' };
  if (w.depots[townId]) return { ok: false, line: 'You already keep a yard here.' };
  if (depotCount(state) >= depotCap(state)) return { ok: false, line: `The ${eraRow(state).name} lets you keep ${depotCap(state)} yard${depotCap(state) === 1 ? '' : 's'}. Earn renown for more.` };
  const first = depotCount(state) === 0;
  const coin = first ? 0 : TUNING.depotCoin;
  if (coinOf(state) < coin) return { ok: false, line: `A yard here costs ${coin} coin.` };
  if (coin) addItem(state, 'coin', -coin);
  w.depots[townId] = { townId, stock: {}, buildings: [], opened: state.day };
  bump(w, 'depots_opened');
  return { ok: true, line: first ? `You take on a yard in ${townName(state, townId)}. Everything starts somewhere.` : `You rent a yard in ${townName(state, townId)} for ${coin} coin.` };
}

export const coinOf = (state: SimState): number => inventoryOf(state).coin ?? 0;
export const stockOf = (state: SimState, townId: string): Stock => depotAt(state, townId)?.stock ?? {};
export function addStock(state: SimState, townId: string, id: string, n: number): void {
  const d = depotAt(state, townId);
  if (!d || !n) return;
  d.stock[id] = (d.stock[id] ?? 0) + n;
  if (d.stock[id]! <= 0) delete d.stock[id];
}

/**
 * What you can draw on in a town: the yard's stock, plus your satchel when you stand there. `take` spends
 * from the yard first, then the satchel. Returns the shortfall ("2 more iron bar") or [] when it all fits.
 */
export function shortfall(state: SimState, townId: string, need: Stock, satchel: boolean, times = 1): string[] {
  const yard = stockOf(state, townId);
  const inv = satchel ? inventoryOf(state) : {};
  const out: string[] = [];
  for (const [id, n] of Object.entries(need)) {
    const have = (yard[id] ?? 0) + (id === 'coin' ? 0 : inv[id] ?? 0);
    if (have < n * times) out.push(`${n * times - have} more ${goodName(id).toLowerCase()}`);
  }
  return out;
}
export function take(state: SimState, townId: string, need: Stock, satchel: boolean, times = 1): boolean {
  if (shortfall(state, townId, need, satchel, times).length) return false;
  for (const [id, n0] of Object.entries(need)) {
    let n = n0 * times;
    const fromYard = Math.min(n, stockOf(state, townId)[id] ?? 0);
    if (fromYard) { addStock(state, townId, id, -fromYard); n -= fromYard; }
    if (n > 0 && satchel) addItem(state, id, -n);
  }
  return true;
}
export function give(state: SimState, townId: string, out: Stock, times = 1): void {
  for (const [id, n] of Object.entries(out)) addStock(state, townId, id, n * times);
}

/** Move satchel goods into the yard you stand in (keeps coin, letters, keepsakes and one each of your tools). */
const KEEP = new Set(['coin', 'letter', 'keepsake']);
const KEEP_ONE = new Set(['tools', 'axe', 'mallet']);
export function stowSatchel(state: SimState, townId: string): Result {
  if (!depotAt(state, townId)) return { ok: false, line: 'You keep no yard here.' };
  const inv = inventoryOf(state);
  const moved: Stock = {};
  for (const [id, n] of Object.entries(inv)) {
    if (KEEP.has(id) || n <= 0) continue;
    const q = KEEP_ONE.has(id) ? n - 1 : n;
    if (q <= 0) continue;
    addItem(state, id, -q);
    addStock(state, townId, id, q);
    moved[id] = q;
  }
  const n = Object.values(moved).reduce((a, b) => a + b, 0);
  return n ? { ok: true, line: `You stack ${n} things in the yard.` } : { ok: false, line: 'You carry nothing worth stacking.' };
}
/** Take a satchel item (not a works good) out of the yard. */
export function takeOut(state: SimState, townId: string, id: string, n = 1): Result {
  if (isWorksGood(id)) return { ok: false, line: `${goodName(id)} stays in the yard: use it here, or send it by convoy.` };
  const have = stockOf(state, townId)[id] ?? 0;
  if (have < n) return { ok: false, line: 'There is not that much here.' };
  addStock(state, townId, id, -n);
  addItem(state, id, n);
  return { ok: true, line: `You take ${n} ${goodName(id).toLowerCase()}.` };
}

// ---- People ----
/** Everyone the Works already employs or fields (line hands and soldiers). */
export function busyIds(state: SimState): Set<string> {
  const w = worksIfAny(state);
  const s = new Set<string>();
  for (const l of w?.lines ?? []) for (const p of l.workers) s.add(p);
  for (const p of w?.band?.soldiers ?? []) s.add(p);
  return s;
}
/** Grown residents of a town free to take work: not a visitor, not a child, not already working for you or a company. */
export function freeHands(state: SimState, townId: string): string[] {
  const busy = busyIds(state);
  return Object.values(state.people).filter((p) => p.townId === townId && (p.age ?? 30) >= 16 && (p.age ?? 30) < 70
    && !p.id.startsWith('vis_') && !busy.has(p.id) && !companyOf(state, p.id) && !(p.tags ?? []).includes('visitor'))
    .map((p) => p.id).sort();
}
/** Drop people who have died or moved away from every crew and the band. */
export function prunePeople(state: SimState): void {
  const w = worksIfAny(state);
  if (!w) return;
  for (const l of w.lines) l.workers = l.workers.filter((p) => state.people[p]);
  if (w.band) w.band.soldiers = w.band.soldiers.filter((p) => state.people[p]);
}

// ---- News (told at dawn by the people it concerns; see contrib/works) ----
export function news(state: SimState, text: string, who?: string, townId?: string): void {
  const w = worksOf(state);
  w.news.push({ day: state.day, text, ...(who ? { who } : {}), ...(townId ? { townId } : {}) });
  if (w.news.length > 40) w.news.splice(0, w.news.length - 40);
}
