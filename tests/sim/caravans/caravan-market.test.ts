/** Timber, ore and wool in the player trade panel, tied to the destination town's shortages. */
import { describe, expect, it } from 'vitest';
import { advanceCaravanTravel, tickCaravans } from '../../../src/sim/caravans';
import { PHASE_DAYS } from '../../../src/sim/caravan-visit';
import { aboard, offers, quote, scarcity, tradeGood, wagonDestination } from '../../../src/sim/goods/caravan-trade';
import { ITEMS, addItem } from '../../../src/sim/goods/inventory';
import { NODES, gatherNode, nodeKind, placeNodes, wildNodesIn } from '../../../src/sim/goods/nodes';
import { townNeeds } from '../../../src/sim/goods/town-needs';
import { loadState, saveState } from '../../../src/sim/save';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import type { CaravanMobile } from '../../../src/sim/caravans-types';
import type { DataTables } from '../../../src/sim/load-data';
import type { SimState } from '../../../src/sim/types/runtime';

function fixture(progress = 0.5, cargo = 'food_grain', qty = 4) {
  const { state } = bootPlayState(7, 'marrow');
  const route = state.economyRoutes![0]!;
  route.days = 1; route.condition = 1; route.broken = false;
  (state.data as DataTables).caravanSchedules = [{ id: 'cav_t', routeId: route.id, departDawnMod: 0, periodDays: 9999, cargoResourceId: cargo, qty, lean: 'good', maxConcurrent: 2 }];
  const m: CaravanMobile = { id: 'cav_t@0', scheduleId: 'cav_t', routeId: route.id, progress01: progress, heading: 'outbound', cargoResourceId: cargo, qty, dawnSpawned: 0, coin: 200 };
  state.caravans = [m];
  const to = state.towns![route.toTownId]!, from = state.towns![route.fromTownId]!;
  state.inventory = { coin: 100 };
  return { state, route, m, to, from };
}
const run = (s: SimState, days: number, step = 0.005) => { for (let t = 0; t < days; t += step) advanceCaravanTravel(s, step); };
const STOP = PHASE_DAYS.unloading + PHASE_DAYS.trading + PHASE_DAYS.departing;

describe('market goods', () => {
  it('timber, ore and wool are real items tied to economy resources', () => {
    expect(ITEMS.market.goods).toEqual(['timber', 'ore', 'wool']);
    for (const id of ITEMS.market.goods) {
      const it = ITEMS.items.find((i) => i.id === id)!;
      expect(it.economyResourceId).toBeTruthy();
      expect(it.price).toBeGreaterThan(0);
    }
    const res = ITEMS.market.goods.map((g) => ITEMS.items.find((i) => i.id === g)!.economyResourceId);
    expect(res).toEqual(['timber', 'ore_iron', 'wool']);
  });

  it('the panel offers all three on any wagon, plus the wagon\'s own cargo', () => {
    const { state, m } = fixture();
    expect(offers(state, m.id).map((o) => o.itemId)).toEqual(['timber', 'ore', 'wool', 'bread']);
    m.cargoResourceId = 'wool';
    expect(offers(state, m.id).map((o) => o.itemId)).toEqual(['timber', 'ore', 'wool']);
  });

  it('can be gathered: trees sometimes give timber, sheep give wool, veins give ore', () => {
    expect(nodeKind('sheep_flock')!.yields[0]!.itemId).toBe('wool');
    expect(nodeKind('ore_vein')!.yields[0]!.itemId).toBe('ore');
    const { state } = bootPlayState(7, 'marrow');
    state.inventory = {};
    let timber = 0;
    for (let d = 0; d < 80; d++) { state.day = d; state.worldNodes = {}; gatherNode(state, { id: `t#${d}`, kindId: 'tree', q: 0, r: 0 }); timber = state.inventory.timber ?? 0; }
    expect(timber).toBeGreaterThan(5);
    expect(timber).toBeLessThan(60); // a chance, not every swing
    gatherNode(state, { id: 's#1', kindId: 'sheep_flock', q: 0, r: 0 });
    expect(state.inventory.wool).toBeGreaterThan(0);
    // The placement table actually puts sheep in the world.
    const towns = [{ id: 'a', q: 50, r: 50 }, { id: 'b', q: 120, r: 80 }];
    // Wild nodes are collapsed on observation; look at the whole populated area.
    const nodes = [...placeNodes(7, towns, []), ...wildNodesIn(7, towns, 0, 0, 200, 140)];
    expect(nodes.some((n) => n.kindId === 'sheep_flock')).toBe(true);
    expect(NODES.kinds.every((k) => k.yields.every((y) => y.min >= 0))).toBe(true);
  });
});

describe('prices follow the destination town\'s shortage', () => {
  it('a short destination pays more for what it lacks and charges more for it', () => {
    const { state, m, to } = fixture();
    const timber = ITEMS.items.find((i) => i.id === 'timber')!;
    expect(wagonDestination(state, m)).toBe(to.id ?? state.economyRoutes![0]!.toTownId);
    to.stock.timber = 30;
    const flush = quote(state, m, timber);
    to.stock.timber = 0;
    const dry = quote(state, m, timber);
    expect(scarcity(state, state.economyRoutes![0]!.toTownId, 'timber')).toBe(1);
    expect(dry.short).toBe(true);
    expect(flush.short).toBe(false);
    expect(dry.sell).toBeGreaterThan(flush.sell);
    expect(dry.buy).toBeGreaterThan(flush.buy);
    expect(flush.sell).toBeLessThan(flush.buy); // the trader keeps a margin
  });
});

describe('trading with the wagon', () => {
  it('buys only what is aboard, with finite stock and your coin', () => {
    const { state, m } = fixture();
    expect(tradeGood(state, m.id, 'timber', true)).toMatch(/no Timber/);
    expect(tradeGood(state, m.id, 'bread', true)).toMatch(/^Bought Bread/);
    expect(m.qty).toBe(3);
    state.inventory!.coin = 0;
    expect(tradeGood(state, m.id, 'bread', true)).toMatch(/You need/);
  });

  it('selling timber to a grain wagon puts it in the hold and the trader pays coin', () => {
    const { state, m } = fixture();
    addItem(state, 'timber', 2);
    const coin = state.inventory!.coin!, wagonCoin = m.coin!;
    const msg = tradeGood(state, m.id, 'timber', false);
    expect(msg).toMatch(/^Sold Timber/);
    expect(m.hold).toEqual({ timber: 1 });
    expect(m.qty).toBe(4);
    expect(state.inventory!.timber).toBe(1);
    expect(state.inventory!.coin).toBeGreaterThan(coin);
    expect(m.coin).toBeLessThan(wagonCoin);
    expect(aboard(m, 'timber')).toBe(1);
    expect(tradeGood(state, m.id, 'wool', false)).toMatch(/Gather some Wool/);
    // You can buy your own goods back from the hold.
    expect(tradeGood(state, m.id, 'timber', true)).toMatch(/^Bought Timber/);
    expect(m.hold).toBeUndefined();
  });

  it('an empty-handed trader refuses when it has no coin', () => {
    const { state, m } = fixture();
    m.coin = 0;
    addItem(state, 'ore', 1);
    expect(tradeGood(state, m.id, 'ore', false)).toMatch(/no coin/);
    expect(state.inventory!.ore).toBe(1);
  });
});

describe('sold goods reach the town and ease its shortage', () => {
  it('hold goods unload into the destination town\'s stock; each unit into a shortage eases despair', () => {
    const { state, m, to, route } = fixture(0.99);
    to.stock.timber = 1; to.despair = 0.6; to.stock.food_grain = 30;
    addItem(state, 'timber', 3);
    for (let i = 0; i < 3; i++) tradeGood(state, m.id, 'timber', false);
    expect(m.hold).toEqual({ timber: 3 });
    advanceCaravanTravel(state, 0.02); // arrives, halts
    expect(m.phase).toBe('unloading');
    run(state, PHASE_DAYS.unloading + 0.01);
    expect(to.stock.timber).toBe(4);
    expect(to.despair).toBeCloseTo(0.6 - 3 * ITEMS.deeds.shortageDespairRelief, 5);
    expect(m.hold).toBeUndefined();
    expect(m.visit?.relieved ?? 0).toBeGreaterThanOrEqual(3);
    expect(route.toTownId).toBeTruthy();
  });

  it('goods into a well-stocked town just add stock, with no despair relief', () => {
    const { state, m, to } = fixture(0.99);
    to.stock.ore_iron = 8; to.despair = 0.6; to.stock.food_grain = 30;
    addItem(state, 'ore', 2);
    tradeGood(state, m.id, 'ore', false); tradeGood(state, m.id, 'ore', false);
    run(state, 0.02 + STOP);
    expect(to.stock.ore_iron).toBe(10); // stocked (not short): plain stock, nothing sold back
    expect(to.despair).toBeCloseTo(0.6, 5);
  });

  it('selling the wagon\'s own cargo mid-unload still comes off the wagon', () => {
    const { state, m, to } = fixture(0.99);
    to.stock.food_grain = 20;
    advanceCaravanTravel(state, 0.02);
    addItem(state, 'bread', 1);
    expect(tradeGood(state, m.id, 'bread', false)).toMatch(/^Sold Bread/);
    run(state, PHASE_DAYS.unloading + 0.01);
    expect(to.stock.food_grain).toBe(25);
    expect(m.qty).toBe(0);
  });

  it('wool sold after the outbound unload rides home and arrives there', () => {
    const { state, m, from } = fixture(0.99);
    state.towns![state.economyRoutes![0]!.toTownId]!.stock.food_grain = 30;
    from.stock.wool = 0; from.despair = 0.5;
    run(state, 0.02 + PHASE_DAYS.unloading + 0.002); // now trading at the far town
    expect(m.phase).toBe('trading');
    expect(wagonDestination(state, m)).toBe(state.economyRoutes![0]!.fromTownId);
    addItem(state, 'wool', 2);
    tradeGood(state, m.id, 'wool', false); tradeGood(state, m.id, 'wool', false);
    run(state, 3); // the return trip and the stop at home
    expect(from.stock.wool).toBe(2);
    expect(from.despair).toBeLessThan(0.5);
  });

  it('dawn settles the hold too, and it survives a save round trip', () => {
    const { state, m, to } = fixture(0.2);
    to.stock.timber = 0;
    addItem(state, 'timber', 2);
    tradeGood(state, m.id, 'timber', false); tradeGood(state, m.id, 'timber', false);
    const copy = loadState(saveState(state));
    expect(copy.caravans![0]!.hold).toEqual({ timber: 2 });
    for (let d = 0; d < 3; d++) tickCaravans(state, d);
    expect(to.stock.timber).toBe(2);
  });
});

describe('noticeboard link', () => {
  it('flags market-good shortages so players know a trader can carry them', () => {
    const { state, to } = fixture();
    to.stock.wool = 0; to.stock.fuel_cord = 0;
    const id = state.economyRoutes![0]!.toTownId;
    const needs = townNeeds(state, id);
    expect(needs.shortages.find((s) => s.resource === 'wool')?.tradeable).toBe(true);
    expect(needs.shortages.find((s) => s.resource === 'fuel_cord')?.tradeable).toBe(false);
  });
});
