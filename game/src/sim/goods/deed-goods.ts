/** Deeds that move real items: gift and trade. Pure over SimState. */

import { deriveRng } from '../rng';
import { encodeUnspokenForState } from '../social/unspoken';
import type { SimState } from '../types/runtime';
import { contributeToPlan } from '../economy/build-plans';
import { scarcity as localScarcity, supplyTown } from '../economy/village-economy';
import { isFoodRes, isShortOf, scarcityOf } from '../economy/food-stock';
import { jobOf } from './jobs';
import { consumeInstance, giveInstance, mintInstance } from './instances';
import { ITEMS, ITEM_BY_ID, addItem, bestGift, giftAffinity, hasItem, itemName, listStacks, removeItem } from './inventory';

export type DeedGoodsResult = { ok: boolean; line: string; /** Item that changed hands (gift/trade), for presentation. */ itemId?: string };
// carry_goods is gone (heavy goods are carried by hand: sim/carry); work_alongside is gone (hold-to-work).
const GOODS_DEEDS = new Set(['gift_give', 'trade_fair']);
export const isGoodsDeed = (id: string): boolean => GOODS_DEEDS.has(id);

const first = (id: string): string => {
  const w = id.split(/[_-]/).filter(Boolean)[0] ?? id;
  return w[0]!.toUpperCase() + w.slice(1);
};

function townOf(state: SimState, personId: string): string {
  return state.people[personId]?.townId ?? state.player.townId ?? '';
}

/** Coin value of an item at a town: base price, raised when the town is short of it. */
export function priceAt(state: SimState, townId: string, itemId: string): number {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return 0;
  const local = localScarcity(state, townId, itemId);
  if (local > 0) return Math.max(1, Math.round(item.price * (1 + local)));
  const res = item.economyResourceId;
  const scarcity = res ? scarcityOf(state, townId, res) : 0;
  return Math.max(1, Math.round(item.price * (1 + scarcity)));
}

/**
 * Bringing a good the town lacks: stock up, despair eases, a Blessing settles in. The item goes into the
 * village ledger; food is only there (the one food stock), other goods also count toward their LOD
 * resource in town stock.
 */
export function deliverToTown(state: SimState, townId: string, itemId: string, qty: number, personId: string): boolean {
  const res = ITEM_BY_ID.get(itemId)?.economyResourceId;
  const town = state.towns?.[townId];
  const short = !!res && !!town && isShortOf(state, townId, res);
  supplyTown(state, townId, itemId, qty);
  if (!res || !town) return false;
  if (!isFoodRes(res)) town.stock[res] = (town.stock[res] ?? 0) + qty;
  if (!short) return false;
  town.despair = Math.max(0, town.despair - ITEMS.deeds.shortageDespairRelief * qty);
  encodeUnspokenForState(state, 'gift_give', personId, { tags: ['supply_relief', res] });
  return true;
}

function gift(state: SimState, personId: string, selected?: string): DeedGoodsResult {
  const chosen = selected && selected !== 'coin' && hasItem(state, selected) ? selected : undefined;
  const g = chosen ? { itemId: chosen, affinity: giftAffinity(state, personId, chosen) } : bestGift(state, personId);
  if (!g) return { ok: false, line: 'You have nothing to give. Gather something first.' };
  removeItem(state, g.itemId);
  giveInstance(state, g.itemId, personId);
  const toPlan = contributeToPlan(state, personId, g.itemId);
  const relief = toPlan ? false : deliverToTown(state, townOf(state, personId), g.itemId, 1, personId);
  const feel = g.affinity >= 2 ? 'holds it close' : g.affinity > 0 ? 'smiles' : 'accepts it politely';
  return { ok: true, itemId: g.itemId, line: `${first(personId)} ${feel} (${itemName(g.itemId)}).${relief ? ' The town needed that.' : ''}${toPlan ? ` ${toPlan}` : ''}` };
}

function trade(state: SimState, personId: string, selected?: string): DeedGoodsResult {
  const townId = townOf(state, personId);
  const goods = listStacks(state).filter((s) => s.item.id !== 'coin' && s.item.economyResourceId);
  if (goods.length) {
    goods.sort((a, b) => priceAt(state, townId, b.item.id) - priceAt(state, townId, a.item.id));
    const it = goods.find((g) => g.item.id === selected)?.item ?? goods[0]!.item;
    const coin = Math.round(priceAt(state, townId, it.id) * ITEMS.deeds.tradeMarkup);
    removeItem(state, it.id);
    consumeInstance(state, it.id);
    addItem(state, 'coin', coin);
    const relief = deliverToTown(state, townId, it.id, 1, personId);
    return { ok: true, itemId: it.id, line: `Traded ${it.name} for ${coin} coin.${relief ? ' They were short of it.' : ''}` };
  }
  const cost = priceAt(state, townId, 'bread');
  if (!hasItem(state, 'coin', cost)) return { ok: false, line: 'Nothing to trade and no coin.' };
  removeItem(state, 'coin', cost);
  addItem(state, 'bread', 1);
  return { ok: true, line: `Bought Bread for ${cost} coin.` };
}

/**
 * A share of someone's work yield (their job's yield table, seeded per day and person). No longer a ring
 * deed (work_alongside is gone: helping is doing, hold-to-work on their task); kept for that path to pay out.
 */
export function workYield(state: SimState, personId: string): DeedGoodsResult {
  const rng = deriveRng(state.seed, 'work', state.day, personId);
  const got: string[] = [];
  const job = jobOf(state, personId);
  for (const y of job.yield) {
    if (y.chance !== undefined && rng.next() >= y.chance) continue;
    addItem(state, y.itemId, y.qty);
    if (y.itemId !== 'coin') for (let k = 0; k < y.qty; k++) mintInstance(state, y.itemId, personId, townOf(state, personId));
    got.push(`${y.qty} ${itemName(y.itemId)}`);
  }
  return { ok: true, line: `You work alongside ${first(personId)} the ${job.name}. +${got.join(', +')}` };
}

/** Run the item side of a goods deed. ok=false means the deed should not resolve. */
export function applyDeedGoods(state: SimState, deedId: string, personId: string, selected?: string): DeedGoodsResult | null {
  if (deedId === 'gift_give') return gift(state, personId, selected);
  if (deedId === 'trade_fair') return trade(state, personId, selected);
  return null;
}
