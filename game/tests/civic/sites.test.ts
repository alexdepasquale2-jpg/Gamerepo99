import { describe, expect, it } from 'vitest';
import { syncSites, siteById, civicOf, type Site } from '../../src/sim/civic/sites';
import { rationCoin, tickSites, vacatePosts } from '../../src/sim/civic/staffing';
import { COMPANY, creditCompany, workJobId } from '../../src/sim/economy/companies';
import { jobOf } from '../../src/sim/goods/jobs';
import type { SimState } from '../../src/sim/types/runtime';

const person = (id: string, townId = 't1', extra: Record<string, unknown> = {}) => ({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Test`, flame: 50, age: 40, townId, ...extra });

/** One town, one mill company run by its owner with one hand; a bakery can be added to sell rations. */
function tiny(opts: { coin?: number; bakery?: boolean } = {}): SimState {
  const plans = [{ id: 'plan1', ownerId: 'ann', townId: 't1', kind: 'mill', claimId: 'claim1', stage: 'done', have: {}, laborDone: 9, startDay: 1, stalledDays: 0, doneDay: 2 }];
  const claims = [{ id: 'claim1', planId: 'plan1', ownerId: 'ann', townId: 't1', dx: 7, dy: 0, w: 2, h: 2, kind: 'mill', status: 'built' }];
  const list = [{ id: 'co1', planId: 'plan1', name: "Ann's Mill", ownerId: 'ann', townId: 't1', kind: 'mill', workers: ['bob'], coin: opts.coin ?? 30, founded: 2, revenue: 0, unpaid: {} }];
  if (opts.bakery) {
    plans.push({ ...plans[0]!, id: 'plan2', ownerId: 'eve', kind: 'bakery', claimId: 'claim2' });
    claims.push({ ...claims[0]!, id: 'claim2', planId: 'plan2', ownerId: 'eve', dx: -8, kind: 'bakery' });
    list.push({ ...list[0]!, id: 'co2', planId: 'plan2', name: "Eve's Bakery", ownerId: 'eve', kind: 'bakery', workers: [], coin: 5 });
  }
  return {
    day: 10, seed: 7, flags: {}, packets: [],
    player: { id: 'player', townId: 't9' },
    people: Object.fromEntries(['ann', 'bob', 'cat', 'dan', 'eve'].map((id) => [id, person(id)])),
    towns: { t1: { id: 't1', economyOptIn: true, stock: {}, despair: 0.2 } },
    villageEconomy: { towns: { t1: { goods: { grain: 20 }, need: { food: 1.25 }, short: {} } } },
    build: { plans, claims, next: 3 },
    companies: { list, next: 3, purse: {} },
  } as unknown as SimState;
}

const coinIn = (s: SimState): number => (s.companies?.list ?? []).reduce((n, c) => n + c.coin, 0) + Object.values(s.companies?.purse ?? {}).reduce((n, q) => n + q, 0);
const mill = (s: SimState): Site => siteById(s, 'site_plan1')!;
const dawn = (s: SimState): void => { s.day += 1; tickSites(s); };

describe('civic sites and staffing', () => {
  it('wraps a company as a site run by its owner', () => {
    const s = tiny();
    syncSites(s);
    const site = mill(s);
    expect(site.managerId).toBe('ann');
    expect(site.status).toBe('working');
    expect(site.workers).toEqual(['bob']);
    expect(site.source).toEqual({ type: 'company', ref: 'co1' });
    expect(site.plot).toEqual({ dx: 7, dy: 0, w: 2, h: 2 });
  });

  it('pays wages and sells rations without making or losing coin', () => {
    const s = tiny({ bakery: true });
    const before = coinIn(s);
    dawn(s);
    expect(s.companies!.purse.bob).toBeCloseTo(COMPANY.wage - rationCoin(), 9);
    expect(coinIn(s)).toBeCloseTo(before, 9);
    expect(civicOf(s).log.entries.some((e) => e.why === 'ration' && e.to === 'site:site_plan2')).toBe(true);
  });

  it('unpaid hands quit after COMPANY.quitAfterUnpaid dawns', () => {
    const s = tiny({ coin: 0 });
    for (let i = 0; i < COMPANY.quitAfterUnpaid - 1; i++) dawn(s);
    expect(mill(s).workers).toContain('bob');
    dawn(s);
    expect(mill(s).workers).not.toContain('bob');
    expect(s.companies!.list[0]!.workers).not.toContain('bob');
  });

  it('a site without a manager makes nothing, posts "wanted", and promotes the next dawn', () => {
    const s = tiny();
    syncSites(s);
    expect(workJobId(s, 'bob')).toBe('miller');
    vacatePosts(s, 'ann', 'retired');
    expect(mill(s).managerId).toBeUndefined();
    expect(mill(s).status).toBe('idle');
    expect(civicOf(s).news.at(-1)).toMatchObject({ kind: 'wanted', siteId: 'site_plan1' });
    const c = s.companies!.list[0]!;
    creditCompany(s, 'bob', { flour: 2 }, 1);
    expect(c.revenue).toBe(0);
    // With nobody running the mill, its hand goes back to their own trade.
    expect(workJobId(s, 'bob')).toBe(jobOf(s, 'bob').id);
    tickSites(s); // same day: still only posted
    expect(mill(s).managerId).toBeUndefined();
    dawn(s);
    expect(mill(s).managerId).toBeTruthy();
    expect(mill(s).status).toBe('working');
    expect(civicOf(s).news.some((n) => n.kind === 'promoted')).toBe(true);
    creditCompany(s, mill(s).managerId!, { flour: 2 }, 1);
    expect(c.revenue).toBeGreaterThan(0);
  });

  it('unfed hands fall sick, then leave, and the town feels it', () => {
    const s = tiny({ bakery: true });
    const l = s.villageEconomy!.towns.t1!;
    l.short = { food: l.need.food! };
    const despair = s.towns!.t1!.despair;
    dawn(s);
    dawn(s);
    expect(s.people.bob!.tags).toContain('sick');
    dawn(s);
    dawn(s);
    expect(mill(s).workers).not.toContain('bob');
    expect(s.towns!.t1!.despair).toBeGreaterThan(despair);
    expect(civicOf(s).news.some((n) => n.kind === 'unfed-left' && n.personId === 'bob')).toBe(true);
    // Fed again (gone home), the sickness mends.
    l.short = {};
    for (let i = 0; i < 3; i++) dawn(s);
    expect(s.people.bob!.tags ?? []).not.toContain('sick');
  });
});
