/**
 * Real shops: a market-square stall, a shop counter (or its keeper met in the street), a pedlar's pack and
 * a roadside wagon, all behind one interface. `shopStock` says what they sell and what they will take, at
 * what price; `quoteBasket` prices a basket; `settle` moves the whole basket at once or nothing at all.
 *
 * Nothing is invented: a town shop sells out of its town's ledger (state.villageEconomy) and what you sell
 * goes back into it (deliverToTown, so a shortage eases); a pedlar sells their own pack; a wagon its cargo
 * and hold. Coin moves between your purse and the keeper's, which is finite (state.shops, created lazily)
 * and only drifts back toward its usual size at a new day. Pure and deterministic.
 */
import shopsJson from '../../data/items/shops.json';
import type { SimState } from '../types/runtime';
import { deriveRng } from '../rng';
import { HOUSEHOLD } from '../economy/village-economy';
import { isFoodRes } from '../economy/food-stock';
import { workJobId } from '../economy/companies';
import { visitorOf, type Visitor } from '../visitors';
import { offers } from './caravan-trade';
import { deliverToTown, priceAt } from './deed-goods';
import { consumeInstance, mintInstance } from './instances';
import { noteUse } from '../data-use-world';
import { ITEMS, ITEM_BY_ID, addItem, inventoryOf, itemName, removeItem } from './inventory';

export type ShopKindId = 'general' | 'baker' | 'smith' | 'produce' | 'pedlar' | 'wagon';
type KindRow = { name: string; sells: string[]; buys: string[]; markup: number; purse: number };
type ShopsTable = {
  kinds: Record<Exclude<ShopKindId, 'wagon'>, KindRow>;
  jobKind: Record<string, ShopKindId>;
  stallJobs: string[]; keeperJobs: string[];
  maxStock: number; reserveDays: number; restock: number; wagonCoin: number;
  tone: { cheap: number; dear: number };
  lines: Record<'bought' | 'sold' | 'both', string[]>;
};
export const SHOPS = shopsJson as unknown as ShopsTable;

/**
 * Who you are dealing with. `stall`: a town's market-square stall (id = townId). `counter`: a shop building's
 * counter (id = buildingId `${townId}:${slot}`; keeperId when the scene knows who is behind it). `keeper`: a
 * shopkeeper, baker or smith met anywhere (id = personId). `pedlar`: a visiting pedlar (id = their person id).
 * `wagon`: a roadside caravan (id = caravan id).
 */
export type ShopRef = { kind: 'stall' | 'counter' | 'keeper' | 'pedlar' | 'wagon'; id: string; keeperId?: string };
export type Basket = { buy: Record<string, number>; sell: Record<string, number> };
export type PriceTone = 'cheap' | 'fair' | 'dear';

export type ShopLine = {
  itemId: string; name: string;
  /** Coin per unit (what you pay in "theirs", what you get in "yours"). 0 = they won't take it. */
  price: number;
  /** What the same unit costs at the usual price (base price x market factor), for the chip's colour. */
  normal: number;
  tone: PriceTone;
  /** Theirs: units on offer. Yours: units in your satchel. */
  count: number;
  /** Yours only: they won't buy this. */
  refused?: boolean;
};

export type ShopView = {
  ref: ShopRef;
  /** Stable key of the keeper's purse (also the dev/QA handle). */
  key: string;
  kind: ShopKindId;
  title: string;
  townId?: string;
  /** The person who speaks for the shop (none for a wagon driver). */
  keeperId?: string;
  theirs: ShopLine[];
  yours: ShopLine[];
  purse: number;
  coin: number;
  /** Why there is no trade at all (wagon gone, pedlar left), else undefined. */
  closed?: string;
};

export type BasketLine = { itemId: string; name: string; side: 'buy' | 'sell'; qty: number; unit: number; total: number };
export type BasketQuote = {
  lines: BasketLine[];
  /** Coin you pay out / take in. */
  out: number; in: number;
  /** in - out: what your purse changes by. */
  net: number;
  coinAfter: number; purseAfter: number;
  ok: boolean;
  /** Why it can't settle (first reason), when !ok. */
  reason?: string;
};
export type SettleResult = { ok: boolean; line: string; keeperId?: string; say?: string; quote: BasketQuote };

/** A keeper's till (state.shops): coin, the day it was last counted, deals struck, and a pedlar's bought-in pack. */
export type ShopPurse = { coin: number; day: number; deals: number; pack?: Record<string, number> };
type Purse = ShopPurse;

// ---- refs ----

export const shopKey = (ref: ShopRef): string => `${ref.kind}:${ref.id}`;

/** Parse `stall:<townId>`, `counter:<buildingId>`, `keeper:<id>`, `pedlar:<id>`, `wagon:<id>`. */
export function parseShopRef(s: string): ShopRef | null {
  const c = s.indexOf(':');
  const kind = s.slice(0, c);
  if (c <= 0 || !['stall', 'counter', 'keeper', 'pedlar', 'wagon'].includes(kind)) return null;
  return { kind: kind as ShopRef['kind'], id: s.slice(c + 1) };
}

/** A `stall` target id names a market stall (a town id) or, holding the slot, a shop counter (a building id). */
export function shopRefOfStall(id: string, keeperId?: string): ShopRef {
  return id.includes(':') ? { kind: 'counter', id, ...(keeperId ? { keeperId } : {}) } : { kind: 'stall', id };
}

const alive = (state: SimState, id: string | undefined): string | undefined => (id && state.people[id] && id !== state.player.id ? id : undefined);
const townsfolk = (state: SimState, townId: string): string[] =>
  Object.keys(state.people).filter((id) => id !== state.player.id && state.people[id]!.townId === townId && !visitorOf(state, id)).sort();

/** Someone of the town to mind it: preferring the given jobs, picked by seed so it is always the same face. */
function pickKeeper(state: SimState, townId: string, jobs: string[], salt: string): string | undefined {
  const folk = townsfolk(state, townId);
  const fit = folk.filter((id) => jobs.includes(workJobId(state, id)));
  const pool = fit.length ? fit : folk;
  return pool.length ? pool[deriveRng(state.seed, 'shop-keeper', salt).int(0, pool.length)] : undefined;
}

/** A pedlar who is still about with something in their pack or purse. */
const pedlarOf = (state: SimState, id: string): Visitor | undefined => {
  const v = visitorOf(state, id);
  return v?.kind === 'pedlar' && state.people[id] ? v : undefined;
};
const wagonOf = (state: SimState, id: string) => state.caravans?.find((c) => c.id === id);

/** Can this person be asked to show their wares (a pedlar, or a shopkeeper, baker or smith)? */
export function sellsWares(state: SimState, personId: string): boolean {
  if (pedlarOf(state, personId)) return true;
  return !!state.people[personId]?.townId && SHOPS.keeperJobs.includes(workJobId(state, personId));
}

/** A person's own shop ref: a pedlar's pack, else their counter (by keeper). */
export const shopRefOfPerson = (state: SimState, personId: string): ShopRef =>
  pedlarOf(state, personId) ? { kind: 'pedlar', id: personId } : { kind: 'keeper', id: personId };

type Resolved = { kind: ShopKindId; townId?: string; keeperId?: string; title: string; closed?: string };

function resolve(state: SimState, ref: ShopRef): Resolved {
  const kindOfKeeper = (id: string | undefined): ShopKindId => (id ? SHOPS.jobKind[workJobId(state, id)] ?? 'general' : 'general');
  const first = (id: string | undefined): string => (id ? (state.people[id]?.name ?? id).split(' ')[0]! : '');
  switch (ref.kind) {
    case 'stall': {
      const keeperId = pickKeeper(state, ref.id, SHOPS.stallJobs, `stall:${ref.id}`);
      return { kind: 'produce', townId: ref.id, keeperId, title: keeperId ? `Market stall · ${first(keeperId)}` : 'Market stall', closed: keeperId ? undefined : 'Nobody is minding the stall.' };
    }
    case 'counter': {
      const townId = ref.id.slice(0, Math.max(0, ref.id.lastIndexOf(':'))) || undefined;
      const keeperId = alive(state, ref.keeperId) ?? (townId ? pickKeeper(state, townId, ['shopkeeper'], `counter:${ref.id}`) : undefined);
      const kind = kindOfKeeper(keeperId);
      return { kind, townId, keeperId, title: `${SHOPS.kinds[kind as 'general'].name}${keeperId ? ` · ${first(keeperId)}` : ''}`, closed: keeperId ? undefined : 'Nobody is behind the counter.' };
    }
    case 'keeper': {
      const keeperId = alive(state, ref.id);
      const kind = kindOfKeeper(keeperId);
      return { kind, townId: keeperId ? state.people[keeperId]!.townId : undefined, keeperId, title: `${SHOPS.kinds[kind as 'general'].name}${keeperId ? ` · ${first(keeperId)}` : ''}`, closed: keeperId ? undefined : 'They are gone.' };
    }
    case 'pedlar': {
      const v = pedlarOf(state, ref.id);
      return { kind: 'pedlar', townId: v?.townId ?? v?.toTownId, keeperId: v ? ref.id : undefined, title: v ? `Pedlar · ${first(ref.id)}` : 'Pedlar', closed: v ? undefined : 'The pedlar has moved on.' };
    }
    case 'wagon':
      return { kind: 'wagon', title: 'Roadside trader', closed: wagonOf(state, ref.id) ? undefined : 'The wagon has moved on.' };
  }
}

// ---- purses ----

function purseOf(state: SimState, key: string, kind: ShopKindId): Purse {
  const all = (state.shops ??= {});
  const base = kind === 'wagon' ? SHOPS.wagonCoin : SHOPS.kinds[kind].purse;
  const p = (all[key] ??= { coin: base, day: state.day, deals: 0 });
  // A keeper's takings go to their household; by morning the till is back toward its usual float.
  if (p.day !== state.day) {
    if (p.coin < base) p.coin += Math.ceil((base - p.coin) * SHOPS.restock);
    p.day = state.day;
  }
  return p;
}
const purseKey = (ref: ShopRef, r: Resolved): string => (r.keeperId && ref.kind !== 'pedlar' ? `keeper:${r.keeperId}` : shopKey(ref));

// ---- stock and prices ----

const toneOf = (price: number, normal: number): PriceTone =>
  price < normal * SHOPS.tone.cheap ? 'cheap' : price > normal * SHOPS.tone.dear ? 'dear' : 'fair';
const line = (itemId: string, price: number, normal: number, count: number, refused?: boolean): ShopLine => ({
  itemId, name: itemName(itemId), price, normal, tone: refused ? 'fair' : toneOf(price, normal), count, ...(refused ? { refused } : {}),
});
const normalOf = (itemId: string, factor: number): number => Math.max(1, Math.round((ITEM_BY_ID.get(itemId)?.price ?? 1) * factor));

/** What the keeper will put out: the ledger, less one day of the town's own need, and never a mountain. */
function townAvailable(state: SimState, townId: string, itemId: string): number {
  const l = state.villageEconomy?.towns[townId];
  if (!l) return 0;
  const food = HOUSEHOLD.food.eats.includes(itemId);
  const need = food ? (l.need.food ?? 0) / HOUSEHOLD.food.eats.length : (l.need[itemId] ?? 0);
  return Math.max(0, Math.min(SHOPS.maxStock, Math.floor((l.goods[itemId] ?? 0) - need * SHOPS.reserveDays)));
}

function townPrices(state: SimState, townId: string, itemId: string, markup: number): { buy: number; sell: number } {
  const p = priceAt(state, townId, itemId);
  const buy = Math.max(1, Math.round(p * ITEMS.market.buyFactor * markup));
  // Never pay more than they ask, or the counter would be a coin pump.
  const sell = Math.min(buy, Math.max(1, Math.round(p * ITEMS.market.sellFactor)));
  return { buy, sell };
}

const pedlarBuyPrice = (state: SimState, v: Visitor, itemId: string): number =>
  // A pedlar undercuts the town they walk to by a coin: carrying the good is their living.
  Math.max(1, priceAt(state, v.toTownId ?? v.townId ?? '', itemId) - 1);

type Priced = { theirs: ShopLine[]; yours: ShopLine[] };

function priced(state: SimState, ref: ShopRef, r: Resolved, purse: Purse): Priced {
  const inv = inventoryOf(state);
  const held = ITEMS.items.filter((i) => i.id !== 'coin' && (inv[i.id] ?? 0) > 0);
  const bf = ITEMS.market.buyFactor, sf = ITEMS.market.sellFactor;
  if (r.closed) return { theirs: [], yours: held.map((i) => line(i.id, 0, normalOf(i.id, sf), inv[i.id]!, true)) };

  if (r.kind === 'wagon') {
    const m = wagonOf(state, ref.id)!;
    const offs = offers(state, m.id);
    const takes = new Map(offs.map((o) => [o.itemId, o]));
    return {
      theirs: offs.filter((o) => o.aboard > 0).map((o) => line(o.itemId, o.buy, normalOf(o.itemId, bf), o.aboard)),
      yours: held.map((i) => {
        const o = takes.get(i.id);
        return line(i.id, o?.sell ?? 0, normalOf(i.id, sf), inv[i.id]!, !o);
      }),
    };
  }

  const row = SHOPS.kinds[r.kind];
  const townId = r.townId ?? '';
  // A counter with no town behind it has no ledger to sell from or put goods into.
  if (!townId) return { theirs: [], yours: held.map((i) => line(i.id, 0, normalOf(i.id, sf), inv[i.id]!, true)) };
  if (r.kind === 'pedlar') {
    const v = pedlarOf(state, ref.id)!;
    const pack: Record<string, number> = { ...(purse.pack ?? {}) };
    if (v.item && (v.qty ?? 0) > 0) pack[v.item] = (pack[v.item] ?? 0) + v.qty!;
    return {
      theirs: Object.keys(pack).filter((id) => pack[id]! > 0 && ITEM_BY_ID.has(id)).sort().map((id) => line(id, pedlarBuyPrice(state, v, id), normalOf(id, bf), pack[id]!)),
      yours: held.map((i) => {
        const takes = row.buys.includes(i.id);
        return line(i.id, takes ? townPrices(state, townId, i.id, row.markup).sell : 0, normalOf(i.id, sf), inv[i.id]!, !takes);
      }),
    };
  }

  return {
    theirs: row.sells.flatMap((id) => {
      const n = ITEM_BY_ID.has(id) ? townAvailable(state, townId, id) : 0;
      return n > 0 ? [line(id, townPrices(state, townId, id, row.markup).buy, normalOf(id, bf), n)] : [];
    }),
    yours: held.map((i) => {
      const takes = row.buys.includes(i.id);
      return line(i.id, takes ? townPrices(state, townId, i.id, row.markup).sell : 0, normalOf(i.id, sf), inv[i.id]!, !takes);
    }),
  };
}

/** What this shop sells and takes, at what price, and both purses. */
export function shopStock(state: SimState, ref: ShopRef): ShopView {
  const r = resolve(state, ref);
  const key = purseKey(ref, r);
  const purse = r.closed ? { coin: 0, day: state.day, deals: 0 } : r.kind === 'wagon' ? { coin: (wagonOf(state, ref.id)!.coin ??= SHOPS.wagonCoin), day: state.day, deals: 0 } : purseOf(state, key, r.kind);
  const p = priced(state, ref, r, purse);
  return {
    ref, key, kind: r.kind, title: r.title, townId: r.townId, keeperId: r.keeperId,
    theirs: p.theirs, yours: p.yours, purse: purse.coin, coin: inventoryOf(state).coin ?? 0,
    ...(r.closed ? { closed: r.closed } : {}),
  };
}

// ---- baskets ----

const lines = (b: Record<string, number> | undefined): [string, number][] =>
  Object.entries(b ?? {}).filter(([, q]) => q !== 0).sort(([a], [z]) => a.localeCompare(z));

/** Price a basket against the shop as it stands now; ok=false carries the first reason it can't settle. */
export function quoteBasket(state: SimState, ref: ShopRef, basket: Basket, view: ShopView = shopStock(state, ref)): BasketQuote {
  const out: BasketLine[] = [];
  let reason: string | undefined;
  const fail = (why: string): void => { reason ??= why; };
  const theirs = new Map(view.theirs.map((l) => [l.itemId, l]));
  const yours = new Map(view.yours.map((l) => [l.itemId, l]));
  for (const [itemId, qty] of lines(basket.buy)) {
    const l = theirs.get(itemId);
    if (!Number.isInteger(qty) || qty < 0) { fail('A basket holds whole goods.'); continue; }
    if (!l) { fail(`They have no ${itemName(itemId)} to sell.`); continue; }
    if (qty > l.count) fail(`They only have ${l.count} ${l.name}.`);
    out.push({ itemId, name: l.name, side: 'buy', qty, unit: l.price, total: l.price * qty });
  }
  for (const [itemId, qty] of lines(basket.sell)) {
    const l = yours.get(itemId);
    if (itemId === 'coin' || !Number.isInteger(qty) || qty < 0) { fail('A basket holds whole goods.'); continue; }
    if (!l) { fail(`You have no ${itemName(itemId)}.`); continue; }
    if (l.refused) { fail(`They won't take ${l.name}.`); continue; }
    if (qty > l.count) fail(`You only have ${l.count} ${l.name}.`);
    out.push({ itemId, name: l.name, side: 'sell', qty, unit: l.price, total: l.price * qty });
  }
  const pay = out.filter((l) => l.side === 'buy').reduce((n, l) => n + l.total, 0);
  const get = out.filter((l) => l.side === 'sell').reduce((n, l) => n + l.total, 0);
  const coinAfter = view.coin - pay + get, purseAfter = view.purse + pay - get;
  if (view.closed) fail(view.closed);
  if (!out.length) fail('The basket is empty.');
  if (coinAfter < 0) fail(`You are ${-coinAfter} coin short.`);
  if (purseAfter < 0) fail(`They only have ${view.purse + pay} coin to give.`);
  return { lines: out, out: pay, in: get, net: get - pay, coinAfter, purseAfter, ok: !reason, ...(reason ? { reason } : {}) };
}

/** One unit off a wagon: its cargo pile first (unloading counts it), then the hold. Mirrors caravan-trade. */
function wagonTake(m: NonNullable<SimState['caravans']>[number], res: string): void {
  if (m.cargoResourceId === res && m.qty >= 1) { m.qty--; if (m.phase === 'unloading' && m.visit) m.visit.total = Math.max(m.visit.moved, m.visit.total - 1); }
  else if (m.hold?.[res]) { m.hold[res]!--; if (m.hold[res]! <= 0) delete m.hold[res]; if (!Object.keys(m.hold).length) delete m.hold; }
}
function wagonPut(m: NonNullable<SimState['caravans']>[number], res: string): void {
  if (m.cargoResourceId === res) { m.qty++; if (m.phase === 'unloading' && m.visit) m.visit.total++; }
  else (m.hold ??= {})[res] = (m.hold[res] ?? 0) + 1;
}

function sayLine(state: SimState, key: string, deals: number, q: BasketQuote): string {
  const bought = q.lines.filter((l) => l.side === 'buy'), sold = q.lines.filter((l) => l.side === 'sell');
  const set = bought.length && sold.length ? SHOPS.lines.both : bought.length ? SHOPS.lines.bought : SHOPS.lines.sold;
  const pick = set[deriveRng(state.seed, 'shop-say', state.day, key, deals).int(0, set.length)] ?? '';
  return pick.replace('{item}', (bought[0] ?? sold[0])?.name.toLowerCase() ?? 'goods');
}

/**
 * Settle a basket: everything moves, or nothing does. Coin and goods are conserved: what leaves your
 * satchel lands in the town's ledger, the pedlar's pack or the wagon, and every coin you pay is the keeper's.
 */
export function settle(state: SimState, ref: ShopRef, basket: Basket): SettleResult {
  const view = shopStock(state, ref);
  const q = quoteBasket(state, ref, basket, view);
  if (!q.ok) return { ok: false, line: q.reason ?? 'Not now.', quote: q };
  const r = resolve(state, ref);
  const m = r.kind === 'wagon' ? wagonOf(state, ref.id)! : undefined;
  const v = r.kind === 'pedlar' ? pedlarOf(state, ref.id)! : undefined;
  const purse = m ? undefined : purseOf(state, view.key, r.kind);
  const maker = r.keeperId ?? ref.id;

  // Coin first (net), then goods; validation above guarantees every step succeeds.
  addItem(state, 'coin', q.net);
  if (m) m.coin = (m.coin ?? SHOPS.wagonCoin) - q.net;
  else purse!.coin -= q.net;

  for (const l of q.lines) {
    const res = ITEM_BY_ID.get(l.itemId)?.economyResourceId;
    if (l.side === 'buy') {
      if (m) for (let k = 0; k < l.qty; k++) wagonTake(m, res ?? '');
      else if (v) {
        // The pack's own goods first, then the one good the pedlar walked in with.
        let left = l.qty;
        const fromPack = Math.min(left, purse!.pack?.[l.itemId] ?? 0);
        if (fromPack) { purse!.pack![l.itemId]! -= fromPack; if (!purse!.pack![l.itemId]) delete purse!.pack![l.itemId]; left -= fromPack; }
        if (left) v.qty = Math.max(0, (v.qty ?? 0) - left);
      } else {
        const g = state.villageEconomy!.towns[r.townId!]!.goods;
        g[l.itemId] = (g[l.itemId] ?? 0) - l.qty;
        // deliverToTown counts non-food goods in town stock too; buying takes them back out of both.
        const town = state.towns?.[r.townId!];
        if (res && town && !isFoodRes(res) && town.stock[res] !== undefined) town.stock[res] = Math.max(0, town.stock[res]! - l.qty);
      }
      addItem(state, l.itemId, l.qty);
      for (let k = 0; k < l.qty; k++) mintInstance(state, l.itemId, maker, r.townId ?? '');
    } else {
      removeItem(state, l.itemId, l.qty);
      for (let k = 0; k < l.qty; k++) consumeInstance(state, l.itemId);
      if (m) for (let k = 0; k < l.qty; k++) wagonPut(m, res ?? '');
      else if (v) { const pack = (purse!.pack ??= {}); pack[l.itemId] = (pack[l.itemId] ?? 0) + l.qty; }
      else deliverToTown(state, r.townId!, l.itemId, l.qty, r.keeperId ?? maker);
    }
  }
  if (purse) purse.deals++;
  noteUse('shops', r.kind);
  const say = r.keeperId ? sayLine(state, view.key, purse?.deals ?? 0, q) : undefined;
  const bits = [
    q.lines.filter((l) => l.side === 'buy').map((l) => `${l.qty} ${l.name}`).join(', '),
    q.lines.filter((l) => l.side === 'sell').map((l) => `${l.qty} ${l.name}`).join(', '),
  ];
  const summary = `${bits[0] ? `Bought ${bits[0]}` : ''}${bits[0] && bits[1] ? '; ' : ''}${bits[1] ? `sold ${bits[1]}` : ''}`;
  const coin = q.net === 0 ? 'even' : q.net > 0 ? `+${q.net} coin` : `${q.net} coin`;
  return { ok: true, line: `${summary[0]!.toUpperCase()}${summary.slice(1)} (${coin}).`, keeperId: r.keeperId, ...(say ? { say } : {}), quote: q };
}
