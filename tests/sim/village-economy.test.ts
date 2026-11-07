import { describe, expect, it } from 'vitest';
import { scarcity, supplyTown, tickVillageEconomy, townNeeds } from '../../src/sim/economy/village-economy';
import { jobOf, JOBS } from '../../src/sim/goods/jobs';
import { priceAt } from '../../src/sim/goods/deed-goods';
import type { SimState } from '../../src/sim/types/runtime';

const town = (n: number, seed = 3): SimState => {
  const people: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) people[`p${i}`] = { id: `p${i}`, flame: 0.5, townId: 'ash' };
  return { seed, day: 1, people } as unknown as SimState;
};
const run = (s: SimState, days: number): SimState => { for (let i = 0; i < days; i++) { s.day += 1; tickVillageEconomy(s); } return s; };

describe('village economy', () => {
  it('is deterministic over 30 dawns', () => {
    expect(JSON.stringify(run(town(24), 30).villageEconomy)).toBe(JSON.stringify(run(town(24), 30).villageEconomy));
  });
  it('produces goods from jobs and records need', () => {
    const s = run(town(24), 10);
    const l = s.villageEconomy!.towns.ash!;
    expect(Object.values(l.goods).some((q) => q > 0)).toBe(true);
    expect(l.need.food).toBeCloseTo(24 * 0.25);
  });
  it('a town with no food producers goes short, then price rises; supplying relieves it', () => {
    const s = { seed: 3, day: 1, people: {} } as unknown as SimState;
    const makesFood = ['farmer', 'fisher', 'baker', 'miller'];
    for (let i = 0, n = 0; n < 8; i++) if (!makesFood.includes(jobOf(s, `q${i}`).id)) { s.people[`q${i}`] = { id: `q${i}`, flame: 0.5, townId: 'ash' } as never; n++; }
    run(s, 3);
    expect(townNeeds(s, 'ash').some((n) => n.itemId === 'food')).toBe(true);
    expect(scarcity(s, 'ash', 'bread')).toBe(1);
    expect(priceAt(s, 'ash', 'bread')).toBe(6);
    supplyTown(s, 'ash', 'bread', 50);
    expect(scarcity(s, 'ash', 'bread')).toBe(0);
  });
  it('processors only run when their inputs are in stock', () => {
    expect(JOBS.find((j) => j.id === 'baker')!.recipes[0]!.in).toEqual({ flour: 2 });
  });
});
