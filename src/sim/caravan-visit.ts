/**
 * A caravan's stop at a town: halt, unload crate by crate into real town stock,
 * trade surplus back onto the wagon, then turn around (or retire at its home depot).
 * Pure + deterministic. Used both live (overworld frame time) and at dawn (rest skips ahead).
 */

import type { CaravanMobile, CaravanPhase } from './caravans-types';
import { ITEMS } from './goods/inventory';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import type { SimState } from './types/runtime';
import visitJson from '../data/world/caravan-visit.json';

export const CARAVAN_VISIT = visitJson;
const EPS = 1e-9;

export const PHASE_DAYS: Record<CaravanPhase, number> = {
  unloading: CARAVAN_VISIT.unloadDays,
  trading: CARAVAN_VISIT.tradeDays,
  departing: CARAVAN_VISIT.departDays,
};

export const isHalted = (m: CaravanMobile): boolean => m.phase !== undefined;

/** True when the town is short of `resourceId` (same threshold the noticeboards use). */
export function isShort(state: SimState, townId: string, resourceId: string): boolean {
  return (state.towns?.[townId]?.stock[resourceId] ?? 0) < ITEMS.deeds.shortageBelow;
}

/** Resources currently under the shortage line in a town (what a delivery can measurably fix). */
export function townShortages(state: SimState, townId: string): { resource: string; missing: number }[] {
  const stock = state.towns?.[townId]?.stock ?? {};
  return Object.keys(stock)
    .filter((r) => stock[r]! < ITEMS.deeds.shortageBelow)
    .sort()
    .map((resource) => ({ resource, missing: ITEMS.deeds.shortageBelow - stock[resource]! }));
}

function unitPrice(resourceId: string): number {
  const item = ITEMS.items.find((i) => i.economyResourceId === resourceId);
  return item?.price ?? CARAVAN_VISIT.trade.defaultUnitPrice;
}

/** Wagon stops at the end of its leg. Idempotent. */
export function beginVisit(state: SimState, m: CaravanMobile, townId: string, prism?: string): void {
  if (m.phase) return;
  m.progress01 = 1;
  m.travelCredit = 0;
  m.phase = 'unloading';
  m.phaseLeft = PHASE_DAYS.unloading;
  m.visit = { townId, resourceId: m.cargoResourceId, total: Math.max(0, Math.floor(m.qty)), moved: 0, relieved: 0, prism };
  const t = state.towns?.[townId];
  if (t) {
    t.caravanTrade = { visits: 0, received: 0, sold: 0, relieved: 0, ...t.caravanTrade };
    t.caravanTrade.visits++;
  }
  pushJuice(state, 'caravan.arrive', { townId, routeId: m.routeId, caravanId: m.id });
}

/** Move `n` more crates off the wagon into stock; each crate into a shortage eases despair. */
function unload(state: SimState, m: CaravanMobile, n: number): void {
  const v = m.visit!;
  const town = state.towns?.[v.townId];
  const take = Math.min(n, v.total - v.moved, Math.max(0, m.qty));
  if (take <= 0) return;
  for (let i = 0; i < take; i++) {
    const short = isShort(state, v.townId, v.resourceId);
    if (town) {
      town.stock[v.resourceId] = (town.stock[v.resourceId] ?? 0) + 1;
      // Opted-out towns still get the goods but their despair is not simulated.
      if (short && town.economyOptIn !== false) {
        town.despair = Math.max(0, town.despair - ITEMS.deeds.shortageDespairRelief);
        v.relieved++;
        if (town.caravanTrade) town.caravanTrade.relieved++;
      }
      if (town.caravanTrade) town.caravanTrade.received++;
    }
    m.qty--;
    v.moved++;
    m.coin = (m.coin ?? CARAVAN_VISIT.trade.startingCoin) + unitPrice(v.resourceId); // the town pays for each crate
  }
  const data = state.data as DataTables | undefined;
  const payload = { townId: v.townId, routeId: m.routeId, resourceId: v.resourceId, qty: take };
  if (v.prism) pushJuice(state, v.prism, payload);
  pushJuice(state, data?.economyLod?.juice.deliver ?? 'stock.deliver', payload);
}

/** The town sells its biggest surplus onto the wagon for the trip home (at the start of the trading phase). */
function tradeBack(state: SimState, m: CaravanMobile): void {
  const v = m.visit!;
  const town = state.towns?.[v.townId];
  if (!town || m.heading !== 'outbound') return;
  const cfg = CARAVAN_VISIT.trade;
  let best: string | undefined;
  for (const r of Object.keys(town.stock).sort()) {
    if (r === v.resourceId) continue; // never sell back what was just brought in
    if (town.stock[r]! - cfg.surplusAbove < 1) continue;
    if (!best || town.stock[r]! > town.stock[best]!) best = r;
  }
  if (!best) return;
  m.coin ??= cfg.startingCoin;
  const price = unitPrice(best);
  const qty = Math.min(cfg.backhaulQty, Math.floor(town.stock[best]! - cfg.surplusAbove), Math.floor(m.coin / price));
  if (qty < 1) return;
  town.stock[best]! -= qty;
  m.coin -= qty * price;
  m.cargoResourceId = best;
  m.qty = qty;
  v.bought = { resourceId: best, qty };
  if (town.caravanTrade) town.caravanTrade.sold += qty;
  pushJuice(state, 'caravan.trade', { townId: v.townId, routeId: m.routeId, resourceId: best, qty });
}

/** Phase just ran out. Returns false when the caravan is done for good (home depot reached). */
function finishPhase(state: SimState, m: CaravanMobile): boolean {
  const v = m.visit!;
  if (m.phase === 'unloading') {
    unload(state, m, v.total); // anything the frame clock hadn't moved yet
    m.phase = m.heading === 'outbound' ? 'trading' : 'departing';
    if (m.phase === 'trading') tradeBack(state, m); // crates then visibly go aboard while the phase runs
  } else if (m.phase === 'trading') {
    m.phase = 'departing';
  } else {
    pushJuice(state, 'caravan.depart', { townId: v.townId, routeId: m.routeId, caravanId: m.id });
    if (m.heading === 'return') return false;
    m.heading = 'return';
    m.progress01 = 0;
    m.phase = undefined;
    m.phaseLeft = undefined;
    m.visit = undefined;
    return true;
  }
  m.phaseLeft = PHASE_DAYS[m.phase];
  return true;
}

/**
 * Spend `days` of game time on the stop (pass Infinity to finish it, as a dawn does).
 * Returns true when the caravan has retired and should be removed.
 */
export function advanceVisit(state: SimState, m: CaravanMobile, days: number): boolean {
  let left = days;
  while (m.phase) {
    const need = m.phaseLeft ?? 0;
    const used = Math.min(left, need);
    m.phaseLeft = need - used;
    left -= used;
    if (m.phase === 'unloading' && m.phaseLeft > EPS) {
      // Crates leave at an even pace across the phase.
      const due = Math.floor(m.visit!.total * (1 - m.phaseLeft / PHASE_DAYS.unloading) + EPS);
      unload(state, m, due - m.visit!.moved);
    }
    if (m.phaseLeft > EPS) return false;
    if (!finishPhase(state, m)) return true;
  }
  return false;
}

/** Short line for labels and the trade panel. */
export function caravanStatus(m: CaravanMobile): string {
  const v = m.visit;
  if (m.phase === 'unloading' && v) return `Unloading ${v.moved}/${v.total}`;
  if (m.phase === 'trading') return 'Trading with the town';
  if (m.phase === 'departing') return m.heading === 'outbound' ? 'Turning around' : 'Settling in';
  return m.heading === 'outbound' ? 'On the road' : 'Heading home';
}
