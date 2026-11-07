import { describe, expect, it } from 'vitest';
import { BUILDING_BY_ID, BUILDINGS, PLANS, activePlans, buildNeeds, claimsIn, contributeToPlan, tickBuildPlans, workshopMul } from '../../src/sim/economy/build-plans';
import { tickVillageEconomy } from '../../src/sim/economy/village-economy';
import { tickLogistics } from '../../src/sim/economy/logistics';
import { JOBS } from '../../src/sim/goods/jobs';
import { ITEM_BY_ID } from '../../src/sim/goods/inventory';
import { biomeAt } from '../../src/sim/map/terrain';
import type { SimState } from '../../src/sim/types/runtime';

const town = (n = 40, seed = 9): SimState => {
  const people: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) people[`p${i}`] = { id: `p${i}`, flame: 0.5, townId: 'ash' };
  return { seed, day: 1, people } as unknown as SimState;
};
const step = (s: SimState): void => { s.day += 1; tickVillageEconomy(s); tickBuildPlans(s); tickLogistics(s); };
const stock = (s: SimState, q = 200): void => {
  tickVillageEconomy(s);
  for (const b of BUILDINGS) for (const i of Object.keys(b.cost)) s.villageEconomy!.towns.ash!.goods[i] = q;
};

describe('build plans', () => {
  it('data: buildings use known items and jobs', () => {
    const jobIds = new Set(JOBS.map((j) => j.id));
    for (const b of BUILDINGS) {
      for (const i of Object.keys(b.cost)) expect(ITEM_BY_ID.has(i), `${b.id}:${i}`).toBe(true);
      for (const j of b.jobs) expect(jobIds.has(j), `${b.id}:${j}`).toBe(true);
    }
  });
  it('villagers claim non-overlapping plots outside the town centre', () => {
    const s = town(); stock(s);
    for (let i = 0; i < 120; i++) step(s);
    const cs = claimsIn(s, 'ash');
    expect(cs.length).toBeGreaterThan(1);
    for (const [i, a] of cs.entries()) {
      expect(a.dx <= PLANS.centerRadius && a.dx + a.w > -PLANS.centerRadius && a.dy <= PLANS.centerRadius && a.dy + a.h > -PLANS.centerRadius).toBe(false);
      for (const b of cs.slice(i + 1)) expect(a.dx < b.dx + b.w && a.dx + a.w > b.dx && a.dy < b.dy + b.h && a.dy + a.h > b.dy).toBe(false);
    }
    expect(activePlans(s, 'ash').length).toBeLessThanOrEqual(PLANS.activePerTown);
  });
  it('with goods in town, buildings get finished and boost their trade', () => {
    const s = town(); stock(s);
    for (let i = 0; i < 150; i++) { step(s); stock(s); }
    const done = s.build!.plans.filter((p) => p.stage === 'done');
    expect(done.length).toBeGreaterThan(0);
    const kind = BUILDING_BY_ID.get(done[0]!.kind)!;
    if (kind.jobs[0]) expect(workshopMul(s, 'ash', kind.jobs[0])).toBeGreaterThan(1);
    expect(s.build!.claims.find((c) => c.id === done[0]!.claimId)!.status).toBe('built');
  });
  it('missing materials become town need; a plan with no supply is abandoned and frees its plot', () => {
    const s = town();
    for (let i = 0; i < 400 && !activePlans(s).length; i++) step(s);
    const plan = activePlans(s)[0]!;
    expect(buildNeeds(s, 'ash').length).toBeGreaterThan(0);
    for (let i = 0; i < PLANS.stallDays + 5 && plan.stage === 'gathering'; i++) {
      s.day += 1; tickVillageEconomy(s);
      for (const k of Object.keys(s.villageEconomy!.towns.ash!.goods)) s.villageEconomy!.towns.ash!.goods[k] = 0; // nothing reaches the site
      tickBuildPlans(s);
    }
    expect(plan.stage).toBe('abandoned');
    expect(claimsIn(s, 'ash').some((c) => c.id === plan.claimId)).toBe(false);
  });
  it("the player's gift goes to the owner's build, once per needed unit", () => {
    const s = town();
    for (let i = 0; i < 400 && !activePlans(s).length; i++) step(s);
    const plan = activePlans(s)[0]!;
    const def = BUILDING_BY_ID.get(plan.kind)!;
    const item = Object.keys(def.cost).find((i) => (def.cost[i]! > (plan.have[i] ?? 0)))!;
    expect(contributeToPlan(s, plan.ownerId, item)).toMatch(/toward their/);
    expect(plan.have[item]).toBeGreaterThanOrEqual(1);
    expect(contributeToPlan(s, 'nobody', item)).toBeNull();
  });
  it('with a map position, plots stay inside the world and off water', () => {
    const s = town(60);
    s.towns = { ash: { id: 'ash', q: 20, r: 20 } } as never; // near the corner: northern rings would be negative
    stock(s);
    for (let i = 0; i < 300; i++) { step(s); stock(s); }
    const cs = claimsIn(s, 'ash');
    expect(cs.length).toBeGreaterThan(2);
    for (const c of cs) for (let i = 0; i < c.w * 3; i++) for (let j = 0; j < c.h * 3; j++) {
      const q = 20 + c.dx * 3 + i, r = 20 + c.dy * 3 + j;
      expect(q >= 0 && r >= 0).toBe(true);
      if (Math.abs(q - 20) > 13 || Math.abs(r - 20) > 13) expect(biomeAt(s.seed, q, r)).not.toBe('water');
    }
  });
  it('is deterministic', () => {
    const run = (): string => { const s = town(); stock(s); for (let i = 0; i < 80; i++) { step(s); stock(s); } return JSON.stringify(s.build); };
    expect(run()).toBe(run());
  });
});
