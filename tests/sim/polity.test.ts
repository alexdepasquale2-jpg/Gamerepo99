import { describe, expect, it } from 'vitest';
import type { Claim } from '../../src/sim/economy/build-plans';
import { tickLogistics } from '../../src/sim/economy/logistics';
import { CREEDS, POLITY, TECHS, atWar, birthMul, creedOf, pairKey, polityMul, safeRoads, strength, techsOf, tickPolity, treatyOf } from '../../src/sim/economy/polity';
import { tickVillageEconomy } from '../../src/sim/economy/village-economy';
import type { SimState } from '../../src/sim/types/runtime';

const built = (id: string, townId: string, kind: string): Claim => ({ id, planId: `p_${id}`, ownerId: 'x', townId, dx: 2, dy: 2, w: 1, h: 1, kind, status: 'built' });
function world(): SimState {
  return {
    seed: 6, day: 1,
    people: Object.fromEntries(['a1', 'a2', 'a3', 'b1'].map((id) => [id, { id, flame: 50, townId: id[0] }])),
    towns: { a: { id: 'a' }, b: { id: 'b' } },
    economyRoutes: [{ id: 'r', fromTownId: 'a', toTownId: 'b', days: 2, condition: 1, broken: false, facilityIds: [] }],
    build: { plans: [], claims: [], next: 1 },
  } as unknown as SimState;
}
const run = (s: SimState, days: number, each?: (s: SimState) => void): void => { for (let i = 0; i < days; i++) { s.day++; each?.(s); tickPolity(s); } };
const KEY = pairKey('a', 'b');

describe('diplomacy', () => {
  it('trade builds trust into a trade pact, then an alliance', () => {
    const s = world();
    run(s, 30, (x) => { x.logistics = { requests: [], carts: [], next: 1, lost: 0, delivered: 0, flow: { [KEY]: 6 } }; });
    expect(['trade', 'alliance']).toContain(treatyOf(s, 'a', 'b'));
    run(s, 60, (x) => { x.logistics = { requests: [], carts: [], next: 1, lost: 0, delivered: 0, flow: { [KEY]: 6 } }; });
    expect(treatyOf(s, 'a', 'b')).toBe('alliance');
  });
  it('a feud from border tension breaks the treaty', () => {
    const s = world();
    run(s, 40, (x) => { x.logistics = { requests: [], carts: [], next: 1, lost: 0, delivered: 0, flow: { [KEY]: 6 } }; });
    s.borders = { pairs: { [KEY]: { a: 'a', b: 'b', dist: 10, reachA: 40, reachB: 40, overlap: 70, tension: 100, since: 1 } }, disputes: [], next: 1 };
    run(s, 15);
    expect(treatyOf(s, 'a', 'b')).toBe('none');
  });
});

describe('war', () => {
  function feuding(): SimState {
    const s = world();
    s.borders = { pairs: { [KEY]: { a: 'a', b: 'b', dist: 10, reachA: 40, reachB: 40, overlap: 70, tension: 100, since: 1 } }, disputes: [], next: 1 };
    s.villageEconomy = { towns: { a: { goods: { bread: 100 }, need: {}, short: {} }, b: { goods: { bread: 100 }, need: {}, short: {} } } };
    return s;
  }
  it('a hot feud with no treaty becomes a war; the stronger town attacks; raids take goods', () => {
    const s = feuding();
    let started = false;
    for (let i = 0; i < 60 && !started; i++) { run(s, 1); started = s.polity!.wars.length > 0; }
    const w = s.polity!.wars[0]!;
    expect(w.aggressor).toBe('a');
    expect(atWar(s, 'a', 'b')).toBe(true);
    run(s, 10);
    expect(s.polity!.wars[0]!.raids).toBeGreaterThan(0);
    expect(s.villageEconomy!.towns.b!.goods.bread).toBeLessThan(100);
  });
  it('wars end with a winner and a truce, and raid unbuilt plans', () => {
    const s = feuding();
    s.build!.plans.push({ id: 'pl', ownerId: 'b1', townId: 'b', kind: 'mill', claimId: 'cl', stage: 'gathering', have: {}, laborDone: 0, startDay: 1, stalledDays: 0 });
    s.build!.claims.push({ ...built('cl', 'b', 'mill'), status: 'claimed' });
    for (let i = 0; i < 200 && !(s.polity?.wars.some((w) => w.status === 'ended')); i++) run(s, 1, (x) => { if (x.polity?.wars.length) x.borders = undefined; });
    const w = s.polity!.wars.find((x) => x.status === 'ended')!;
    expect(w).toBeDefined();
    expect(w.winner).toBeDefined();
    expect(atWar(s, 'a', 'b')).toBe(false);
    expect(s.polity!.relations[KEY]!.treaty).toBe('none');
    expect(s.polity!.relations[KEY]!.trust).toBeLessThanOrEqual(POLITY.truceTrust);
  });
  it('carts are not sent to a town at war', () => {
    const s = world();
    s.villageEconomy = { towns: { a: { goods: { bread: 500 }, need: { food: 1 }, short: {} }, b: { goods: {}, need: { food: 2 }, short: { food: 2 } } } };
    s.polity = { relations: {}, wars: [{ id: 'w', aggressor: 'a', defender: 'b', started: 1, duration: 99, raids: 0, status: 'active' }], knowledge: {}, tech: {}, faiths: {}, next: 2 };
    for (let i = 0; i < 20; i++) { s.day++; tickLogistics(s); }
    expect(s.logistics!.carts).toHaveLength(0);
    expect(s.logistics!.delivered).toBe(0);
  });
});

describe('technology', () => {
  it('a town with the building and enough knowledge unlocks the tech and its trade multiplier', () => {
    const s = world();
    s.build!.claims.push(built('m', 'a', 'mill'));
    expect(polityMul(s, 'a', 'miller')).toBe(1);
    run(s, 80);
    expect(techsOf(s, 'a')).toContain('water_wheel');
    expect(polityMul(s, 'a', 'miller')).toBe(TECHS.find((t) => t.id === 'water_wheel')!.mul.miller);
    expect(techsOf(s, 'b')).toHaveLength(0);
  });
  it('techs need their prerequisites and spread through treaties', () => {
    const s = world();
    s.build!.claims.push(built('m', 'a', 'mill'), built('h', 'a', 'house'), built('s', 'a', 'smithy'));
    run(s, 300, (x) => { x.logistics = { requests: [], carts: [], next: 1, lost: 0, delivered: 0, flow: { [KEY]: 6 } }; });
    expect(techsOf(s, 'a').indexOf('masonry')).toBeLessThan(techsOf(s, 'a').indexOf('deep_shafts') === -1 ? 99 : techsOf(s, 'a').indexOf('deep_shafts'));
    expect(techsOf(s, 'b').length).toBeGreaterThan(0);
  });
});

describe('religion', () => {
  it('a finished chapel founds a creed once, and its effects are read by the hooks', () => {
    const s = world();
    expect(creedOf(s, 'a')).toBeUndefined();
    s.build!.claims.push(built('c', 'a', 'chapel'));
    run(s, 2);
    const creed = creedOf(s, 'a')!;
    expect(CREEDS).toContain(creed);
    expect(s.polity!.faiths.a!.shrine).toBe('c');
    const id = creed.id;
    run(s, 5);
    expect(creedOf(s, 'a')!.id).toBe(id);
    expect(birthMul(s, 'a')).toBe(creed.birthMul ?? 1);
    expect(safeRoads(s, 'a', 'b')).toBe(!!creed.safeRoads);
    expect(polityMul(s, 'a', 'farmer')).toBe(creed.jobMul?.farmer ?? 1);
  });
  it('different creeds breed friction between neighbours', () => {
    const s = world();
    s.polity = { relations: {}, wars: [], knowledge: {}, tech: {}, next: 1, faiths: { a: { creed: 'hearth', founded: 1, shrine: 'x' }, b: { creed: 'harvest', founded: 1, shrine: 'y' } } };
    run(s, 40);
    expect(s.polity!.relations[KEY]!.feud).toBe(0);
    s.polity.faiths.b!.creed = 'wayfarers';
    s.borders = { pairs: { [KEY]: { a: 'a', b: 'b', dist: 10, reachA: 40, reachB: 40, overlap: 1, tension: 21, since: 1 } }, disputes: [], next: 1 };
    run(s, 10);
    expect(s.polity!.relations[KEY]!.feud).toBeGreaterThan(0);
  });
});

describe('integration', () => {
  it('strength counts people, buildings and techs; the layer is deterministic', () => {
    const s = world();
    s.build!.claims.push(built('m', 'a', 'mill'));
    expect(strength(s, 'a')).toBe(3 + 3);
    const j = (): string => { const t = world(); t.build!.claims.push(built('m', 'a', 'mill')); run(t, 150); return JSON.stringify(t.polity); };
    expect(j()).toBe(j());
  });
  it('technology multiplies production in the village economy', () => {
    const s = world();
    s.polity = { relations: {}, wars: [], knowledge: {}, tech: { a: ['field_rotation'] }, faiths: {}, next: 1 };
    expect(polityMul(s, 'a', 'farmer')).toBe(1.2);
    tickVillageEconomy(s);
    expect(s.villageEconomy!.towns.a).toBeDefined();
  });
});
