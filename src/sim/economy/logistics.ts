/**
 * Village logistics: a town short of something posts a request; a town with surplus loads a cart
 * and sends it down the road (road-journey legs). Roads have a cart cap, travel is slowed by repair
 * and carts can be lost on the way (same per-day odds as couriers). Pure + deterministic.
 */

import { COURIER_SURVIVAL_PER_DAY } from '../letter-replies';
import { planRoad, positionOnLegs, type RoadLeg, type RoadPosition } from '../road-journey';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { COVER_DAYS, HOUSEHOLD, supplyTown } from './village-economy';

export const LOGISTICS = {
  cartCapacity: 6,
  /** Carts allowed on one road at a time. */
  routeCartCap: 3,
  /** Carts a town can send per dawn. */
  departuresPerTown: 2,
  /** Furthest haul, in road days. */
  maxDays: 8,
  /** Days a request waits before it lapses (and is re-posted if still short). */
  requestLapseDays: 10,
  /** A town keeps this many days of its own need before it calls anything surplus. */
  reserveDays: 5,
  /** Flat reserve for goods nobody consumes (raw materials). */
  reserveFlat: 2,
};

export type CartRequest = { id: string; townId: string; itemId: string; qty: number; postedDay: number; status: 'open' | 'filled' | 'lapsed'; cartId?: string };
export type Cart = { id: string; itemId: string; qty: number; fromTownId: string; toTownId: string; legs: RoadLeg[]; roadDays: number; daysLeft: number; requestId: string };
export type Logistics = { requests: CartRequest[]; carts: Cart[]; next: number; lost: number; delivered: number };

const logOf = (state: SimState): Logistics => (state.logistics ??= { requests: [], carts: [], next: 1, lost: 0, delivered: 0 });

/** Open requests, optionally for one town (for the needs board and build plans). */
export const openRequests = (state: SimState, townId?: string): CartRequest[] =>
  (state.logistics?.requests ?? []).filter((r) => r.status === 'open' && (!townId || r.townId === townId));

export const cartPosition = (c: Cart): RoadPosition | undefined => positionOnLegs(c.legs, c.roadDays - c.daysLeft);

const FOOD = HOUSEHOLD.food.eats;

/** Units of an item a town can spare. Food is judged as one pool against food need. */
function surplus(state: SimState, townId: string, itemId: string): number {
  const l = state.villageEconomy?.towns[townId];
  if (!l) return 0;
  const have = l.goods[itemId] ?? 0;
  if (FOOD.includes(itemId)) {
    const pool = FOOD.reduce((n, i) => n + (l.goods[i] ?? 0), 0);
    return Math.floor(Math.min(have, pool - (l.need.food ?? 0) * LOGISTICS.reserveDays));
  }
  return Math.floor(have - ((l.need[itemId] ?? 0) * LOGISTICS.reserveDays + LOGISTICS.reserveFlat));
}

const onRoute = (log: Logistics, routeId: string): number => log.carts.filter((c) => c.legs.some((l) => l.routeId === routeId)).length;

export function tickLogistics(state: SimState): void {
  const ve = state.villageEconomy;
  if (!ve) return;
  const log = logOf(state);
  const rng = (tag: string, id: string) => deriveRng(state.seed, tag, state.day, id);

  // 1. Carts on the road: age, maybe lose, maybe arrive.
  for (const cart of [...log.carts].sort((a, b) => a.id.localeCompare(b.id))) {
    cart.daysLeft -= 1;
    const req = log.requests.find((r) => r.id === cart.requestId);
    const broken = cart.legs.some((l) => (state.economyRoutes ?? []).find((r) => r.id === l.routeId)?.broken);
    if (rng('cart-road', cart.id).next() >= (broken ? COURIER_SURVIVAL_PER_DAY ** 2 : COURIER_SURVIVAL_PER_DAY)) {
      log.carts.splice(log.carts.indexOf(cart), 1);
      log.lost += 1;
      if (req) delete req.cartId; // goods lost; the request stays open
      continue;
    }
    if (cart.daysLeft <= 0) {
      log.carts.splice(log.carts.indexOf(cart), 1);
      supplyTown(state, cart.toTownId, cart.itemId, cart.qty);
      log.delivered += cart.qty;
      if (req) { req.status = 'filled'; delete req.cartId; }
    }
  }

  // 2. Shortage posts requests; stale ones lapse.
  for (const r of log.requests) if (r.status === 'open' && state.day - r.postedDay >= LOGISTICS.requestLapseDays && !r.cartId) r.status = 'lapsed';
  for (const [townId, l] of Object.entries(ve.towns).sort(([a], [b]) => a.localeCompare(b))) {
    for (const key of Object.keys(l.short).sort()) {
      if (log.requests.some((r) => r.status === 'open' && r.townId === townId && r.itemId === key)) continue;
      const qty = Math.min(12, Math.max(1, Math.ceil((l.need[key] ?? 1) * COVER_DAYS)));
      log.requests.push({ id: `req${log.next++}`, townId, itemId: key, qty, postedDay: state.day, status: 'open' });
    }
  }
  log.requests = log.requests.filter((r) => r.status === 'open' || state.day - r.postedDay < 30);

  // 3. Dispatch: nearest town with spare goods loads a cart for each unserved request.
  const sent = new Map<string, number>();
  const towns = Object.keys(ve.towns).sort();
  for (const req of log.requests.filter((r) => r.status === 'open' && !r.cartId)) {
    const items = req.itemId === 'food' ? FOOD : [req.itemId];
    let best: { from: string; item: string; road: NonNullable<ReturnType<typeof planRoad>> } | undefined;
    for (const from of towns) {
      if (from === req.townId || (sent.get(from) ?? 0) >= LOGISTICS.departuresPerTown) continue;
      const item = items.find((i) => surplus(state, from, i) >= 1);
      if (!item) continue;
      const road = planRoad(state, from, req.townId);
      if (!road || road.days > LOGISTICS.maxDays || road.legs.some((leg) => onRoute(log, leg.routeId) >= LOGISTICS.routeCartCap)) continue;
      if (!best || road.days < best.road.days) best = { from, item, road };
    }
    if (!best) continue;
    const qty = Math.min(req.qty, LOGISTICS.cartCapacity, surplus(state, best.from, best.item));
    ve.towns[best.from]!.goods[best.item]! -= qty;
    sent.set(best.from, (sent.get(best.from) ?? 0) + 1);
    const cart: Cart = { id: `cart${log.next++}`, itemId: best.item, qty, fromTownId: best.from, toTownId: req.townId, legs: best.road.legs, roadDays: best.road.days, daysLeft: best.road.days, requestId: req.id };
    log.carts.push(cart);
    req.cartId = cart.id;
  }
}
