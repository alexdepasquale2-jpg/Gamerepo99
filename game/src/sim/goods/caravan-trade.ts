/**
 * Roadside trading with a real caravan: finite stock, finite coin, never an unlimited shop.
 * Timber, ore and wool (data/items/items.json `market`) are always on offer alongside the wagon's own cargo.
 * Prices follow how short the wagon's destination town is of the good; goods you sell ride in the wagon
 * (cargo pile, or `hold` for other goods) and are unloaded into that town's stock at the stop (see caravan-visit).
 */
import type { CaravanMobile } from '../caravans-types';
import type { SimState } from '../types/runtime';
import { scarcityOf } from '../economy/food-stock';
import { ITEMS, ITEM_BY_ID, addItem, hasItem, removeItem, type ItemRow } from './inventory';

const byCargo = (resourceId: string | undefined): ItemRow | undefined => ITEMS.items.find((i) => i.economyResourceId === resourceId);

export function caravanItem(state: SimState, id: string) {
  return byCargo(state.caravans?.find((m) => m.id === id)?.cargoResourceId);
}

/** The town the goods aboard will next be unloaded in. */
export function wagonDestination(state: SimState, m: CaravanMobile): string | undefined {
  const route = state.economyRoutes?.find((r) => r.id === m.routeId);
  if (m.phase) {
    if (m.phase === 'unloading' || m.heading === 'return') return m.visit?.townId;
    return route?.fromTownId; // outbound wagon already unloaded: heading home
  }
  return m.heading === 'outbound' ? route?.toTownId : route?.fromTownId;
}

/** 0 (well stocked) .. 1 (nothing in store) against the shortage line the noticeboards use (food: the ledger). */
export function scarcity(state: SimState, townId: string | undefined, resourceId: string | undefined): number {
  return townId && resourceId ? scarcityOf(state, townId, resourceId) : 0;
}

export type Offer = {
  itemId: string;
  name: string;
  /** Coin you pay per unit / coin you receive per unit. */
  buy: number;
  sell: number;
  /** Units on the wagon that you could buy. */
  aboard: number;
  /** Units in your satchel. */
  have: number;
  /** The wagon's destination is short of this good. */
  short: boolean;
};

/** How many units of `resourceId` the wagon carries (cargo pile plus hold). */
export function aboard(m: CaravanMobile, resourceId: string | undefined): number {
  if (!resourceId) return 0;
  return (m.cargoResourceId === resourceId ? Math.max(0, Math.floor(m.qty)) : 0) + (m.hold?.[resourceId] ?? 0);
}

export function quote(state: SimState, m: CaravanMobile, item: ItemRow): { buy: number; sell: number; short: boolean } {
  const s = scarcity(state, wagonDestination(state, m), item.economyResourceId);
  const k = ITEMS.market;
  return {
    buy: Math.max(1, Math.round(item.price * k.buyFactor * (1 + s))),
    sell: Math.max(1, Math.round(item.price * k.sellFactor * (1 + s))),
    short: s > 0,
  };
}

/** What the player can trade here: the market goods first, then the wagon's own cargo if it is something else. */
export function offers(state: SimState, id: string): Offer[] {
  const m = state.caravans?.find((c) => c.id === id);
  if (!m) return [];
  const ids = [...ITEMS.market.goods];
  const cargo = byCargo(m.cargoResourceId);
  if (cargo && !ids.includes(cargo.id)) ids.push(cargo.id);
  return ids.flatMap((itemId) => {
    const item = ITEM_BY_ID.get(itemId);
    if (!item) return [];
    const q = quote(state, m, item);
    return [{ itemId, name: item.name, ...q, aboard: aboard(m, item.economyResourceId), have: state.inventory?.[itemId] ?? 0 }];
  });
}

export function tradeGood(state: SimState, id: string, itemId: string, buying: boolean): string {
  const m = state.caravans?.find((c) => c.id === id), item = ITEM_BY_ID.get(itemId);
  if (!m || !item?.economyResourceId) return 'This caravan has moved on.';
  const res = item.economyResourceId, q = quote(state, m, item);
  m.coin ??= 20;
  if (buying) {
    if (aboard(m, res) < 1) return `The wagon has no ${item.name} to spare.`;
    if (!hasItem(state, 'coin', q.buy)) return `You need ${q.buy} coin.`;
    removeItem(state, 'coin', q.buy);
    addItem(state, item.id, 1);
    if (m.cargoResourceId === res && m.qty >= 1) { m.qty--; if (m.phase === 'unloading' && m.visit) m.visit.total = Math.max(m.visit.moved, m.visit.total - 1); }
    else if (m.hold?.[res]) { m.hold[res]!--; if (m.hold[res]! <= 0) delete m.hold[res]; if (!Object.keys(m.hold).length) delete m.hold; }
    m.coin += q.buy;
    return `Bought ${item.name} for ${q.buy} coin.${q.short ? ' (Dear: the town is short of it.)' : ''}`;
  }
  if (!hasItem(state, item.id)) return `Gather some ${item.name} first.`;
  if (m.coin < q.sell) return 'The trader has no coin left.';
  removeItem(state, item.id);
  addItem(state, 'coin', q.sell);
  m.coin -= q.sell;
  if (m.cargoResourceId === res) { m.qty++; if (m.phase === 'unloading' && m.visit) m.visit.total++; } // still on the wagon, so it comes off with the rest
  else (m.hold ??= {})[res] = (m.hold[res] ?? 0) + 1;
  const dest = wagonDestination(state, m);
  return `Sold ${item.name} for ${q.sell} coin. It travels to ${dest ?? 'the next town'}${q.short ? ', which is short of it' : ''}.`;
}

/** Wagon-cargo trade kept for callers that only know the wagon's own good. */
export function tradeCaravan(state: SimState, id: string, buying: boolean): string {
  const item = caravanItem(state, id);
  return item ? tradeGood(state, id, item.id, buying) : 'This caravan has moved on.';
}
