/** M4 Task C — doctrine legitimacy, collapse, competition, supply hook. */
import { describe, expect, it } from 'vitest';
import {
  applyCollapse,
  doctrineSupplyHook,
  ensureDoctrines,
  legitimacyOf,
  tickDoctrines,
} from '../../src/sim/doctrine-tick';
import { ensureEconomyState } from '../../src/sim/economy';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';
import type { SimState } from '../../src/sim/types/runtime';

function boot(seed = 7): SimState {
  const { state } = bootPlayState(seed, 'marrow');
  ensureEconomyState(state);
  return state;
}

describe('doctrine formulas', () => {
  it('legitimacy follows perceived delivery, not real', () => {
    expect(legitimacyOf({ perceivedDelivery: 0.5, control: 0.2 })).toBeCloseTo(0.15 + 0.35 + 0.03);
    expect(legitimacyOf({ perceivedDelivery: 2, control: 2 })).toBe(1);
  });

  it('collapse formula drops legitimacy below 0.15 on big exposed gap', () => {
    const leg = applyCollapse({ perceivedDelivery: 0.9, realDelivery: 0.2, exposure: 0.5, legitimacy: 0.8 });
    expect(leg).toBeLessThan(0.15);
  });

  it('collapse formula is inert below gap/exposure thresholds', () => {
    expect(applyCollapse({ perceivedDelivery: 0.5, realDelivery: 0.4, exposure: 0.9, legitimacy: 0.8 })).toBe(0.8);
    expect(applyCollapse({ perceivedDelivery: 0.9, realDelivery: 0.2, exposure: 0.4, legitimacy: 0.8 })).toBe(0.8);
  });
});

describe('tickDoctrines', () => {
  it('seeds from doctrines.json and is deterministic', () => {
    const run = () => {
      const s = boot();
      for (let i = 0; i < 5; i++) advanceToDawn(s);
      return JSON.stringify(s.doctrines);
    };
    expect(Object.keys(boot().doctrines ?? ensureDoctrines(boot())).length).toBeGreaterThan(0);
    expect(run()).toBe(run());
  });

  it('exposed lie collapses, juices, adds despair once, and cascades finitely', () => {
    const s = boot();
    const d = ensureDoctrines(s);
    const id = Object.keys(d).sort().find((k) => s.towns![d[k]!.townId])!;
    const town = s.towns![d[id]!.townId]!;
    const before = town.despair;
    Object.assign(d[id]!, { perceivedDelivery: 0.9, realDelivery: 0.1, exposure: 0.8, control: 0 });
    const r1 = tickDoctrines(s);
    expect(r1.collapsed).toContain(id);
    expect(town.despair).toBeCloseTo(Math.min(1, before + 0.05));
    expect(s.bus?.lastIds).toContain('doctrine.collapse');
    const r2 = tickDoctrines(s);
    expect(r2.collapsed).not.toContain(id);
    expect(town.despair).toBeCloseTo(Math.min(1, before + 0.05));
  });

  it('higher propaganda steals perceived from a route-linked rival', () => {
    const s = boot();
    const d = ensureDoctrines(s);
    const routes = s.economyRoutes!;
    const pair = routes
      .map((r) => [
        Object.keys(d).filter((k) => d[k]!.townId === r.fromTownId),
        Object.keys(d).filter((k) => d[k]!.townId === r.toTownId),
      ])
      .find(([a, b]) => a!.length && b!.length);
    expect(pair).toBeTruthy();
    const [hi, lo] = [pair![0]![0]!, pair![1]![0]!];
    Object.assign(d[hi]!, { propaganda: 0.9, perceivedDelivery: 0.5, realDelivery: 0.5, exposure: 0 });
    Object.assign(d[lo]!, { propaganda: 0.1, perceivedDelivery: 0.5, realDelivery: 0.5, exposure: 0 });
    for (const k of Object.keys(d)) if (k !== hi && k !== lo) d[k]!.collapsed = true;
    const r = tickDoctrines(s);
    expect(r.competed).toContain(lo);
    expect(d[lo]!.perceivedDelivery).toBeCloseTo(0.48);
  });

  it('does not touch player spark', () => {
    const s = boot();
    const spark = s.player.spark;
    tickDoctrines(s);
    expect(s.player.spark).toBe(spark);
  });
});

describe('doctrineSupplyHook', () => {
  it('broken route lowers real (not perceived) delivery of that town doctrine', () => {
    const s = boot();
    const d = ensureDoctrines(s);
    const id = Object.keys(d).sort()[0]!;
    const { realDelivery, perceivedDelivery, townId } = d[id]!;
    doctrineSupplyHook(s, { townId, reason: 'route_broken', deltaRealDelivery: 0.05 });
    expect(d[id]!.realDelivery).toBeCloseTo(Math.max(0, realDelivery - 0.05));
    expect(d[id]!.perceivedDelivery).toBe(perceivedDelivery);
  });

  it('is registered by bootPlayState', () => {
    expect(boot().economyHooks?.doctrine).toBe(doctrineSupplyHook);
  });
});
