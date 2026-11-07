import { afterEach, describe, expect, it } from 'vitest';
import { GIFTS, KIN, heirOf, householdOf, inheritFrom, sexOf, tickHouseholds } from '../../src/sim/economy/households';
import { tickVillageEconomy } from '../../src/sim/economy/village-economy';
import type { SimState } from '../../src/sim/types/runtime';

const town = (n = 30, flame = 50, seed = 4): SimState => {
  const people: Record<string, unknown> = {};
  const purse: Record<string, number> = {};
  for (let i = 0; i < n; i++) { people[`p${i}`] = { id: `p${i}`, name: `Pat${i} Fenn${i % 5}`, flame, townId: 'ash' }; purse[`p${i}`] = 100; }
  return { seed, day: 1, people, companies: { list: [], next: 1, purse } } as unknown as SimState;
};
/** Fed and secure unless `hungry`. */
const step = (s: SimState, hungry = false): void => {
  s.day += 1; tickVillageEconomy(s);
  const l = s.villageEconomy!.towns.ash!;
  l.goods.bread = hungry ? 0 : 500;
  for (const k of Object.keys(l.goods)) if (hungry) l.goods[k] = 0;
  tickHouseholds(s);
};
const run = (s: SimState, days: number, hungry = false): SimState => { for (let i = 0; i < days; i++) step(s, hungry); return s; };
const saved = { ...KIN };
afterEach(() => Object.assign(KIN, saved));

describe('households and lineage', () => {
  it('sex is stable per person and roughly balanced', () => {
    const s = town();
    expect(sexOf(s, 'p1')).toBe(sexOf(s, 'p1'));
    const men = Array.from({ length: 200 }, (_, i) => sexOf(s, `x${i}`)).filter((x) => x === 'm').length;
    expect(men).toBeGreaterThan(70); expect(men).toBeLessThan(130);
  });
  it('couples are one man and one woman, within housing, and each founds a distinct line', () => {
    const s = run(town(), 200);
    const hh = s.kin!.households;
    expect(hh.length).toBeGreaterThan(0);
    expect(hh.length).toBeLessThanOrEqual(Math.ceil(30 / KIN.adultsPerHome) + 6);
    for (const h of hh) expect(new Set(h.adults.map((a) => sexOf(s, a))).size).toBe(2);
    expect(new Set(hh.filter((h) => h.generation === 1).map((h) => h.surname)).size).toBe(hh.filter((h) => h.generation === 1).length);
    const all = hh.flatMap((h) => h.adults);
    expect(new Set(all).size).toBe(all.length);
  });
  it('no children when the town is starving', () => {
    expect(run(town(), 300, true).kin!.children).toHaveLength(0);
  });
  it('secure households have children who take the family name; they grow up and continue the line', () => {
    const s = run(town(40), 500);
    const kids = s.kin!.children;
    expect(kids.length).toBeGreaterThan(0);
    for (const c of kids) expect(c.surname).toBe(s.kin!.households.find((h) => h.id === c.householdId)!.surname);
    const grown = kids.filter((c) => c.status === 'adult');
    expect(grown.length).toBeGreaterThan(0);
    expect(s.people[grown[0]!.personId!]!.name).toBe(`${grown[0]!.given} ${grown[0]!.surname}`);
    expect(s.kin!.households.some((h) => h.generation > 1)).toBe(true);
  });
  it('gifted children come only from warm, secure households (when the base chance is off)', () => {
    KIN.giftedChanceBase = 0;
    const cold = run(town(40, 10), 600);
    expect(cold.kin!.children.filter((c) => c.gift)).toHaveLength(0);
    const warm = run(town(40, 90), 600);
    const gifted = warm.kin!.children.filter((c) => c.gift);
    expect(gifted.length).toBeGreaterThan(0);
    for (const c of gifted) expect(GIFTS).toContain(c.gift);
    const adult = gifted.find((c) => c.status === 'adult');
    if (adult) expect(warm.people[adult.personId!]!.tags).toContain(`gifted_${adult.gift}`);
  });
  it('heirs inherit claims, plans and companies: the eldest grown child, else the spouse', () => {
    const s = town(4);
    s.kin = { households: [{ id: 'hh1', townId: 'ash', adults: ['p0', 'p1'], surname: 'Fenn', generation: 1, formed: 1, kids: ['k1'] }], children: [{ id: 'k1', householdId: 'hh1', townId: 'ash', given: 'Ann', surname: 'Fenn', sex: 'f', parents: ['p0', 'p1'], born: 1, status: 'adult', personId: 'p2' }], lineages: {}, next: 3 };
    s.build = { plans: [{ id: 'plan1', ownerId: 'p0', townId: 'ash', kind: 'mill', claimId: 'claim1', stage: 'building', have: {}, laborDone: 0, startDay: 1, stalledDays: 0 }], claims: [{ id: 'claim1', planId: 'plan1', ownerId: 'p0', townId: 'ash', dx: 2, dy: 2, w: 2, h: 1, kind: 'mill', status: 'claimed' }], next: 3 };
    s.companies!.list.push({ id: 'co1', planId: 'plan0', name: "Pat0's Mill", ownerId: 'p0', townId: 'ash', kind: 'mill', workers: ['p2'], coin: 5, founded: 1, revenue: 0, unpaid: {} });
    expect(heirOf(s, 'p0')).toBe('p2');
    expect(inheritFrom(s, 'p0')).toBe('p2');
    expect(s.build.claims[0]!.ownerId).toBe('p2');
    expect(s.build.plans[0]!.ownerId).toBe('p2');
    expect(s.companies!.list[0]!.ownerId).toBe('p2');
    expect(s.companies!.list[0]!.workers).not.toContain('p2');
    s.kin.children[0]!.status = 'child';
    expect(heirOf(s, 'p0')).toBe('p1');
    expect(householdOf(s, 'p1')!.id).toBe('hh1');
    expect(inheritFrom(s, 'nobody')).toBeNull();
  });
  it('is deterministic', () => {
    const j = (): string => JSON.stringify(run(town(), 300).kin);
    expect(j()).toBe(j());
  });
});
