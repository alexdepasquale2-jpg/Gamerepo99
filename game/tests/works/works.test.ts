import { describe, expect, it } from 'vitest';
import type { SimState } from '../../src/sim/types/runtime';
import { arcsView, checkArcs, statOf } from '../../src/sim/works/arcs';
import { ARCS, BUILDINGS, DESIGNS, ERAS, GOODS, MODS, RECIPES } from '../../src/sim/works/data';
import { feast, launch, tickVoyage } from '../../src/sim/works/feast-voyage';
import { hireHand, startLine, tickLines } from '../../src/sim/works/lines';
import { fulfil, openRoute, tickConvoys } from '../../src/sim/works/logistics';
import { eat, make, raise } from '../../src/sim/works/make';
import { addStock, eraOf, openDepot, stockOf, worksOf } from '../../src/sim/works/state';
import { tickWorks } from '../../src/sim/works/tick';
import { assemble, buyWhole, fitMod, statsOf } from '../../src/sim/works/vehicles';
import { arm, enlist, march, powerOf, raiseBand, tickWar } from '../../src/sim/works/war';
import { ITEM_BY_ID } from '../../src/sim/goods/inventory';

/** Three towns on a line (t1 - t2 - t3), six residents in t1, two in t3, a full purse. */
function tiny(): SimState {
  const person = (id: string, townId = 't1') => ({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Test`, age: 30, townId, flame: 50 });
  return {
    day: 10, seed: 7, flags: {}, packets: [],
    player: { id: 'player', townId: 't1', spark: 60, sparkMax: 100, coin: 500, embodiment: {} },
    inventory: { coin: 500, wood: 10, stone: 6, clay: 4, tools: 3, timber: 6, nails: 6, rope: 4, cloth: 2, fish: 6, herbs: 6, bread: 6, flour: 6, berries: 6 },
    people: Object.fromEntries(['ann', 'bob', 'cat', 'dan', 'eve', 'fay'].map((id) => [id, person(id)]).concat([['gus', person('gus', 't3')], ['hal', person('hal', 't3')]])),
    towns: { t1: { id: 't1', despair: 0.1, stock: {}, economyOptIn: true }, t2: { id: 't2', despair: 0.3, stock: {}, economyOptIn: true }, t3: { id: 't3', despair: 0.2, stock: {}, economyOptIn: true } },
    villageEconomy: { towns: { t2: { goods: {}, need: { food: 2 }, short: { bread: 2 } } } },
    economyRoutes: [
      { id: 'r1', fromTownId: 't1', toTownId: 't2', days: 2, condition: 1, broken: false, extractive: false },
      { id: 'r2', fromTownId: 't2', toTownId: 't3', days: 2, condition: 1, broken: false, extractive: false },
    ],
  } as unknown as SimState;
}

describe('works tables', () => {
  it('every recipe, building, design and mod names goods and buildings that exist', () => {
    const goods = new Set([...GOODS.map((g) => g.id), ...ITEM_BY_ID.keys()]);
    const builds = new Set(BUILDINGS.map((b) => b.id));
    for (const r of RECIPES) {
      expect(builds.has(r.at), r.id).toBe(true);
      for (const id of [...Object.keys(r.in ?? {}), ...Object.keys(r.out)]) expect(goods.has(id), `${r.id}: ${id}`).toBe(true);
    }
    for (const b of BUILDINGS) for (const id of Object.keys(b.cost)) expect(goods.has(id), `${b.id}: ${id}`).toBe(true);
    for (const d of [...DESIGNS, ...MODS]) for (const id of Object.keys(d.parts)) expect(goods.has(id), `${d.id}: ${id}`).toBe(true);
    // Every works good is made somewhere.
    const made = new Set(RECIPES.flatMap((r) => Object.keys(r.out)));
    for (const g of GOODS) expect(made.has(g.id), g.id).toBe(true);
  });
  it('the eras climb, and five arcs of five tiers each', () => {
    expect(ERAS.map((e) => e.era)).toEqual([1, 2, 3, 4, 5]);
    expect(ARCS).toHaveLength(5);
    for (const a of ARCS) expect(a.tiers).toHaveLength(5);
  });
});

describe('the works loop', () => {
  it('a yard, a building, hand work, cooking, and the first arc steps', () => {
    const s = tiny();
    expect(openDepot(s, 't1').ok).toBe(true);
    expect(raise(s, 't1', 'workbench').ok).toBe(true);
    expect(raise(s, 't1', 'kitchen').ok).toBe(true);
    expect(raise(s, 't1', 'kiln').ok).toBe(false); // a later age
    for (let i = 0; i < 3; i++) expect(make(s, 't1', 'planks').ok).toBe(true);
    expect(stockOf(s, 't1').plank).toBe(9);
    expect(make(s, 't1', 'stew').ok).toBe(true);
    expect(make(s, 't1', 'rations').ok).toBe(true);
    expect(make(s, 't1', 'porridge').ok).toBe(false); // no grain
    const before = s.player.spark;
    expect(eat(s, 't1', 'stew').ok).toBe(true);
    expect(s.player.spark).toBe(before + 10);
    checkArcs(s);
    expect(statOf(s, 'made')).toBe(5);
    expect(worksOf(s).claimed['industry:0']).toBe(10);
    expect(arcsView(s).find((a) => a.arc.id === 'industry')!.done).toBe(1);
  });

  it('a line runs at dawn with hired hands, paid and fed, and stops when short', () => {
    const s = tiny();
    openDepot(s, 't1');
    raise(s, 't1', 'workbench');
    raise(s, 't1', 'kitchen');
    const { lineId } = startLine(s, 't1', 'planks');
    expect(hireHand(s, lineId!).ok).toBe(true);
    expect(hireHand(s, lineId!).ok).toBe(true);
    expect(hireHand(s, lineId!).ok).toBe(false); // level 1 caps at 2
    addStock(s, 't1', 'timber', 3);
    tickLines(s);
    expect(stockOf(s, 't1').plank).toBe(6);
    expect(s.inventory!.coin).toBe(500 - 5 - 2);
    tickLines(s);
    expect(stockOf(s, 't1').plank).toBe(9);
    tickLines(s);
    expect(worksOf(s).lines[0]!.status).toMatch(/short/);
  });

  it('vehicles assemble from parts or are bought whole, take mods, and convoy goods to sell', () => {
    const s = tiny();
    openDepot(s, 't1');
    addStock(s, 't1', 'wheel', 2);
    addStock(s, 't1', 'cart_bed', 1);
    expect(assemble(s, 't1', 'handcart').ok).toBe(true);
    const cart = worksOf(s).vehicles[0]!;
    addStock(s, 't1', 'plank', 3);
    expect(fitMod(s, cart.id, 'cargo_rack').ok).toBe(true);
    expect(statsOf(cart).cap).toBe(14);
    addStock(s, 't1', 'bread', 10);
    expect(openRoute(s, 't1', 't2', cart.id, 'sell', ['bread']).ok).toBe(true);
    const coin = s.inventory!.coin!;
    for (let d = 0; d < 6; d++) { s.day++; tickConvoys(s); }
    expect(worksOf(s).stats.deliveries).toBeGreaterThanOrEqual(1);
    expect(s.inventory!.coin!).toBeGreaterThan(coin);
    expect(worksOf(s).fedTowns).toContain('t2');
    expect(buyWhole(s, 't1', 'landship').ok).toBe(false); // a later age
  });

  it('contracts are filled from the yard in that town', () => {
    const s = tiny();
    openDepot(s, 't1');
    worksOf(s).contracts.push({ id: 'c1', townId: 't1', good: 'plank', qty: 4, coin: 20, due: 20 });
    expect(fulfil(s, 'c1').ok).toBe(false);
    addStock(s, 't1', 'plank', 4);
    expect(fulfil(s, 'c1').ok).toBe(true);
    expect(worksOf(s).stats.contracts).toBe(1);
  });

  it('a fed, armed band marches on a town, takes it, and the vassal pays tribute', () => {
    const s = tiny();
    openDepot(s, 't1');
    worksOf(s).renown = 50; // Cart Age: barracks
    expect(eraOf(s)).toBe(2);
    worksOf(s).depots.t1!.buildings.push('barracks');
    expect(raiseBand(s, 't1').ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(enlist(s).ok).toBe(true);
    addStock(s, 't1', 'spear', 4);
    addStock(s, 't1', 'mail', 4);
    expect(arm(s).ok).toBe(true);
    expect(powerOf(s).soldiers).toBeGreaterThanOrEqual(4);
    expect(march(s, 't3').ok).toBe(false); // no rations
    addStock(s, 't1', 'ration', 40);
    expect(march(s, 't3').ok).toBe(true);
    for (let d = 0; d < 4; d++) { s.day++; tickWar(s); }
    const w = worksOf(s);
    expect((w.stats.victories ?? 0) + (w.stats.defeats ?? 0)).toBe(1);
    if (w.stats.victories) {
      expect(w.vassals.map((v) => v.townId)).toEqual(['t3']);
      const c = s.inventory!.coin!;
      s.day++;
      tickWar(s);
      expect(s.inventory!.coin!).toBeGreaterThan(c);
    }
  });

  it('feasts ease a town, and the airship voyages to the Far Spark', () => {
    const s = tiny();
    openDepot(s, 't1');
    addStock(s, 't1', 'feast_platter', 3);
    expect(feast(s, 't1').ok).toBe(true);
    expect(s.towns!.t1!.despair).toBe(0);
    worksOf(s).renown = 600;
    worksOf(s).depots.t1!.buildings.push('sky_dock');
    s.inventory!.coin = 2000;
    expect(buyWhole(s, 't1', 'airship').ok).toBe(true);
    for (let leg = 1; leg <= 3; leg++) {
      addStock(s, 't1', 'ration', 12);
      addStock(s, 't1', 'charcoal', 6);
      expect(launch(s, 't1').ok).toBe(true);
      for (let d = 0; d < 3 * leg; d++) tickVoyage(s);
    }
    expect(worksOf(s).stats.voyages).toBe(3);
  });

  it('the dawn tick runs on an empty world and on one with works', () => {
    const s = tiny();
    tickWorks(s);
    expect((s as { works?: unknown }).works).toBeUndefined();
    openDepot(s, 't1');
    for (let d = 0; d < 30; d++) { s.day++; tickWorks(s); }
    expect(worksOf(s).contracts.length).toBeGreaterThan(0);
  });
});
