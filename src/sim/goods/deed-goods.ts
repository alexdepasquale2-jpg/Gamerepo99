/** Deeds that move real items: gift, trade, carry, work alongside. Pure over SimState. */

import { deriveRng } from '../rng';
import { encodeUnspokenForState } from '../social/unspoken';
import type { SimState } from '../types/runtime';
import { consumeInstance, giveInstance, mintInstance } from './instances';
import { ITEMS, ITEM_BY_ID, addItem, bestGift, giftAffinity, hasItem, itemName, listStacks, removeItem } from './inventory';

export type DeedGoodsResult = { ok: boolean; line: string };
const GOODS_DEEDS = new Set(['gift_give', 'trade_fair', 'carry_goods', 'work_alongside']);
export const isGoodsDeed = (id: string): boolean => GOODS_DEEDS.has(id);

const first = (id: string): string => {
  const w = id.split(/[_-]/).filter(Boolean)[0] ?? id;
  return w[0]!.toUpperCase() + w.slice(1);
};

function townOf(state: SimState, personId: string): string {
  return state.people[personId]?.townId ?? state.player.townId ?? '';
}

function townStock(state: SimState, townId: string): Record<string, number> | undefined {
  return state.towns?.[townId]?.stock;
}

/** Coin value of an item at a town: base price, raised when the town is short of it. */
export function priceAt(state: SimState, townId: string, itemId: string): number {
  const item = ITEM_BY_ID.get(itemId);
  if (!item) return 0;
  const res = item.economyResourceId;
  const stock = res ? townStock(state, townId)?.[res] : undefined;
  const below = ITEMS.deeds.shortageBelow;
  const scarcity = stock === undefined ? 0 : Math.max(0, below - stock) / below;
  return Math.max(1, Math.round(item.price * (1 + scarcity)));
}

/** Bringing a good the town lacks: stock up, despair eases, a Blessing settles in. */
export function deliverToTown(state: SimState, townId: string, itemId: string, qty: number, personId: string): boolean {
  const res = ITEM_BY_ID.get(itemId)?.economyResourceId;
  const town = state.towns?.[townId];
  if (!res || !town) return false;
  const short = (town.stock[res] ?? 0) < ITEMS.deeds.shortageBelow;
  town.stock[res] = (town.stock[res] ?? 0) + qty;
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
  const relief = deliverToTown(state, townOf(state, personId), g.itemId, 1, personId);
  const feel = g.affinity >= 2 ? 'holds it close' : g.affinity > 0 ? 'smiles' : 'accepts it politely';
  return { ok: true, line: `${first(personId)} ${feel} (${itemName(g.itemId)}).${relief ? ' The town needed that.' : ''}` };
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
    return { ok: true, line: `Traded ${it.name} for ${coin} coin.${relief ? ' They were short of it.' : ''}` };
  }
  const cost = priceAt(state, townId, 'bread');
  if (!hasItem(state, 'coin', cost)) return { ok: false, line: 'Nothing to trade and no coin.' };
  removeItem(state, 'coin', cost);
  addItem(state, 'bread', 1);
  return { ok: true, line: `Bought Bread for ${cost} coin.` };
}

function carry(state: SimState, personId: string): DeedGoodsResult {
  const here = townOf(state, personId);
  const cargo = (state.cargo ??= []);
  const due = cargo.findIndex((c) => c.toTownId === here && c.fromPersonId !== personId);
  if (due >= 0) {
    const c = cargo[due]!;
    if (!hasItem(state, c.itemId, c.qty)) return { ok: false, line: `You need all ${c.qty} ${itemName(c.itemId)} to deliver this cargo.` };
    cargo.splice(due, 1);
    removeItem(state, c.itemId, c.qty);
    addItem(state, 'coin', ITEMS.deeds.carryRewardCoin);
    const relief = deliverToTown(state, here, c.itemId, c.qty, personId);
    return { ok: true, line: `Delivered ${c.qty} ${itemName(c.itemId)} from ${first(c.fromPersonId)}.${relief ? ' It eases the shortage.' : ''}` };
  }
  const towns = [...new Set(Object.values(state.people).map((p) => p.townId).filter((t): t is string => !!t && t !== here))].sort();
  if (!towns.length) return { ok: false, line: 'There is nowhere to carry it.' };
  const rng = deriveRng(state.seed, 'cargo', state.day, personId);
  const toTownId = towns[rng.int(0, towns.length)]!;
  const pool = ITEMS.items.filter((i) => i.economyResourceId);
  const itemId = pool[rng.int(0, pool.length)]!.id;
  const qty = ITEMS.deeds.carryCargoQty;
  addItem(state, itemId, qty);
  cargo.push({ itemId, qty, fromPersonId: personId, toTownId });
  return { ok: true, line: `${first(personId)} hands you ${qty} ${itemName(itemId)} for someone in ${first(toTownId)}.` };
}

function work(state: SimState, personId: string): DeedGoodsResult {
  const rng = deriveRng(state.seed, 'work', state.day, personId);
  const got: string[] = [];
  for (const y of ITEMS.deeds.workAlongsideYield) {
    if (y.chance !== undefined && rng.next() >= y.chance) continue;
    addItem(state, y.itemId, y.qty);
    for (let k = 0; k < y.qty; k++) mintInstance(state, y.itemId, personId, townOf(state, personId));
    got.push(`${y.qty} ${itemName(y.itemId)}`);
  }
  return { ok: true, line: `You work alongside ${first(personId)}. +${got.join(', +')}` };
}

/** Run the item side of a goods deed. ok=false means the deed should not resolve. */
export function applyDeedGoods(state: SimState, deedId: string, personId: string, selected?: string): DeedGoodsResult | null {
  if (deedId === 'gift_give') return gift(state, personId, selected);
  if (deedId === 'trade_fair') return trade(state, personId, selected);
  if (deedId === 'carry_goods') return carry(state, personId);
  if (deedId === 'work_alongside') return work(state, personId);
  return null;
}
