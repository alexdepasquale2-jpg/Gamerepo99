import { describe, expect, it } from 'vitest';
import { spendTreasury, worksDawnLines, worksIfAny, WORKS } from '../../src/sim/contrib/council-works';
import { chronicleJuice } from '../../src/sim/chronicle';
import { granaryFood, netFlows, openTown, storesOf, worldGoods } from '../../src/sim/civic/town-stores';
import { civicOf } from '../../src/sim/civic/zoning';
import { ROADS } from '../../src/sim/economy/roads';
import type { SimState } from '../../src/sim/types/runtime';

/** One town (t1) with two residents, a road to t2, one idle mill on it, and a council with coin. */
function tiny(): SimState {
  const person = (id: string, flame = 40) => ({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Test`, age: 40, townId: 't1', flame });
  const s = {
    day: 30, seed: 9, flags: {}, packets: [],
    player: { id: 'player', townId: 't1' },
    people: { ann: person('ann'), bob: person('bob') },
    towns: { t1: { despair: 0 }, t2: { despair: 0 } },
    villageEconomy: { towns: { t1: { goods: { grain: 2 }, need: { food: 4 }, short: {} } } },
    economyRoutes: [{ id: 'r1', fromTownId: 't1', toTownId: 't2', days: 2, condition: 0.9, broken: false, extractive: false, facilityIds: ['f1'] }],
    data: { facilities: [{ id: 'f1', name: 'Low Mill', kind: 'mill', q: 1, r: 1, routeId: 'r1', townIds: ['t1', 't2'], workTags: [], outputs: [], staffedMul: 1 }] },
    facilityStaff: { f1: { crew: [null], staffed: 0, idle: true, changedDay: 30 } },
  } as unknown as SimState;
  openTown(s, 't1');
  civicOf(s, 't1').treasury = 200;
  return s;
}

describe('council works', () => {
  it('buys grain into a thin granary from outside: coin out of the treasury, goods in as a named purchase', () => {
    const s = tiny();
    const before = granaryFood(s, 't1');
    spendTreasury(s, 't1', civicOf(s, 't1'), 'ann', ['ann', 'bob']);
    const got = granaryFood(s, 't1') - before;
    expect(got).toBeGreaterThan(0);
    expect(granaryFood(s, 't1')).toBeLessThanOrEqual(4 * WORKS.food.toDays + 1e-9);
    expect(storesOf(s).flows['source:purchase']).toBeCloseTo(got, 9);
    expect(worldGoods(s)).toBeCloseTo(netFlows(s), 9);
    expect(civicOf(s, 't1').treasury).toBeLessThan(200);
    expect(worksDawnLines(s).join(' ')).toMatch(/^Ann says .*sacks of grain/);
    // Not again inside its gap.
    s.villageEconomy!.towns.t1!.need.food = 1000;
    const t = civicOf(s, 't1').treasury;
    spendTreasury(s, 't1', civicOf(s, 't1'), 'ann', ['ann', 'bob']);
    expect(civicOf(s, 't1').treasury).toBe(t);
  });

  it('pays a resident to mend a broken road, up to the crews\' ceiling, and reopens it', () => {
    const s = tiny();
    s.villageEconomy!.towns.t1!.need.food = 0;
    const r = s.economyRoutes![0]!;
    r.condition = 0.4; r.broken = true;
    spendTreasury(s, 't1', civicOf(s, 't1'), 'ann', ['ann', 'bob']);
    expect(r.condition).toBeCloseTo(Math.min(ROADS.crewCeiling, 0.4 + WORKS.road.gain), 9);
    expect(r.broken).toBe(false);
    const purse = Object.values(s.companies!.purse).reduce((a, b) => a + b, 0);
    expect(purse).toBe(WORKS.road.wage + 0); // the mill is not derelict yet (idle today)
    expect(worksIfAny(civicOf(s, 't1'))!.news.map((n) => n.kind)).toEqual(['road']);
  });

  it('re-crews a facility that has stood idle too long', () => {
    const s = tiny();
    s.villageEconomy!.towns.t1!.need.food = 0;
    s.facilityStaff!.f1!.changedDay = s.day - WORKS.repair.idleDays;
    spendTreasury(s, 't1', civicOf(s, 't1'), 'bob', ['ann', 'bob']);
    const f = s.facilityStaff!.f1!;
    expect(f.idle).toBe(false);
    expect(f.staffed).toBe(1);
    expect(['ann', 'bob']).toContain(f.crew[0]);
    expect(worksDawnLines(s)[0]).toMatch(/Low Mill/);
  });

  it('writes a rival creed rising into the chronicle', () => {
    const s = tiny();
    chronicleJuice(s, 'doctrine.rival', { doctrineId: 'doctrine_a', challengerId: 'doctrine_a_r1', townId: 't2' });
    chronicleJuice(s, 'doctrine.rival', { doctrineId: 'doctrine_a', challengerId: 'doctrine_a_r1', townId: 't2' });
    const rows = (s.history ?? []).filter((h) => h.kind === 'rival');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.townId).toBe('t2');
    expect(rows[0]!.summary).toMatch(/A R1|Doctrine A/i);
  });
});
