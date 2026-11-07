import { describe, expect, it } from 'vitest';
import { economyLines, mapEconomy, townEconomyView } from '../../src/sim/economy/economy-view';
import type { SimState } from '../../src/sim/types/runtime';

function state(): SimState {
  return {
    seed: 1, day: 5,
    people: { m: { id: 'm', name: 'Marta Ellison', townId: 'a', flame: 50 } },
    towns: { a: {}, b: {} },
    economyRoutes: [{ id: 'r1', fromTownId: 'a', toTownId: 'b', days: 2, condition: 1, broken: false, facilityIds: [] }],
    villageEconomy: { towns: { a: { goods: {}, need: { food: 2 }, short: { food: 1.4, wood: 0.5 } } } },
    build: {
      plans: [{ id: 'plan1', ownerId: 'm', townId: 'a', kind: 'mill', claimId: 'c1', stage: 'gathering', have: { timber: 3 }, laborDone: 0, startDay: 1, stalledDays: 0 }],
      claims: [], next: 2,
    },
    logistics: { requests: [], carts: [{ id: 'c', itemId: 'bread', qty: 5, fromTownId: 'b', toTownId: 'a', legs: [{ routeId: 'r1', from: 'b', to: 'a', days: 2 }], roadDays: 2, daysLeft: 1, requestId: 'q' }], next: 2, lost: 0, delivered: 0 },
    companies: { list: [{ id: 'co1', planId: 'p', name: "Zell's Mill", ownerId: 'm', townId: 'a', kind: 'mill', workers: ['x'], coin: 3, founded: 1, revenue: 0, unpaid: {} }], next: 2, purse: {} },
    polity: { relations: { 'a|b': { a: 'a', b: 'b', trust: 70, feud: 0, treaty: 'alliance', since: 1, lastWar: -999 } }, wars: [], knowledge: {}, tech: { a: ['masonry'] }, faiths: { a: { creed: 'hearth', founded: 1, shrine: 's' } }, next: 1 },
  } as unknown as SimState;
}

describe('economy view', () => {
  it('summarises a town: shortages, carts, plans with progress and missing goods, workshops, neighbours, faith', () => {
    const v = townEconomyView(state(), 'a');
    expect(v.short.map((s) => s.itemId)).toEqual(['food', 'wood']);
    expect(v.incoming).toEqual([{ itemId: 'bread', qty: 5, daysLeft: 1, from: 'b' }]);
    expect(v.plans).toHaveLength(1);
    expect(v.plans[0]!.owner).toBe('Marta');
    expect(v.plans[0]!.progress).toBeGreaterThan(0);
    expect(v.plans[0]!.progress).toBeLessThan(0.5);
    expect(v.plans[0]!.missing.find((m) => m.itemId === 'timber')!.qty).toBe(3);
    expect(v.companies).toEqual([{ name: "Zell's Mill", workers: 2 }]);
    expect(v.neighbours).toEqual([{ townId: 'b', treaty: 'alliance', war: false }]);
    expect(v.creed).toBe('The Hearth Way');
    expect(v.techs).toEqual(['Masonry']);
  });
  it('writes noticeboard lines with the needs and how to help', () => {
    const lines = economyLines(townEconomyView(state(), 'a'), (id) => id.toUpperCase());
    const text = lines.join('\n');
    expect(text).toContain('The town is short of');
    expect(text).toContain('food');
    expect(text).toContain('5 bread from B, 1 day out');
    expect(text).toContain("Marta's mill");
    expect(text).toContain('needs 3 timber');
    expect(text).toContain('goes to their site');
    expect(text).toContain('B: allied');
    expect(text).toContain('Faith: The Hearth Way');
  });
  it('an empty town writes nothing', () => {
    const s = { seed: 1, day: 1, people: {}, towns: { a: {} } } as unknown as SimState;
    expect(economyLines(townEconomyView(s, 'a'), (i) => i)).toEqual([]);
  });
  it('map data: carts on roads, treaty and war lines, reach', () => {
    const s = state();
    let m = mapEconomy(s, () => 20);
    expect(m.carts).toEqual([{ routeId: 'r1', from: 'b', to: 'a', f: 0.5 }]);
    expect(m.links).toEqual([{ a: 'a', b: 'b', kind: 'alliance' }]);
    expect(m.reach).toEqual({ a: 20, b: 20 });
    s.polity!.wars.push({ id: 'w', aggressor: 'a', defender: 'b', started: 1, duration: 9, raids: 0, status: 'active' });
    m = mapEconomy(s, () => 20);
    expect(m.links).toEqual([{ a: 'a', b: 'b', kind: 'war' }]);
  });
});
