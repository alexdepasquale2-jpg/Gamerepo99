/**
 * Logistics: convoys and town contracts.
 *   convoy    a vehicle runs a standing route between your yard and another town, every trip loading what
 *             you named (up to its capacity), burning its fuel, and either hauling into your far yard or
 *             selling to the far town (better when the town is short; food into a hungry town eases it).
 *             Raiders take a share on bad roads and near wars; armour, flying and the Iron Road keep it.
 *   contract  towns post wants (their shortages, and goods the Works can make); deliver them from your
 *             yard in that town before the day runs out, for coin and renown. Arriving convoys fill them.
 * Pure + deterministic (deriveRng).
 */
import { scarcity, supplyTown } from '../economy/village-economy';
import { addItem, ITEM_BY_ID } from '../goods/inventory';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { DESIGN_BY_ID, GOODS, TUNING, goodName, goodPrice, isRation, plural, recipeEra, RECIPES, stockText } from './data';
import { addStock, bump, depotAt, eraOf, news, nextId, reachable, roadDays, stockOf, take, townName, worksIfAny, worksOf } from './state';
import type { Contract, Result, Route, Stock } from './types';
import { statsOf, vehicleById, wear } from './vehicles';

// ---- Convoys ----
export function openRoute(state: SimState, from: string, to: string, vehicleId: string, mode: Route['mode'], goods: string[]): Result {
  const v = vehicleById(state, vehicleId);
  if (!depotAt(state, from)) return { ok: false, line: 'A convoy starts from one of your yards.' };
  if (!v || v.townId !== from || v.job !== 'idle') return { ok: false, line: 'That vehicle is not standing idle in this yard.' };
  if (from === to) return { ok: false, line: 'A convoy needs somewhere to go.' };
  if (mode === 'haul' && !depotAt(state, to)) return { ok: false, line: `You keep no yard in ${townName(state, to)} to haul into. Sell there instead.` };
  if (!Number.isFinite(roadDays(state, from, to)) && !statsOf(v).flies) return { ok: false, line: 'No open road runs there.' };
  const w = worksOf(state);
  v.job = 'convoy';
  w.routes.push({ id: nextId(w, 'route'), from, to, vehicleId, mode, goods, on: true, trips: 0, status: 'loading at dawn' });
  return { ok: true, line: `${v.name} will run ${mode === 'haul' ? 'goods' : 'goods to market'} to ${townName(state, to)}, starting at dawn.` };
}
export const routeById = (state: SimState, id: string): Route | undefined => worksIfAny(state)?.routes.find((r) => r.id === id);
/** Stop a route: the vehicle finishes its trip and stands idle where it ends. */
export function closeRoute(state: SimState, routeId: string): Result {
  const w = worksOf(state);
  const r = routeById(state, routeId);
  if (!r) return { ok: false, line: 'No such route.' };
  const v = vehicleById(state, r.vehicleId);
  if (r.leg) { r.on = false; return { ok: true, line: `${v?.name ?? 'The convoy'} will stand down when it gets back.` }; }
  w.routes = w.routes.filter((x) => x !== r);
  if (v) v.job = 'idle';
  return { ok: true, line: `${v?.name ?? 'The convoy'} stands down.` };
}

function raidOdds(state: SimState, r: Route): number {
  const v = vehicleById(state, r.vehicleId)!;
  const s = statsOf(v);
  if (s.flies || worksIfAny(state)?.boons.includes('trade')) return 0;
  const war = (state.polity?.wars ?? []).some((x) => x.status === 'active' && [x.aggressor, x.defender].some((t) => t === r.from || t === r.to)) ? 0.12 : 0;
  const worn = (state.economyRoutes ?? []).filter((e) => [e.fromTownId, e.toTownId].includes(r.from) || [e.fromTownId, e.toTownId].includes(r.to));
  const bad = worn.length ? 1 - worn.reduce((n, e) => n + e.condition, 0) / worn.length : 0;
  return Math.max(0, (TUNING.raidBase + war + bad * 0.1) * (1 - s.armor * TUNING.raidPerArmor));
}

function legDays(state: SimState, r: Route): number {
  const v = vehicleById(state, r.vehicleId)!;
  const s = statsOf(v);
  const road = roadDays(state, r.from, r.to);
  const base = Number.isFinite(road) ? road : 2;
  const fast = worksIfAny(state)?.boons.includes('trade') ? 2 : 1;
  return Math.max(1, Math.ceil(base / (s.speed * fast)));
}

function load(state: SimState, r: Route, cap: number): Stock {
  const stock = stockOf(state, r.from);
  const wants = r.goods.length ? r.goods : Object.keys(stock).sort();
  const out: Stock = {};
  let room = cap;
  for (const id of wants) {
    const q = Math.min(room, stock[id] ?? 0);
    if (q <= 0) continue;
    out[id] = q;
    addStock(state, r.from, id, -q);
    room -= q;
    if (room <= 0) break;
  }
  return out;
}

/** Sell a load to a town: coin (dearer where it is short), goods into its stores, relief for hunger. */
export function sellTo(state: SimState, townId: string, goods: Stock): number {
  const w = worksOf(state);
  let coin = 0;
  let food = 0;
  for (const [id, q] of Object.entries(goods)) {
    const short = ITEM_BY_ID.has(id) ? scarcity(state, townId, id) : 0;
    coin += Math.round(goodPrice(id) * q * (0.8 + short));
    if (ITEM_BY_ID.has(id)) supplyTown(state, townId, id, q);
    if (isRation(id) || GOODS.find((g) => g.id === id)?.kind === 'meal') food += q;
  }
  if (food > 0) relieve(state, townId, food);
  addItem(state, 'coin', coin);
  bump(w, 'trade_coin', coin);
  return coin;
}

/** Food into a town eases its despair (more so when it is hungry); a hungry town fed counts for the Hearth arc. */
export function relieve(state: SimState, townId: string, food: number): void {
  const t = state.towns?.[townId];
  if (!t) return;
  const hungry = t.despair > 0.2 || scarcity(state, townId, 'bread') > 0;
  t.despair = Math.max(0, t.despair - TUNING.reliefDespair * Math.min(3, food / 4) * (hungry ? 2 : 1));
  const w = worksOf(state);
  if (hungry && !w.fedTowns.includes(townId)) w.fedTowns.push(townId);
}

export function tickConvoys(state: SimState): void {
  const w = worksIfAny(state);
  if (!w) return;
  for (const r of [...w.routes]) {
    const v = vehicleById(state, r.vehicleId);
    if (!v) { w.routes = w.routes.filter((x) => x !== r); continue; }
    if (!r.leg) {
      if (!r.on) { w.routes = w.routes.filter((x) => x !== r); v.job = 'idle'; continue; }
      const fuel = DESIGN_BY_ID.get(v.design)!.fuel;
      if (Object.keys(fuel).length && !take(state, r.from, fuel, false)) { r.status = `no ${stockText(fuel)} for fuel`; continue; }
      const goods = load(state, r, statsOf(v).cap);
      if (!Object.keys(goods).length) { give(state, r.from, fuel); r.status = 'nothing to load'; continue; }
      const rng = deriveRng(state.seed, 'works-raid', state.day, r.id);
      if (rng.next() < raidOdds(state, r)) {
        for (const id of Object.keys(goods)) { goods[id] = Math.floor(goods[id]! / 2); if (!goods[id]) delete goods[id]; }
        wear(v, 3);
        news(state, `Raiders hit ${v.name} on the road out of ${townName(state, r.from)} and took half the load.`, undefined, r.from);
        bump(w, 'raided');
      }
      r.leg = { dir: 'out', daysLeft: legDays(state, r), load: goods };
      r.status = `on the road: ${stockText(goods)}`;
    }
    r.leg.daysLeft--;
    if (r.leg.daysLeft > 0) continue;
    if (r.leg.dir === 'out') {
      v.townId = r.to;
      deliver(state, r, r.leg.load);
      r.leg = { dir: 'back', daysLeft: legDays(state, r), load: {} };
      r.status = 'coming back';
    } else {
      v.townId = r.from;
      wear(v);
      r.trips++;
      r.leg = undefined;
      r.status = 'loading at dawn';
    }
  }
}
const give = (state: SimState, townId: string, s: Stock): void => { for (const [id, n] of Object.entries(s)) addStock(state, townId, id, n); };

function deliver(state: SimState, r: Route, goods: Stock): void {
  const w = worksOf(state);
  bump(w, 'deliveries');
  const v = vehicleById(state, r.vehicleId)!;
  if (r.mode === 'haul' && depotAt(state, r.to)) {
    give(state, r.to, goods);
    const filled = autoFill(state, r.to);
    news(state, `${v.name} came into your ${townName(state, r.to)} yard with ${stockText(goods)}.${filled ? ` ${filled}` : ''}`, undefined, r.to);
  } else {
    const coin = sellTo(state, r.to, goods);
    news(state, `${v.name} sold ${stockText(goods)} in ${townName(state, r.to)} for ${coin} coin.`, undefined, r.to);
  }
}

// ---- Contracts ----
/** Goods a town might post for: its shortages first, then things the Works makes in this Era. */
function wantable(state: SimState): string[] {
  const era = eraOf(state);
  const ids = new Set<string>();
  for (const r of RECIPES) if (recipeEra(r) <= era && r.line !== false) for (const id of Object.keys(r.out)) ids.add(id);
  return [...ids].filter((id) => GOODS.find((g) => g.id === id)?.kind !== 'project').sort();
}

export function tickContracts(state: SimState): void {
  const w = worksIfAny(state);
  if (!w || !Object.keys(w.depots).length) return;
  const lapsed = w.contracts.filter((c) => c.due < state.day);
  w.contracts = w.contracts.filter((c) => c.due >= state.day);
  for (const c of lapsed.slice(0, 1)) news(state, `${townName(state, c.townId)} gave up waiting for your ${goodName(c.good).toLowerCase()}.`, undefined, c.townId);
  if (w.contracts.length >= TUNING.contractsMax) return;
  const rng = deriveRng(state.seed, 'works-contract', state.day);
  if (rng.next() > 0.55) return;
  const near = new Set<string>();
  for (const d of Object.keys(w.depots)) { near.add(d); for (const t of reachable(state, d).filter((x) => x.days <= 6)) near.add(t.townId); }
  const towns = [...near].sort();
  const townId = towns[rng.int(0, towns.length)]!;
  const shorts = Object.entries(state.villageEconomy?.towns[townId]?.short ?? {}).filter(([id, q]) => q > 0 && ITEM_BY_ID.has(id)).map(([id]) => id).sort();
  const pool = shorts.length && rng.next() < 0.5 ? shorts : wantable(state);
  const good = pool[rng.int(0, pool.length)]!;
  if (!good || w.contracts.some((c) => c.townId === townId && c.good === good)) return;
  const qty = Math.max(2, Math.round((4 + rng.int(0, 9)) * (goodPrice(good) > 20 ? 0.25 : 1)));
  const coin = Math.round(goodPrice(good) * qty * 1.6 + 5 * eraOf(state));
  const c: Contract = { id: nextId(w, 'con'), townId, good, qty, coin, due: state.day + TUNING.contractDays };
  w.contracts.push(c);
  news(state, `${townName(state, townId)} is asking for ${qty} ${goodName(good).toLowerCase()}: ${coin} coin to whoever brings it by day ${c.due}.`, undefined, townId);
}

export function fulfil(state: SimState, contractId: string): Result {
  const w = worksOf(state);
  const c = w.contracts.find((x) => x.id === contractId);
  if (!c) return { ok: false, line: 'That contract is gone.' };
  if (!depotAt(state, c.townId)) return { ok: false, line: `Contracts are delivered from your yard in ${townName(state, c.townId)}. You keep none there.` };
  const have = stockOf(state, c.townId)[c.good] ?? 0;
  if (have < c.qty) return { ok: false, line: `Your ${townName(state, c.townId)} yard has ${have} of the ${c.qty} ${goodName(c.good).toLowerCase()}.` };
  addStock(state, c.townId, c.good, -c.qty);
  if (ITEM_BY_ID.has(c.good)) supplyTown(state, c.townId, c.good, c.qty);
  if (isRation(c.good)) relieve(state, c.townId, c.qty);
  addItem(state, 'coin', c.coin);
  w.renown += TUNING.renownPerContract;
  bump(w, 'contracts');
  bump(w, 'trade_coin', c.coin);
  w.contracts = w.contracts.filter((x) => x !== c);
  return { ok: true, line: `${townName(state, c.townId)} takes the ${goodName(c.good).toLowerCase()}: ${c.coin} coin and ${TUNING.renownPerContract} renown.` };
}

/** Fill whatever contracts a yard can now cover (after a convoy comes in). */
function autoFill(state: SimState, townId: string): string {
  const done = (worksIfAny(state)?.contracts ?? []).filter((c) => c.townId === townId && (stockOf(state, townId)[c.good] ?? 0) >= c.qty).map((c) => fulfil(state, c.id)).filter((r) => r.ok);
  return done.length ? `It filled ${plural(done.length, 'contract')}.` : '';
}
