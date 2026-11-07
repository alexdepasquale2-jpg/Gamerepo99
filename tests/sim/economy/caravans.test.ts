/** M4 packet-02 — scheduled caravans (tickCaravans). */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tickCaravans } from '../../../src/sim/caravans';
import { ensureEconomyState } from '../../../src/sim/economy';
import { loadData } from '../../../src/sim/load-data';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import type { SimState } from '../../../src/sim/types/runtime';

function boot(seed = 7): SimState {
  const { state } = bootPlayState(seed, 'marrow');
  ensureEconomyState(state);
  return state;
}
const route = (s: SimState, id: string) => s.economyRoutes!.find((r) => r.id === id)!;
const juice = (s: SimState) => s.bus?.lastIds ?? [];
const count = (s: SimState, id: string) => juice(s).filter((j) => j === id).length;

/** Isolate one schedule on one route; others get an unreachable period. */
function only(s: SimState, id: string, over: Record<string, unknown> = {}): void {
  s.data = {
    ...(s.data as object),
    caravanSchedules: loadData()
      .caravanSchedules.filter((x) => x.id === id)
      .map((x) => ({ ...x, ...over })),
  };
}

describe('caravans (M4 packet-02)', () => {
  it('loads schedules; maxConcurrent defaults to 2', () => {
    const g = loadData().caravanSchedules.find((s) => s.id === 'cav_strand_grain');
    expect(g?.maxConcurrent).toBe(2);
  });

  it('fires within 6 dawns on seed 7', () => {
    const s = boot();
    for (let i = 0; i < 6; i++) advanceToDawn(s);
    expect(juice(s).some((j) => j.startsWith('caravan.') || j === 'route.caravan')).toBe(true);
  });

  it('is deterministic', () => {
    const run = () => {
      const s = boot();
      for (let i = 0; i < 6; i++) advanceToDawn(s);
      return JSON.stringify([s.caravans, s.towns]);
    };
    expect(run()).toBe(run());
  });

  it('turns around and delivers the return leg, then removes', () => {
    const s = boot();
    only(s, 'cav_strand_grain', { periodDays: 1000, departDawnMod: 5 });
    const rt = route(s, 'route_ashford_lowmere');
    rt.days = 2;
    const stock = () => s.towns!.ashford.stock.food_grain ?? 0;
    const lm = () => s.towns!.lowmere.stock.food_grain ?? 0;
    const a0 = stock();
    const l0 = lm();
    tickCaravans(s, 5); // spawn
    tickCaravans(s, 6);
    expect(s.caravans).toHaveLength(1);
    tickCaravans(s, 7); // outbound arrive
    expect(lm()).toBe(l0 + 4);
    expect(s.caravans![0]).toMatchObject({ heading: 'return', progress01: 0 });
    tickCaravans(s, 8);
    tickCaravans(s, 9); // return arrive
    expect(stock()).toBe(a0 + 4);
    expect(s.caravans).toHaveLength(0);
  });

  it('condition slows travel proportionally', () => {
    const dawnsToArrive = (cond: number) => {
      const s = boot();
      only(s, 'cav_strand_grain', { periodDays: 1000, departDawnMod: 0 });
      const rt = route(s, 'route_ashford_lowmere');
      rt.days = 2;
      rt.condition = cond;
      tickCaravans(s, 0);
      let n = 0;
      while (s.caravans![0].heading === 'outbound') {
        tickCaravans(s, ++n);
      }
      return n;
    };
    expect(dawnsToArrive(1)).toBe(2);
    expect(dawnsToArrive(0.5)).toBe(4);
  });

  it('route.break fires once; broken blocks spawns', () => {
    const s = boot();
    only(s, 'cav_strand_grain', { periodDays: 1, departDawnMod: 0 });
    tickCaravans(s, 0);
    const before = s.caravans!.length;
    route(s, 'route_ashford_lowmere').broken = true;
    for (let d = 1; d <= 4; d++) tickCaravans(s, d);
    expect(count(s, 'route.break')).toBe(1);
    expect(s.caravans).toHaveLength(before);
    route(s, 'route_ashford_lowmere').broken = false;
    tickCaravans(s, 5);
    route(s, 'route_ashford_lowmere').broken = true;
    tickCaravans(s, 6);
    expect(count(s, 'route.break')).toBe(2);
  });

  it('Ashford (economyOptIn false) receives cargo without despair change', () => {
    const s = boot();
    expect(s.towns!.ashford.economyOptIn).toBe(false);
    only(s, 'cav_strand_grain', { periodDays: 1000, departDawnMod: 0 });
    const rt = route(s, 'route_ashford_lowmere');
    rt.days = 1;
    const a0 = s.towns!.ashford.stock.food_grain ?? 0;
    const d0 = s.towns!.ashford.despair;
    for (let d = 0; d <= 2; d++) tickCaravans(s, d);
    expect(s.towns!.ashford.stock.food_grain).toBe(a0 + 4);
    expect(s.towns!.ashford.despair).toBe(d0);
  });

  it('caps concurrent mobiles per schedule', () => {
    const live = (cap?: number) => {
      const s = boot();
      only(s, 'cav_strand_grain', { periodDays: 1, departDawnMod: 0, maxConcurrent: cap });
      route(s, 'route_ashford_lowmere').days = 10;
      for (let d = 0; d < 5; d++) tickCaravans(s, d);
      return s.caravans!.length;
    };
    expect(live(undefined)).toBe(2);
    expect(live(1)).toBe(1);
    expect(live(3)).toBe(3);
  });

  it('has no archetypeId === in caravans sources', () => {
    for (const f of readdirSync('src/sim').filter((x) => x.startsWith('caravans'))) {
      expect(readFileSync(`src/sim/${f}`, 'utf8')).not.toMatch(/archetypeId\s*===/);
    }
  });
});
