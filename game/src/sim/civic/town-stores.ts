/**
 * Town stores (civic slice 3): where a town's goods physically sit, and the town ledger as a view of them.
 *
 * Each town keeps a granary (food), a storehouse (everything else) and a yard (what does not fit, in the
 * open), and every site keeps its own shelves (Site.store). `villageEconomy.towns[id].goods` is the sum of
 * all of them, kept up to date by every write here, so its readers (scarcity, townNeeds, priceAt, shops)
 * need no change.
 *
 * Writers that still poke the ledger directly (build-plan draws, road folk, workshops) keep working: the
 * next call here first reconciles, turning any change it finds against what it last wrote into goods put
 * into the depot (`source:outside`) or drawn from the town's stores (`sink:outside`). Old saves have no
 * stores at all: the first touch moves the town's ledger into them (`source:opening`), no migration.
 *
 * Every good created or destroyed is counted under a named source or sink in `flows`, so the world's goods
 * (all stores plus carts on the road) only ever change by those (scripts/check-civic.mts proves it).
 * This module imports no economy code (the economy imports it), and sites only as a type. Pure + deterministic.
 */
import sitesJson from '../../data/civic/sites.json';
import type { SimState } from '../types/runtime';
import type { Site } from './sites';
import { noteUse } from '../data-use-civic';
import { makeLog, makeStore, move, put, spoilItems, take, total, type ConservationLog, type MoveCtx, type Store } from './store';

type StoresTable = {
  granaryItems: string[]; yardCapacity: number; spoilage: Record<string, number>;
  shelter: { granary: number; storehouse: number; site: number; yard: number };
  haulLoad: number; selfHaul: number; inputKeep: number; maxHaulers: number; lowCoverDays: number; loadLine: number; newsKeep: number;
};
const J = sitesJson as unknown as { stores: StoresTable; kinds: { id: string; capacity?: number }[] };
export const STORES = J.stores;
const capacityOf = (kind: string): number => J.kinds.find((k) => k.id === kind)?.capacity ?? 0;
export const GRANARY_CAPACITY = capacityOf('granary');
export const STOREHOUSE_CAPACITY = capacityOf('storehouse');
const GRANARY_ITEMS = new Set(STORES.granaryItems);
export const keepsInGranary = (item: string): boolean => GRANARY_ITEMS.has(item);

export type Depot = 'granary' | 'storehouse' | 'yard';
export const DEPOTS: readonly Depot[] = ['granary', 'storehouse', 'yard'];
export type TownStores = {
  granary: Store; storehouse: Store; yard: Store;
  /** The ledger as this module last wrote it: a difference is someone else's write, reconciled on the next call. */
  seen: Record<string, number>;
  /** The granary is under lowCoverDays of the town's meal (edge-triggers the dawn line). */
  low?: boolean;
};
export type HaulNews = { day: number; townId: string; kind: 'low' | 'load'; personId?: string; siteId?: string; item?: string; qty?: number; cover?: number };
export type TownStoresState = {
  towns: Record<string, TownStores>;
  /** Running totals of every named source and sink (`source:production`, `sink:eaten`, ...). */
  flows: Record<string, number>;
  log: ConservationLog;
  news: HaulNews[];
};

const EPS = 1e-9;
type WithStores = SimState & { townStores?: TownStoresState; civic?: { sites: Record<string, Site> } };

export const storesIfAny = (state: SimState | undefined): TownStoresState | undefined => (state as WithStores | undefined)?.townStores;
export const storesOf = (state: SimState): TownStoresState =>
  ((state as WithStores).townStores ??= { towns: {}, flows: {}, log: makeLog(200), news: [] });

type Ledger = { goods: Record<string, number>; need: Record<string, number>; short: Record<string, number> };
const ledgerIfAny = (state: SimState, townId: string): Ledger | undefined => state.villageEconomy?.towns[townId];
const ledgerOf = (state: SimState, townId: string): Ledger =>
  ((state.villageEconomy ??= { towns: {} }).towns[townId] ??= { goods: {}, need: {}, short: {} });

/** Every site's shelves in a town (closed ones too, until their goods are carried off), by id. */
export function siteStoresIn(state: SimState, townId: string): Site[] {
  return Object.values((state as WithStores).civic?.sites ?? {}).filter((s) => s.townId === townId && !!s.store).sort((a, z) => a.id.localeCompare(z.id));
}

export const depotFor = (item: string): Depot => (keepsInGranary(item) ? 'granary' : 'storehouse');
export const depotLabel = (townId: string, d: Depot): string => `${townId}:${d}`;
export const siteLabel = (s: Site): string => `site:${s.id}`;
/**
 * Production and meals are counted in `flows`; the bounded log keeps only moves and spoilage (what QA wants
 * to trace: where a load went, what rotted where), so a busy dawn does not churn it.
 */
const ctx = (state: SimState, label: string): MoveCtx => ({ day: state.day, label });
const logged = (state: SimState, label: string): MoveCtx => ({ day: state.day, log: storesOf(state).log, label });

/** Count a creation or destruction under its name (moves between stores and carts are not counted). */
function flow(state: SimState, name: string, qty: number): void {
  if (qty <= EPS || !(name.startsWith('source:') || name.startsWith('sink:'))) return;
  const f = storesOf(state).flows;
  f[name] = (f[name] ?? 0) + qty;
}

/** Keep the ledger view in step with a change of `delta` in the town's stores. */
function bump(state: SimState, townId: string, ts: TownStores, item: string, delta: number): void {
  if (Math.abs(delta) <= EPS) return;
  const g = ledgerOf(state, townId).goods;
  g[item] = Math.max(0, (g[item] ?? 0) + delta);
  ts.seen[item] = g[item]!;
}

/** What one item adds up to across the town's depots and site shelves. */
export function viewTotal(state: SimState, townId: string, item: string): number {
  const ts = storesIfAny(state)?.towns[townId];
  let n = ts ? DEPOTS.reduce((m, d) => m + total(ts[d], item), 0) : 0;
  for (const s of siteStoresIn(state, townId)) n += total(s.store, item);
  return n;
}

/** Into the town's depot for the item, the yard for what does not fit. Returns what went in (all of it). */
function putDepot(state: SimState, townId: string, ts: TownStores, item: string, qty: number, source: string): number {
  const d = depotFor(item);
  let n = put(ts[d], item, qty, source, ctx(state, depotLabel(townId, d)));
  if (qty - n > EPS) n += put(ts.yard, item, qty - n, source, ctx(state, depotLabel(townId, 'yard')));
  return n;
}

/** Out of the town's stores, worst-kept first: the yard, the storehouse, the granary, then the sites' shelves. */
function drawAll(state: SimState, townId: string, ts: TownStores, item: string, qty: number, sink: string, sitesToo = true): number {
  let left = qty;
  for (const d of ['yard', 'storehouse', 'granary'] as const) {
    if (left <= EPS) break;
    left -= take(ts[d], item, left, sink, ctx(state, depotLabel(townId, d)));
  }
  if (sitesToo) {
    for (const s of siteStoresIn(state, townId)) {
      if (left <= EPS) break;
      left -= take(s.store, item, left, sink, ctx(state, siteLabel(s)));
    }
  }
  return qty - Math.max(0, left);
}

function blankTown(): TownStores {
  // Every town keeps one granary and one storehouse (sites.json kinds), sized by their capacity.
  noteUse('civic/sites', 'granary');
  noteUse('civic/sites', 'storehouse');
  return { granary: makeStore(GRANARY_CAPACITY), storehouse: makeStore(STOREHOUSE_CAPACITY), yard: makeStore(STORES.yardCapacity), seen: {} };
}

/** Recompute the whole ledger view from the stores (corrects float drift; drops nothing callers index). */
export function refreshTown(state: SimState, townId: string): void {
  const ts = storesIfAny(state)?.towns[townId];
  const l = ledgerIfAny(state, townId);
  if (!ts || !l) return;
  const items = new Set([...Object.keys(l.goods), ...Object.keys(ts.seen)]);
  for (const d of DEPOTS) for (const i of Object.keys(ts[d].items)) items.add(i);
  for (const s of siteStoresIn(state, townId)) for (const i of Object.keys(s.store.items)) items.add(i);
  for (const item of [...items].sort()) {
    // Keys stay (at 0) once seen: some callers index the ledger with a non-null assertion.
    const v = viewTotal(state, townId, item);
    l.goods[item] = v;
    ts.seen[item] = v;
  }
}

/** Fold in whatever was written to the ledger behind this module's back since it last wrote it. */
function reconcile(state: SimState, townId: string, ts: TownStores): void {
  const l = ledgerIfAny(state, townId);
  if (!l) return;
  const keys = new Set([...Object.keys(l.goods), ...Object.keys(ts.seen)]);
  for (const item of [...keys].sort()) {
    const now = l.goods[item];
    const was = ts.seen[item] ?? 0;
    // A deleted key is a draw to nothing; a NaN (someone subtracted from a missing key) is no write at all.
    const cur = now === undefined ? 0 : Number.isFinite(now) ? now : was;
    const d = cur - was;
    if (Math.abs(d) <= EPS) { if (now !== cur) l.goods[item] = cur; continue; }
    if (d > 0) flow(state, 'source:outside', putDepot(state, townId, ts, item, d, 'source:outside'));
    else flow(state, 'sink:outside', drawAll(state, townId, ts, item, -d, 'sink:outside'));
    const v = viewTotal(state, townId, item);
    l.goods[item] = v;
    ts.seen[item] = v;
  }
}

/** A town's stores, made on first touch (from its ledger, for saves from before stores) and reconciled. */
export function openTown(state: SimState, townId: string): TownStores {
  const st = storesOf(state);
  let ts = st.towns[townId];
  if (!ts) {
    ts = st.towns[townId] = blankTown();
    const l = ledgerIfAny(state, townId);
    if (l) {
      for (const item of Object.keys(l.goods).sort()) {
        const q = l.goods[item]!;
        if (Number.isFinite(q) && q > EPS) flow(state, 'source:opening', putDepot(state, townId, ts, item, q, 'source:opening'));
      }
      refreshTown(state, townId);
    }
    return ts;
  }
  reconcile(state, townId, ts);
  return ts;
}

// ---- The writes the economy makes. Each returns what it actually moved. ----

/** Goods arriving in town from outside it (gifts, deliveries, the LOD's flows): into the depot. */
export function supplyStores(state: SimState, townId: string, item: string, qty: number, source = 'source:outside'): number {
  if (!townId || !(qty > EPS)) return 0;
  ledgerOf(state, townId);
  const ts = openTown(state, townId);
  const n = putDepot(state, townId, ts, item, qty, source);
  flow(state, source, n);
  bump(state, townId, ts, item, n);
  return n;
}

/** Goods leaving the town's stores to a sink (eaten, worn, taken) or onto a cart (`cart:<id>`, not counted). */
export function drawStores(state: SimState, townId: string, item: string, qty: number, sink: string): number {
  if (!ledgerIfAny(state, townId) || !(qty > EPS)) return 0;
  const ts = openTown(state, townId);
  const n = drawAll(state, townId, ts, item, qty, sink);
  flow(state, sink, n);
  bump(state, townId, ts, item, -n);
  return n;
}

/** A cart's load arriving: into the depot, a move between stores (the cart's goods left another town's stores). */
export const unloadIntoStores = (state: SimState, townId: string, item: string, qty: number, cartId: string): number =>
  supplyStores(state, townId, item, qty, `cart:${cartId}`);

/** What a worker can reach for a recipe: their site's shelves, then the town's depots (not another site's). */
export function reachable(state: SimState, townId: string, site: Site | undefined, item: string): number {
  const ts = storesIfAny(state)?.towns[townId];
  return (site ? total(site.store, item) : 0) + (ts ? DEPOTS.reduce((n, d) => n + total(ts[d], item), 0) : 0);
}

/** A recipe's input used up: off the site's own shelves first, then out of the depots. */
export function useInput(state: SimState, townId: string, site: Site | undefined, item: string, qty: number): number {
  const ts = openTown(state, townId);
  let n = site ? take(site.store, item, qty, 'sink:used', ctx(state, siteLabel(site))) : 0;
  if (qty - n > EPS) n += drawAll(state, townId, ts, item, qty - n, 'sink:used', false);
  flow(state, 'sink:used', n);
  bump(state, townId, ts, item, -n);
  return n;
}

/** What a hand makes: onto their site's shelves, the overflow carried straight to the depot; no site, the depot. */
export function produce(state: SimState, townId: string, site: Site | undefined, item: string, qty: number): number {
  if (!(qty > EPS)) return 0;
  ledgerOf(state, townId);
  const ts = openTown(state, townId);
  let n = site ? put(site.store, item, qty, 'source:production', ctx(state, siteLabel(site))) : 0;
  if (qty - n > EPS) n += putDepot(state, townId, ts, item, qty - n, 'source:production');
  flow(state, 'source:production', n);
  bump(state, townId, ts, item, n);
  return n;
}

/** Spoil a share of one good wherever it sits in town, keeping at least `floor` of it (economy-lod's food rot). */
export function spoilInTown(state: SimState, townId: string, item: string, rate: number, floor = 0): number {
  if (!ledgerIfAny(state, townId) || !(rate > 0)) return 0;
  const ts = openTown(state, townId);
  const have = viewTotal(state, townId, item);
  const lose = Math.min(have * Math.min(1, rate), Math.max(0, have - floor));
  if (lose <= EPS) return 0;
  const share = lose / have;
  let n = 0;
  for (const d of DEPOTS) n += take(ts[d], item, total(ts[d], item) * share, 'sink:spoiled', ctx(state, depotLabel(townId, d)));
  for (const s of siteStoresIn(state, townId)) n += take(s.store, item, total(s.store, item) * share, 'sink:spoiled', ctx(state, siteLabel(s)));
  flow(state, 'sink:spoiled', n);
  bump(state, townId, ts, item, -n);
  return n;
}

/** One dawn of per-good spoilage in every store in town, by each store's shelter. Returns what was lost. */
export function spoilTown(state: SimState, townId: string): number {
  const ts = openTown(state, townId);
  const rateIn = (shelter: number) => (item: string) => (STORES.spoilage[item] ?? 0) * shelter;
  let lost = 0;
  for (const d of DEPOTS) lost += spoilItems(ts[d], rateIn(STORES.shelter[d]), logged(state, depotLabel(townId, d)));
  for (const s of siteStoresIn(state, townId)) lost += spoilItems(s.store, rateIn(STORES.shelter.site), logged(state, siteLabel(s)));
  flow(state, 'sink:spoiled', lost);
  refreshTown(state, townId);
  return lost;
}

/** Move between a site's shelves and a town depot (yard overflow on the way in). A move: nothing counted. */
export function haulToDepot(state: SimState, townId: string, site: Site, item: string, qty: number): number {
  const ts = openTown(state, townId);
  const d = depotFor(item);
  const c = { ...logged(state, siteLabel(site)), toLabel: depotLabel(townId, d) };
  let n = move(site.store, ts[d], item, qty, c);
  if (qty - n > EPS) n += move(site.store, ts.yard, item, qty - n, { ...c, toLabel: depotLabel(townId, 'yard') });
  return n;
}

/** Bring an input out to a site's shelves: from the yard first (it keeps worst), then the depots. */
export function haulToSite(state: SimState, townId: string, site: Site, item: string, qty: number): number {
  const ts = openTown(state, townId);
  let n = 0;
  for (const d of ['yard', 'storehouse', 'granary'] as const) {
    if (qty - n <= EPS) break;
    n += move(ts[d], site.store, item, qty - n, { ...logged(state, depotLabel(townId, d)), toLabel: siteLabel(site) });
  }
  return n;
}

/** Food in a town's granary. */
export const granaryFood = (state: SimState, townId: string): number => {
  const g = storesIfAny(state)?.towns[townId]?.granary;
  return g ? STORES.granaryItems.reduce((n, i) => n + total(g, i), 0) : 0;
};

/** Every good in the world: all town stores and site shelves, plus what carts carry (for the conservation check). */
export function worldGoods(state: SimState): number {
  let n = 0;
  for (const ts of Object.values(storesIfAny(state)?.towns ?? {})) for (const d of DEPOTS) n += total(ts[d]);
  for (const s of Object.values((state as WithStores).civic?.sites ?? {})) if (s.store) n += total(s.store);
  for (const c of state.logistics?.carts ?? []) n += Math.max(0, c.qty);
  return n;
}

/** Net named sources minus sinks counted so far. */
export function netFlows(state: SimState): number {
  let n = 0;
  for (const [k, q] of Object.entries(storesIfAny(state)?.flows ?? {})) n += k.startsWith('source:') ? q : -q;
  return n;
}

export function pushStoresNews(state: SimState, n: Omit<HaulNews, 'day'>): void {
  const news = storesOf(state).news;
  news.push({ day: state.day, ...n });
  if (news.length > STORES.newsKeep) news.splice(0, news.length - STORES.newsKeep);
}

/** Count a cart lost on the road (its goods were already off the town's stores). */
export const loseCartLoad = (state: SimState, qty: number): void => flow(state, 'sink:lost', qty);
