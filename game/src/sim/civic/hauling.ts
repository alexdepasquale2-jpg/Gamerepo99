/**
 * Hauling (civic slice 3): what a site makes sits on its shelves until someone carries it to the town's
 * granary or storehouse, and what it works on has to be carried out to it. Each dawn, after the day's work
 * and the carts:
 *   1. a closed site's shelves are emptied into the town stores (nothing is left to vanish with it);
 *   2. a working site's haulers (Site.haulers, hired in staffing) carry `haulLoad` each, or the manager
 *      carries `selfHaul` when it has none: outputs off to the depots first, then inputs back out to keep
 *      `inputKeep` of each on the shelves;
 *   3. every store spoils by good and shelter (bread goes stale on a farm's shelf, grain keeps in the granary,
 *      timber keeps anywhere): the named sink `sink:spoiled`;
 *   4. a granary under `lowCoverDays` of the town's meal is news, and so is a hauler's big load.
 * Moves between stores create and destroy nothing (civic/store); the ledger view is refreshed after.
 * News comes through people: the hauler who brought it, the oldest neighbour who frets. Pure + deterministic.
 */
import { registerDevHook } from '../../app/dev-hooks';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { neighbourOf } from '../economy/mortality';
import { itemName } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { SITE_KIND_BY_ID, canWork, type Site } from './sites';
import { total } from './store';
import {
  DEPOTS, STORES, granaryFood, haulToDepot, haulToSite, keepsInGranary, openTown, pushStoresNews, siteStoresIn,
  spoilTown, storesIfAny, type HaulNews,
} from './town-stores';

const EPS = 1e-9;

/** Haulers fit to carry today. */
export const haulersAt = (state: SimState, site: Site): string[] => (site.haulers ?? []).filter((id) => canWork(state, id, true));

/** What a site can carry in a dawn: its haulers' loads, else the manager's own arms. */
export function haulCapacity(state: SimState, site: Site): number {
  if (site.status !== 'working' || !site.managerId) return 0;
  const n = haulersAt(state, site).length;
  return n > 0 ? n * STORES.haulLoad : STORES.selfHaul;
}

/** One site's dawn of hauling. Returns what went up to the granary, and the most of it (for the dawn line). */
function haulSite(state: SimState, site: Site): { qty: number; item?: string } {
  let load = haulCapacity(state, site);
  if (load <= EPS) return { qty: 0 };
  const inputs = new Set(SITE_KIND_BY_ID.get(site.kind)?.inputs ?? []);
  let toGranary = 0, main: string | undefined, mainQty = 0;
  // Outputs first (they rot or crowd the shelves), most of a thing first so the big pile moves.
  const outs = Object.keys(site.store.items).filter((i) => !inputs.has(i)).sort((a, z) => total(site.store, z) - total(site.store, a) || a.localeCompare(z));
  for (const item of outs) {
    if (load <= EPS) break;
    const n = haulToDepot(state, site.townId, site, item, Math.min(load, total(site.store, item)));
    load -= n;
    if (keepsInGranary(item)) {
      toGranary += n;
      if (n > mainQty) { main = item; mainQty = n; }
    }
  }
  for (const item of [...inputs].sort()) {
    if (load <= EPS) break;
    const want = STORES.inputKeep - total(site.store, item);
    if (want > EPS) load -= haulToSite(state, site.townId, site, item, Math.min(load, want));
  }
  return { qty: toGranary, item: main };
}

/** A closed site's shelves go to the town stores (a hauler's last job, or the neighbours'). */
function clearClosed(state: SimState, site: Site): void {
  for (const item of Object.keys(site.store.items).sort()) haulToDepot(state, site.townId, site, item, total(site.store, item));
}

/** The dawn tick (slot prices: after the day's work, meal and carts). */
export function tickHauling(state: SimState): void {
  const towns = new Set(Object.keys(state.villageEconomy?.towns ?? {}));
  for (const s of Object.values((state as { civic?: { sites: Record<string, Site> } }).civic?.sites ?? {})) if (s.townId) towns.add(s.townId);
  for (const townId of [...towns].sort()) {
    if (!state.villageEconomy?.towns[townId]) continue;
    const ts = openTown(state, townId);
    let best: { site: Site; qty: number; item?: string } | undefined;
    for (const site of siteStoresIn(state, townId)) {
      if (site.status === 'closed') { clearClosed(state, site); continue; }
      const up = haulSite(state, site);
      if (up.qty >= STORES.loadLine && haulersAt(state, site).length && (!best || up.qty > best.qty)) best = { site, ...up };
    }
    // Spoilage also recomputes the ledger view from the stores.
    spoilTown(state, townId);
    if (best) pushStoresNews(state, { townId, kind: 'load', siteId: best.site.id, personId: haulersAt(state, best.site)[0], qty: Math.floor(best.qty), item: best.item });
    // The granary runs low: told once as it crosses the line, again only after it has filled back up.
    const need = state.villageEconomy.towns[townId]!.need.food ?? 0;
    if (need > 0) {
      const cover = granaryFood(state, townId) / need;
      if (!ts.low && cover < STORES.lowCoverDays) { ts.low = true; pushStoresNews(state, { townId, kind: 'low', cover }); }
      else if (ts.low && cover >= STORES.lowCoverDays + 1) ts.low = false;
    }
  }
}

registerDawnTick('prices', 'civic-hauling', tickHauling);

// ---- Dawn lines ----

const firstName = (state: SimState, id: string | undefined): string | undefined => (id ? state.people[id]?.name?.split(' ')[0] : undefined);

function storesLine(state: SimState, n: HaulNews): string | null {
  if (n.kind === 'low') {
    const by = firstName(state, neighbourOf(state, '', n.townId));
    const days = (n.cover ?? 0) < 1 ? "not a day's food" : `${Math.floor(n.cover!)} day${Math.floor(n.cover!) === 1 ? "'s" : "s'"} food`;
    return `${by ? `${by} says` : 'Word is'} the granary is near bare: ${days} left in it.`;
  }
  const by = firstName(state, n.personId);
  const site = (state as { civic?: { sites: Record<string, Site> } }).civic?.sites[n.siteId ?? ''];
  if (!by || !site || !n.qty) return null;
  return `${by} says they hauled ${n.qty} sacks${n.item ? ` of ${itemName(n.item).toLowerCase()}` : ''} up from ${site.name} to the granary.`;
}

/** Today's stores news where the player stands: the granary running low first, then a load brought in. */
export function storesDawnLines(state: SimState): string[] {
  const here = state.player.townId;
  if (!here) return [];
  const today = (storesIfAny(state)?.news ?? []).filter((n) => n.day === state.day && n.townId === here);
  const out: string[] = [];
  for (const kind of ['low', 'load'] as const) for (const n of today) if (n.kind === kind) { const l = storesLine(state, n); if (l) out.push(l); }
  return out.slice(0, 2);
}

registerDawnLines('civic-stores', storesDawnLines);

// QA: __hearth.dev.stores.town(townId) / .sites(townId) / .flows() / .news()
registerDevHook('stores', (ctx) => {
  const st = (): SimState | undefined => ctx.session.getState();
  const round = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, q]) => [k, Math.round(q * 100) / 100]));
  return {
    town: (townId: string) => {
      const s = st();
      const ts = s && storesIfAny(s)?.towns[townId];
      if (!s || !ts) return null;
      return { ...Object.fromEntries(DEPOTS.map((d) => [d, round(ts[d].items)])), low: !!ts.low, ledger: round(s.villageEconomy?.towns[townId]?.goods ?? {}) };
    },
    sites: (townId: string) => {
      const s = st();
      return s ? siteStoresIn(s, townId).map((x) => ({ id: x.id, name: x.name, status: x.status, haulers: x.haulers, carry: haulCapacity(s, x), store: round(x.store.items) })) : [];
    },
    flows: () => round(storesIfAny(st())?.flows ?? {}),
    news: () => storesIfAny(st())?.news ?? [],
    haulNow: () => { const s = st(); if (s) tickHauling(s); },
  };
});
