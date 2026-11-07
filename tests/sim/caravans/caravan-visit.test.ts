/** Caravans arrive in real time, halt, unload into real stock, trade, turn around, and move shortages. */
import { describe, expect, it } from 'vitest';
import { advanceCaravanTravel, tickCaravans } from '../../../src/sim/caravans';
import { PHASE_DAYS, caravanStatus, townShortages } from '../../../src/sim/caravan-visit';
import { saveState, loadState } from '../../../src/sim/save';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import type { CaravanMobile } from '../../../src/sim/caravans-types';
import type { SimState } from '../../../src/sim/types/runtime';
import type { DataTables } from '../../../src/sim/load-data';
import { caravanCrates, turnFraction } from '../../../src/render/goods/caravan-crates';

const STOP = PHASE_DAYS.unloading + PHASE_DAYS.trading + PHASE_DAYS.departing;

/** A booted world with one wagon about to reach the far end of its first road. */
function fixture(cargo = 'food_grain', qty = 4) {
  const { state } = bootPlayState(7, 'marrow');
  const route = state.economyRoutes![0]!;
  route.days = 1; route.condition = 1; route.broken = false;
  const sched = { id: 'cav_t', routeId: route.id, departDawnMod: 0, periodDays: 9999, cargoResourceId: cargo, qty, lean: 'good', maxConcurrent: 2 };
  (state.data as DataTables).caravanSchedules = [sched];
  const m: CaravanMobile = { id: 'cav_t@0', scheduleId: 'cav_t', routeId: route.id, progress01: 0.99, heading: 'outbound', cargoResourceId: cargo, qty, dawnSpawned: 0 };
  state.caravans = [m];
  const to = state.towns![route.toTownId]!, from = state.towns![route.fromTownId]!;
  return { state, route, m, to, from };
}
const run = (s: SimState, days: number, step = 0.005) => { for (let t = 0; t < days; t += step) advanceCaravanTravel(s, step); };

describe('caravan visits (real-time stop, unload, trade, turn around)', () => {
  it('halts on arrival without waiting for dawn, and the wagon stays put', () => {
    const { state, m, to } = fixture();
    const grain = to.stock.food_grain ?? 0;
    advanceCaravanTravel(state, 0.02);
    expect(m.phase).toBe('unloading');
    expect(m.progress01).toBe(1);
    expect(caravanStatus(m)).toMatch(/^Unloading 0\/4/);
    expect(to.stock.food_grain).toBe(grain); // nothing off the wagon yet
    expect(m.heading).toBe('outbound');
  });

  it('unloads crate by crate into town stock over the stop', () => {
    const { state, m, to } = fixture();
    to.stock.food_grain = 20;
    advanceCaravanTravel(state, 0.02); // arrive
    const seen: number[] = [];
    for (let t = 0; t < PHASE_DAYS.unloading; t += 0.005) {
      advanceCaravanTravel(state, 0.005);
      seen.push(to.stock.food_grain! - 20);
    }
    expect(seen.some((n) => n > 0 && n < 4)).toBe(true); // visible mid-way
    expect(seen.every((n, i) => i === 0 || n >= seen[i - 1]!)).toBe(true);
    expect(to.stock.food_grain).toBe(24);
    expect(m.qty).toBe(0);
    expect(m.visit!.moved).toBe(4);
  });

  it('runs the whole stop: unload, trade surplus aboard, turn around, head back', () => {
    const { state, m, to, route } = fixture();
    to.stock.food_grain = 20; to.stock.timber = 18; to.despair = 0.5;
    advanceCaravanTravel(state, 0.02);
    const phases = new Set<string>();
    for (let t = 0; t < STOP + 0.05 && m.heading === 'outbound'; t += 0.002) { advanceCaravanTravel(state, 0.002); if (m.phase) phases.add(m.phase); }
    expect([...phases]).toEqual(['unloading', 'trading', 'departing']);
    expect(m.heading).toBe('return');
    expect(m.phase).toBeUndefined();
    expect(m.progress01).toBe(0);
    // The town sold its biggest surplus (timber) and was paid for the grain it took.
    expect(m.cargoResourceId).toBe('timber');
    expect(m.qty).toBe(3);
    expect(to.stock.timber).toBe(15);
    expect(to.stock.food_grain).toBe(24);
    expect(to.caravanTrade).toMatchObject({ visits: 1, received: 4, sold: 3 });
    // And it travels back along the same road.
    run(state, 0.5);
    expect(m.progress01).toBeGreaterThan(0.4);
    expect(route.id).toBe(m.routeId);
  });

  it('delivers a full leg home, unloads the back-haul at the origin, then retires', () => {
    const { state, m, to, from } = fixture();
    to.stock.food_grain = 20; to.stock.timber = 18;
    const home = from.stock.timber ?? 0;
    run(state, 2.5);
    expect(state.caravans).toHaveLength(0);
    expect(from.stock.timber).toBe(home + 3);
    expect(from.caravanTrade?.received).toBe(3);
    expect(m.heading).toBe('return');
  });

  it('shortages are measurably cut by deliveries, and their despair eases per crate', () => {
    const { state, to } = fixture('food_grain', 6);
    to.stock.food_grain = 0; to.despair = 0.5;
    const before = townShortages(state, to.id).find((s) => s.resource === 'food_grain')!;
    expect(before.missing).toBe(4);
    run(state, 0.3);
    const after = townShortages(state, to.id).find((s) => s.resource === 'food_grain');
    expect(after).toBeUndefined(); // 6 crates cleared a 4-crate shortage
    expect(to.stock.food_grain).toBe(6);
    // Only crates that went into the shortage eased despair (0 -> 4 crates): 4 * 0.04.
    expect(to.despair).toBeCloseTo(0.5 - 4 * 0.04, 6);
    expect(to.caravanTrade!.relieved).toBe(4);
  });

  it('a delivery into a well-stocked town does not touch despair', () => {
    const { state, to } = fixture();
    to.stock.food_grain = 30; to.despair = 0.4;
    run(state, 0.3);
    expect(to.despair).toBe(0.4);
    expect(to.stock.food_grain).toBe(34);
  });

  it('an opted-out town gets the goods but no despair change', () => {
    const { state, to } = fixture();
    to.economyOptIn = false; to.stock.food_grain = 0; to.despair = 0.4;
    run(state, 0.3);
    expect(to.stock.food_grain).toBeGreaterThan(0);
    expect(to.despair).toBe(0.4);
  });

  it('never sells back the good just delivered, and never sells below the surplus line', () => {
    const { state, m, to } = fixture();
    to.stock.food_grain = 30; to.stock.timber = 5; to.stock.ore_iron = 5;
    run(state, 0.3);
    expect(m.cargoResourceId).toBe('food_grain'); // unchanged: nothing to buy back
    expect(m.qty).toBe(0);
    expect(to.stock.timber).toBe(5);
  });

  it('waits while the player is talking to it', () => {
    const { state, m } = fixture();
    advanceCaravanTravel(state, 0.02);
    const left = m.phaseLeft;
    advanceCaravanTravel(state, 0.05, m.id);
    expect(m.phaseLeft).toBe(left);
  });

  it('dawn finishes a halted stop; a dawn arrival does the whole visit at once', () => {
    const { state, m, to } = fixture();
    to.stock.food_grain = 20;
    advanceCaravanTravel(state, 0.02);
    expect(m.phase).toBe('unloading');
    tickCaravans(state, 1);
    expect(m.phase).toBeUndefined();
    expect(m.heading).toBe('return');
    expect(to.stock.food_grain).toBe(24);

    const f = fixture();
    f.to.stock.food_grain = 20;
    tickCaravans(f.state, 1); // 0.99 + a day's march
    expect(f.m.heading).toBe('return');
    expect(f.to.stock.food_grain).toBe(24);
  });

  it('is deterministic and survives a save/load mid-stop', () => {
    const go = () => { const f = fixture(); f.to.stock.timber = 14; run(f.state, 0.12); return JSON.stringify([f.state.caravans, f.state.towns]); };
    expect(go()).toBe(go());

    const f = fixture();
    advanceCaravanTravel(f.state, 0.02);
    advanceCaravanTravel(f.state, 0.03);
    const blob = JSON.parse(JSON.stringify(saveState(f.state)));
    const loaded = loadState(blob, f.state.data as DataTables);
    expect(loaded.caravans![0]).toMatchObject({ phase: 'unloading', heading: 'outbound' });
    run(loaded, 0.3);
    expect(loaded.caravans![0]).toMatchObject({ heading: 'return' });
  });

  it('crate and turn helpers track the phase', () => {
    const { state, m } = fixture('food_grain', 4);
    advanceCaravanTravel(state, 0.02);
    advanceCaravanTravel(state, PHASE_DAYS.unloading * 0.3);
    const c = caravanCrates(m);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ towardTown: true });
    expect(turnFraction(m)).toBe(0);
    m.phase = 'departing'; m.phaseLeft = PHASE_DAYS.departing / 4;
    expect(turnFraction(m)).toBeCloseTo(0.75);
    expect(caravanCrates(m)).toEqual([]);
  });
});
