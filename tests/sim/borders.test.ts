import { describe, expect, it } from 'vitest';
import type { Claim } from '../../src/sim/economy/build-plans';
import { LAND, bordersOf, claimRect, estateOf, tension, tickBorders, townReach } from '../../src/sim/economy/borders';
import type { SimState } from '../../src/sim/types/runtime';

const claim = (id: string, townId: string, owner: string, dx: number, dy: number, status: Claim['status'] = 'built', w = 1, h = 1): Claim => ({ id, planId: `plan_${id}`, ownerId: owner, townId, dx, dy, w, h, kind: 'house', status });
function world(dist = 40): SimState {
  return {
    seed: 3, day: 1, people: {},
    towns: { a: { id: 'a', q: 100, r: 50 }, b: { id: 'b', q: 100 + dist, r: 50 }, far: { id: 'far', q: 900, r: 900 } },
    build: { plans: [], claims: [], next: 1 },
  } as unknown as SimState;
}
const grow = (s: SimState, town: string, n: number): void => { for (let i = 0; i < n; i++) s.build!.claims.push(claim(`${town}${i}`, town, 'x', 2 + (i % 8), 2 + Math.floor(i / 8))); };

describe('land and borders', () => {
  it('maps a claim to tiles around the town centre', () => {
    const s = world();
    expect(claimRect(s, claim('c', 'a', 'p', 2, -3, 'claimed', 2, 1))).toEqual({ q0: 106, r0: 41, q1: 112, r1: 44 });
    expect(claimRect({ ...s, towns: {} } as SimState, claim('c', 'zzz', 'p', 0, 0))).toBeNull();
  });
  it('an estate gathers an owner\'s claims and their bounds', () => {
    const s = world();
    s.build!.claims.push(claim('c1', 'a', 'p', 2, 2), claim('c2', 'a', 'p', 4, 3, 'claimed'), claim('c3', 'a', 'q', 6, 6));
    const e = estateOf(s, 'p');
    expect(e.claims).toHaveLength(2);
    expect(e.built).toBe(1);
    expect(e.rect).toEqual({ q0: 106, r0: 56, q1: 115, r1: 62 });
    expect(estateOf(s, 'nobody').rect).toBeNull();
  });
  it('reach grows with what is built and is capped', () => {
    const s = world();
    expect(townReach(s, 'a')).toBe(LAND.baseReach);
    grow(s, 'a', 6);
    expect(townReach(s, 'a')).toBeGreaterThan(LAND.baseReach);
    grow(s, 'a', 100);
    expect(townReach(s, 'a')).toBe(LAND.maxReach);
  });
  it('overlapping towns build border tension; distant ones never do; it fades when overlap ends', () => {
    const s = world(40);
    tickBorders(s);
    expect(tension(s, 'a', 'b')).toBe(0);
    grow(s, 'a', 30); grow(s, 'b', 30);
    for (let i = 0; i < 10; i++) { s.day++; tickBorders(s); }
    expect(tension(s, 'a', 'b')).toBeGreaterThan(10);
    expect(bordersOf(s, 'a').every((p) => p.a !== 'far' && p.b !== 'far')).toBe(true);
    s.build!.claims = [];
    for (let i = 0; i < 30; i++) { s.day++; tickBorders(s); }
    expect(tension(s, 'a', 'b')).toBe(0);
    expect(bordersOf(s, 'a')).toHaveLength(0);
  });
});

describe('claim disputes', () => {
  function stalled(rich: 'challenger' | 'holder'): SimState {
    const s = world();
    s.people = { holder: { id: 'holder', townId: 'a', flame: 50 }, jumper: { id: 'jumper', townId: 'a', flame: 50 } } as never;
    s.build = {
      plans: [{ id: 'plan1', ownerId: 'holder', townId: 'a', kind: 'mill', claimId: 'c1', stage: 'gathering', have: {}, laborDone: 0, startDay: 1, stalledDays: 20 }],
      claims: [{ ...claim('c1', 'a', 'holder', 3, 3, 'claimed', 2, 1), planId: 'plan1', kind: 'mill' }], next: 2,
    };
    s.companies = { list: [], next: 1, purse: { [rich === 'challenger' ? 'jumper' : 'holder']: 500, [rich === 'challenger' ? 'holder' : 'jumper']: rich === 'challenger' ? 0 : 10 } };
    return s;
  }
  const run = (s: SimState, days = 400): void => { for (let i = 0; i < days; i++) { s.day++; tickBorders(s); } };
  /** Tick until a dispute has been settled; return its status. */
  const settled = (s: SimState): string | undefined => { for (let i = 0; i < 800; i++) { s.day++; tickBorders(s); const d = s.borders!.disputes.find((x) => x.status !== 'open'); if (d) return d.status; } return undefined; };
  it('a wealthier challenger takes over a stalled claim and its plan', () => {
    const s = stalled('challenger');
    expect(settled(s)).toBe('upheld');
    expect(s.build!.claims[0]!.ownerId).toBe('jumper');
    expect(s.build!.plans[0]!.ownerId).toBe('jumper');
    expect(s.build!.plans[0]!.stalledDays).toBe(0);
  });
  it('a stronger holder keeps the claim and the dispute is dismissed', () => {
    const s = stalled('holder');
    expect(settled(s)).toBe('dismissed');
    expect(s.build!.claims[0]!.ownerId).toBe('holder');
  });
  it('no jumpers when nobody has savings, and active plans are left alone', () => {
    const s = stalled('holder');
    s.companies!.purse = { holder: 0 };
    run(s);
    expect(s.borders!.disputes).toHaveLength(0);
    const t = stalled('challenger');
    t.build!.plans[0]!.stalledDays = 0;
    run(t, 5);
    expect(t.borders!.disputes).toHaveLength(0);
  });
  it('is deterministic', () => {
    const j = (): string => { const s = stalled('challenger'); run(s); return JSON.stringify(s.borders); };
    expect(j()).toBe(j());
  });
});
