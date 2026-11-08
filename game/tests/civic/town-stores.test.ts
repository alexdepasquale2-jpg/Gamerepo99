import { describe, expect, it } from 'vitest';
import { tickHauling } from '../../src/sim/civic/hauling';
import type { Site } from '../../src/sim/civic/sites';
import { makeStore, total } from '../../src/sim/civic/store';
import {
  GRANARY_CAPACITY, drawStores, netFlows, openTown, produce, spoilTown, storesOf, supplyStores, viewTotal, worldGoods,
} from '../../src/sim/civic/town-stores';
import { supplyTown } from '../../src/sim/economy/village-economy';
import type { SimState } from '../../src/sim/types/runtime';

/** One town with a ledger from before stores, and one working farm site run by ann with a hauler. */
function tiny(goods: Record<string, number> = { grain: 20, timber: 5 }): SimState {
  const site = {
    id: 'site_plan1', districtId: 'd', townId: 't1', kind: 'farm', building: 'farm', name: "Ann's Farm", source: { type: 'company', ref: 'co1' },
    plot: null, zone: 'farm', ownerId: 'ann', managerId: 'ann', workers: [], haulers: ['hal'], wage: 1, coin: 0,
    store: makeStore(40), status: 'working', founded: 1, history: [],
  } as unknown as Site;
  const person = (id: string) => ({ id, name: `${id} Test`, age: 40, townId: 't1' });
  return {
    day: 5, seed: 3, flags: {}, packets: [],
    player: { id: 'player', townId: 't1' },
    people: { ann: person('ann'), hal: person('hal') },
    villageEconomy: { towns: { t1: { goods: { ...goods }, need: { food: 1 }, short: {} } } },
    civic: { sites: { [site.id]: site }, log: { entries: [], keep: 50 }, left: {}, sick: {}, news: [] },
  } as unknown as SimState;
}
const ledger = (s: SimState) => s.villageEconomy!.towns.t1!.goods;
const farm = (s: SimState) => (s as unknown as { civic: { sites: Record<string, Site> } }).civic.sites.site_plan1!;

describe('town stores', () => {
  it('builds stores from an old ledger on first touch, goods for goods', () => {
    const s = tiny();
    const ts = openTown(s, 't1');
    expect(total(ts.granary, 'grain')).toBe(20);
    expect(total(ts.storehouse, 'timber')).toBe(5);
    expect(storesOf(s).flows['source:opening']).toBe(25);
    expect(worldGoods(s)).toBeCloseTo(netFlows(s), 9);
  });

  it('keeps the ledger a view of the stores, and folds in writes made behind its back', () => {
    const s = tiny();
    openTown(s, 't1');
    supplyTown(s, 't1', 'bread', 3);
    expect(ledger(s).bread).toBe(3);
    // A build plan draws straight off the ledger: the next call takes it out of the stores.
    ledger(s).timber! -= 2;
    ledger(s).rope = 1;
    openTown(s, 't1');
    expect(viewTotal(s, 't1', 'timber')).toBe(3);
    expect(viewTotal(s, 't1', 'rope')).toBe(1);
    expect(storesOf(s).flows['sink:outside']).toBe(2);
    expect(worldGoods(s)).toBeCloseTo(netFlows(s), 9);
  });

  it('puts production on the site shelves, overflow to the depot, and lets households eat from anywhere', () => {
    const s = tiny({});
    produce(s, 't1', farm(s), 'grain', 50);
    expect(total(farm(s).store, 'grain')).toBe(40);
    expect(viewTotal(s, 't1', 'grain')).toBe(50);
    expect(ledger(s).grain).toBe(50);
    expect(drawStores(s, 't1', 'grain', 45, 'sink:eaten')).toBe(45);
    expect(ledger(s).grain).toBeCloseTo(5, 9);
    expect(worldGoods(s)).toBeCloseTo(netFlows(s), 9);
  });

  it('overflows a full granary into the yard', () => {
    const s = tiny({});
    supplyStores(s, 't1', 'grain', GRANARY_CAPACITY + 10);
    const ts = openTown(s, 't1');
    expect(total(ts.granary)).toBe(GRANARY_CAPACITY);
    expect(total(ts.yard, 'grain')).toBe(10);
  });

  it('spoils food by shelter and keeps timber, as a named sink', () => {
    const s = tiny({ bread: 10, timber: 10 });
    openTown(s, 't1');
    const lost = spoilTown(s, 't1');
    expect(lost).toBeGreaterThan(0);
    expect(viewTotal(s, 't1', 'timber')).toBe(10);
    expect(storesOf(s).flows['sink:spoiled']).toBeCloseTo(lost, 12);
    expect(worldGoods(s)).toBeCloseTo(netFlows(s), 9);
  });

  it('haulers carry a site\'s output to the granary without making or losing any', () => {
    const s = tiny({});
    produce(s, 't1', farm(s), 'grain', 10);
    const before = worldGoods(s) - netFlows(s);
    tickHauling(s);
    const ts = openTown(s, 't1');
    expect(total(farm(s).store, 'grain')).toBeLessThan(10);
    expect(total(ts.granary, 'grain')).toBeGreaterThan(0);
    expect(worldGoods(s) - netFlows(s)).toBeCloseTo(before, 9);
    expect(ledger(s).grain).toBeCloseTo(viewTotal(s, 't1', 'grain'), 9);
  });
});
