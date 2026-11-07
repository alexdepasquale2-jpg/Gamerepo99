import { describe, expect, it } from 'vitest';
import { LOGISTICS, openRequests, tickLogistics } from '../../src/sim/economy/logistics';
import { tickVillageEconomy } from '../../src/sim/economy/village-economy';
import { jobOf } from '../../src/sim/goods/jobs';
import type { SimState } from '../../src/sim/types/runtime';

const FOOD_JOBS = ['farmer', 'fisher', 'baker', 'miller'];
/** Town a: all farmers (surplus). Town b: nobody makes food (shortage). Joined by one 2-day road unless noRoad. */
function world(noRoad = false): SimState {
  const s = { seed: 5, day: 1, people: {} } as unknown as SimState;
  let a = 0, b = 0;
  for (let i = 0; a < 6 || b < 6; i++) {
    const job = jobOf(s, `p${i}`).id;
    if (job === 'farmer' && a < 6) { s.people[`p${i}`] = { id: `p${i}`, flame: 0.5, townId: 'a' } as never; a++; }
    else if (!FOOD_JOBS.includes(job) && b < 6) { s.people[`p${i}`] = { id: `p${i}`, flame: 0.5, townId: 'b' } as never; b++; }
  }
  if (!noRoad) s.economyRoutes = [{ id: 'r1', fromTownId: 'a', toTownId: 'b', days: 2, condition: 1, broken: false, facilityIds: [] } as never];
  return s;
}
const step = (s: SimState): void => { s.day += 1; tickVillageEconomy(s); tickLogistics(s); };

describe('logistics', () => {
  it('a short town posts a request and a cart from the surplus town fills it', () => {
    const s = world();
    for (let i = 0; i < 40; i++) step(s);
    expect(s.logistics!.requests.some((r) => r.townId === 'b')).toBe(true);
    expect(s.logistics!.delivered).toBeGreaterThan(0);
    expect(s.logistics!.requests.some((r) => r.status === 'filled')).toBe(true);
  });
  it('is deterministic', () => {
    const run = (): string => { const s = world(); for (let i = 0; i < 30; i++) step(s); return JSON.stringify(s.logistics); };
    expect(run()).toBe(run());
  });
  it('sends nothing when there is no road, and requests lapse', () => {
    const s = world(true);
    for (let i = 0; i < LOGISTICS.requestLapseDays + 3; i++) step(s);
    expect(s.logistics!.carts).toHaveLength(0);
    expect(s.logistics!.delivered).toBe(0);
    expect(s.logistics!.requests.some((r) => r.status === 'lapsed')).toBe(true);
  });
  it('never puts more carts on a road than the cap', () => {
    const s = world();
    let max = 0;
    for (let i = 0; i < 40; i++) { step(s); max = Math.max(max, s.logistics!.carts.filter((c) => c.legs.some((l) => l.routeId === 'r1')).length); }
    expect(max).toBeLessThanOrEqual(LOGISTICS.routeCartCap);
    expect(openRequests(s).every((r) => r.status === 'open')).toBe(true);
  });
});
