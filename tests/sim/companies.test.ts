import { describe, expect, it } from 'vitest';
import { BUILDINGS, tickBuildPlans } from '../../src/sim/economy/build-plans';
import { COMPANY, companiesIn, companyOf, purseOf, tickCompanies, workJobId } from '../../src/sim/economy/companies';
import { tickLogistics } from '../../src/sim/economy/logistics';
import { tickVillageEconomy } from '../../src/sim/economy/village-economy';
import type { SimState } from '../../src/sim/types/runtime';

const town = (n = 40, seed = 9): SimState => {
  const people: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) people[`p${i}`] = { id: `p${i}`, name: `Pat${i} Marsh`, flame: 0.5, townId: 'ash' };
  return { seed, day: 1, people } as unknown as SimState;
};
const stock = (s: SimState): void => { for (const b of BUILDINGS) for (const i of Object.keys(b.cost)) s.villageEconomy!.towns.ash!.goods[i] = 200; };
const step = (s: SimState): void => { s.day += 1; tickVillageEconomy(s); stock(s); tickBuildPlans(s); tickCompanies(s); tickLogistics(s); };
const run = (days = 200): SimState => { const s = town(); tickVillageEconomy(s); for (let i = 0; i < days; i++) step(s); return s; };

describe('companies', () => {
  it('a finished building with a trade becomes a named company owned by the builder', () => {
    const s = run();
    const c = companiesIn(s, 'ash')[0]!;
    expect(c).toBeDefined();
    expect(c.name).toMatch(/^Pat\d+'s /);
    expect(companyOf(s, c.ownerId)).toBe(c);
  });
  it('hires idle or same-trade villagers up to its slots, and they work the company trade', () => {
    const s = run();
    const c = companiesIn(s, 'ash').find((x) => x.workers.length > 0)!;
    expect(c).toBeDefined();
    const w = c.workers[0]!;
    expect(workJobId(s, w)).toBe(workJobId(s, c.ownerId));
    for (const co of companiesIn(s)) expect(1 + co.workers.length).toBeLessThanOrEqual(BUILDINGS.find((b) => b.id === co.kind)!.slots!);
  });
  it('pays wages into purses and earns revenue', () => {
    const s = run();
    const c = companiesIn(s, 'ash').find((x) => x.workers.length > 0)!;
    expect(c.revenue).toBeGreaterThan(0);
    expect(purseOf(s, c.workers[0]!)).toBeGreaterThanOrEqual(COMPANY.wage);
  });
  it('unpaid workers quit', () => {
    const s = run();
    const c = companiesIn(s, 'ash').find((x) => x.workers.length > 0)!;
    const w = c.workers[0]!;
    c.coin = 0;
    for (let i = 0; i < COMPANY.quitAfterUnpaid; i++) { c.coin = 0; tickCompanies(s); }
    expect(c.workers).not.toContain(w);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(run(120).companies)).toBe(JSON.stringify(run(120).companies));
  });
});
