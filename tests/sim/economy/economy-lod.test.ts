/**
 * M4 Packet 01 — dawn economy LOD (tickEconomyLod).
 * Tables: src/data/economy/dawn-stock.json + economy-lod.json.
 */
import { describe, expect, it, vi } from 'vitest';
import { createPlaySession, tickEconomyLod, type PlaySession } from '../../../src/sim';
import { ensureEconomyState } from '../../../src/sim/economy';
import { loadData } from '../../../src/sim/load-data';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import type { SimState } from '../../../src/sim/types/runtime';

const SEED = 42;

function bootState(seed = SEED): SimState {
  const { state } = bootPlayState(seed, 'marrow');
  ensureEconomyState(state);
  state.economyHooks = undefined; // isolate LOD from caravans (packet-02 registers the hook at boot)
  return state;
}

function juiceSince(state: SimState, before: number): string[] {
  return state.bus?.lastIds?.slice(before) ?? [];
}

function town(state: SimState, id: string) {
  const t = state.towns?.[id];
  if (!t) throw new Error(`missing town ${id}`);
  return t;
}

describe('economy LOD tables', () => {
  it('loadData exposes economyLod + dawnStock', () => {
    const data = loadData();
    expect(data.economyLod.despair.maxAddPerDawn).toBe(0.05);
    expect(data.dawnStock.foodResourceId).toBe('food_grain');
    expect(data.economyRoutes.some((r) => r.id === 'route_ashford_lowmere')).toBe(true);
    expect(data.facilities.some((f) => f.id === 'fac_ashford_mill')).toBe(true);
    expect(data.economyResources.some((r) => r.id === 'food_grain')).toBe(true);
  });
});

describe('tickEconomyLod (M4 packet-01)', () => {
  it('opt-out: ashford economyOptIn false → 10 dawns raise no despair, move no stock, no stock.starve', () => {
    const state = bootState();
    expect(town(state, 'ashford').economyOptIn).toBe(false);
    const before = JSON.parse(JSON.stringify(state.towns));
    const juiceBefore = state.bus?.lastIds?.length ?? 0;
    for (let i = 0; i < 10; i++) advanceToDawn(state);
    expect(state.towns).toEqual(before);
    const juice = juiceSince(state, juiceBefore);
    expect(juice).not.toContain('stock.starve');
    expect(juice).not.toContain('stock.deliver');

    const s = createPlaySession({ mode: 'play', seed: SEED, archetypeId: 'marrow' }) as PlaySession;
    s.start();
    for (let i = 0; i < 10; i++) s.act('advance:dawn');
    const types = s.events().map((e) => e.type);
    expect(types).not.toContain('stock.starve');
    // stock.deliver may appear: caravans (packet-02) deliver into Ashford by design.
  });

  it('opt-in flow: lowmere opt-in → stock grows from route_ashford_lowmere + stock.deliver juice', () => {
    const state = bootState();
    const lowmere = town(state, 'lowmere');
    lowmere.economyOptIn = true;
    const food0 = lowmere.stock.food_grain!;
    const timber0 = lowmere.stock.timber!;
    const despair0 = lowmere.despair;
    const juiceBefore = state.bus?.lastIds?.length ?? 0;

    advanceToDawn(state);

    // mill 3*1.0 + camp timber 2*0.8 / fuel 1*0.8; condition 1.0; receiveShare 0.5; grain spoils 2%.
    expect(lowmere.stock.food_grain).toBeCloseTo((food0 + 1.5) * 0.98, 6);
    expect(lowmere.stock.timber).toBeCloseTo(timber0 + 0.8, 6);
    expect(lowmere.despair).toBe(despair0);
    expect(juiceSince(state, juiceBefore)).toContain('stock.deliver');

    for (let i = 0; i < 4; i++) advanceToDawn(state);
    expect(lowmere.stock.food_grain!).toBeGreaterThan(food0);
    // Ashford stays inert even though it sits on the same route.
    expect(town(state, 'ashford').stock).toEqual(bootState().towns!.ashford!.stock);
  });

  it('opt-in flow returns moved entries and is deterministic per seed', () => {
    const run = () => {
      const state = bootState();
      town(state, 'lowmere').economyOptIn = true;
      town(state, 'city_reach').economyOptIn = true;
      const results = [];
      for (let i = 0; i < 5; i++) results.push(tickEconomyLod(state));
      return { results, towns: state.towns };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    const first = a.results[0]!;
    expect(first.moved).toContainEqual({
      routeId: 'route_ashford_city_glare',
      resourceId: 'ore_iron',
      toTownId: 'city_reach',
      qty: expect.closeTo(4 * 1.0 * 0.85 * 0.7, 6),
    });
    expect(first.moved.every((m) => m.toTownId !== 'ashford')).toBe(true);
  });

  it('opt-in seeds missing stock from dawn-stock.seedStockByTown', () => {
    const state = bootState();
    const lowmere = town(state, 'lowmere');
    lowmere.economyOptIn = true;
    lowmere.stock = {};
    tickEconomyLod(state);
    // seed 8 grain + 1.5 delivered, then 2% spoil.
    expect(lowmere.stock.food_grain).toBeCloseTo((8 + 1.5) * 0.98, 6);
    expect(lowmere.stock.wool).toBeCloseTo(3 * 0.99, 6);
  });

  it('starve cap: food_grain < 1 → despair delta ≤ 0.05 per dawn + stock.starve', () => {
    const state = bootState();
    const reach = town(state, 'city_reach');
    reach.economyOptIn = true;
    reach.stock.food_grain = 0.5;
    for (let i = 0; i < 5; i++) {
      const d0 = reach.despair;
      const juiceBefore = state.bus?.lastIds?.length ?? 0;
      const res = tickEconomyLod(state);
      const delta = reach.despair - d0;
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(res.starved).toContain('city_reach');
      expect(juiceSince(state, juiceBefore)).toContain('stock.starve');
    }
  });

  it('starve + broken route together still cap at 0.05 per dawn; despair clamps at 1', () => {
    const state = bootState();
    const lowmere = town(state, 'lowmere');
    lowmere.economyOptIn = true;
    lowmere.stock.food_grain = 0;
    state.economyRoutes!.find((r) => r.id === 'route_ashford_lowmere')!.broken = true;
    const d0 = lowmere.despair;
    advanceToDawn(state);
    expect(lowmere.despair - d0).toBeCloseTo(0.05, 9);

    lowmere.despair = 0.99;
    advanceToDawn(state);
    expect(lowmere.despair).toBe(1);
  });

  it('broken route: despair += 0.05 when opt-in and doctrine stub is invoked', () => {
    const state = bootState();
    const lowmere = town(state, 'lowmere');
    lowmere.economyOptIn = true;
    state.economyRoutes!.find((r) => r.id === 'route_ashford_lowmere')!.broken = true;
    const doctrine = vi.fn();
    const caravan = vi.fn();
    state.economyHooks = { doctrine, caravan };
    const d0 = lowmere.despair;
    const food0 = lowmere.stock.food_grain!;
    const juiceBefore = state.bus?.lastIds?.length ?? 0;

    advanceToDawn(state);

    expect(lowmere.despair - d0).toBeCloseTo(0.05, 9);
    expect(doctrine).toHaveBeenCalledWith(state, {
      townId: 'lowmere',
      reason: 'route_broken',
      deltaRealDelivery: 0.05,
    });
    expect(caravan).toHaveBeenCalledWith(state);
    // No flow over a broken route; only spoil.
    expect(lowmere.stock.food_grain).toBeCloseTo(food0 * 0.98, 6);
    expect(juiceSince(state, juiceBefore)).not.toContain('stock.deliver');
  });

  it('broken route on opt-out town does nothing; hook params override state registry', () => {
    const state = bootState();
    state.economyRoutes!.find((r) => r.id === 'route_ashford_lowmere')!.broken = true;
    const doctrine = vi.fn();
    const d0 = town(state, 'ashford').despair;
    tickEconomyLod(state, { doctrine });
    expect(doctrine).not.toHaveBeenCalled();
    expect(town(state, 'ashford').despair).toBe(d0);
  });

  it('does not touch player spark', () => {
    const state = bootState();
    town(state, 'lowmere').economyOptIn = true;
    town(state, 'lowmere').stock.food_grain = 0;
    const spark = state.player.spark;
    tickEconomyLod(state);
    expect(state.player.spark).toBe(spark);
  });
});
