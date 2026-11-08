/** Facilities as real places: deterministic positions beside their roads, staffing, shifts, dawn word. */
import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { bindWorldEconomy } from '../../../src/sim/play-session/play-world-economy';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { tickEconomyLod } from '../../../src/sim/economy/economy-lod';
import {
  FACILITY_WORKERS, facilityBoardLines, facilityDawnLines, facilityOutput, facilityPlaces, placeFacilities,
  rolesFor, shiftWorkedToday, staffFactor, updateFacilityStaffing, workShift,
} from '../../../src/sim/economy/facilities';
import { resolveFacilityRoute } from '../../../src/sim/gen/places/facilities-gen';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { boardPages } from '../../../src/sim/board-pages';
import { layoutWorld, pointOnRoad } from '../../../src/sim/map/world-layout';
import { biomeAt } from '../../../src/sim/map/terrain';
import { loadData } from '../../../src/sim/load-data';
import { loadState, saveState } from '../../../src/sim/save';
import type { SimState } from '../../../src/sim/types/runtime';
import { inventoryOf } from '../../../src/sim/goods/inventory';
import '../../../src/sim/contrib';

const boot = (seed = 42) => bootPlayState(seed, 'marrow');
const distToRoad = (path: { q: number; r: number }[], q: number, r: number): number => {
  let best = Infinity;
  for (let i = 0; i <= 400; i++) {
    const p = pointOnRoad(path, i / 400);
    best = Math.min(best, Math.hypot(p.q - q, p.r - r));
  }
  return best;
};

describe('facility places', { timeout: 60_000 }, () => {
  it('are deterministic: same seed, same ids, names and positions', () => {
    const a = boot(42), b = boot(42);
    const key = (s: SimState) => facilityPlaces(s).map((f) => `${f.id}|${f.name}|${f.kind}|${f.q},${f.r}`);
    expect(key(a.state)).toEqual(key(b.state));
    expect(placeFacilities(a.world, layoutWorld(a.world, 42), 42)).toEqual(placeFacilities(b.world, layoutWorld(b.world, 42), 42));
    expect(key(boot(7).state)).not.toEqual(key(a.state));
  });

  it('stand on dry ground beside their road, one producer per road', () => {
    for (const seed of [1, 7, 42]) {
      const { state, world } = boot(seed);
      const layout = layoutWorld(world, seed);
      const places = facilityPlaces(state);
      for (const route of layout.routes) expect(places.filter((p) => p.producer && p.routeId === route.id)).toHaveLength(1);
      for (const p of places) {
        const route = layout.routes.find((r) => r.id === p.routeId)!;
        expect(route, p.id).toBeTruthy();
        expect(p.townIds.sort()).toEqual([route.from, route.to].sort());
        const d = distToRoad(route.path, p.q, p.r);
        expect(d, `${p.id} off its road`).toBeLessThan(25);
        expect(d, `${p.id} on the road`).toBeGreaterThan(1.5);
        expect(biomeAt(seed, p.q, p.r)).not.toBe('water');
        expect(['mill', 'lumber_camp', 'mine', 'waystation']).toContain(p.kind);
        expect(p.name.length).toBeGreaterThan(0);
      }
      expect(new Set(places.map((p) => p.name)).size).toBe(places.length);
      expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    }
  });

  it('keep the old per-road producer output (economy totals hold at full staff)', () => {
    for (const seed of [1, 7, 42]) {
      const { state } = boot(seed);
      for (const p of facilityPlaces(state).filter((f) => f.producer)) {
        expect(p.staffedMul).toBe(1);
        expect(p.outputs).toHaveLength(1);
        const o = p.outputs[0]!;
        expect(o.qtyPerDawn).toBe(o.resourceId === 'food_grain' ? 4 : 2);
        expect({ food_grain: 'mill', timber: 'lumber_camp', ore_iron: 'mine' }[o.resourceId]).toBe(p.kind);
        // Fully staffed at the start of a run.
        expect(facilityOutput(state, p)[0]!.qty).toBe(o.qtyPerDawn);
      }
      for (const r of state.economyRoutes!) for (const id of r.facilityIds) expect(facilityPlaces(state).some((p) => p.id === id)).toBe(true);
    }
  });

  it('generated facilities join the world as named places (waystation on seed 7)', () => {
    const { state, world } = boot(7);
    const ids = facilityPlaces(state).map((p) => p.id);
    for (const f of world.facilities ?? []) expect(ids).toContain(f.id);
    expect(facilityPlaces(state).find((p) => p.kind === 'waystation')?.name).toBe('Strand Waystation');
  });

  it('resolves authored route ids onto generated roads', () => {
    const routes = [{ id: 'road_ashford_lowmere', fromId: 'lowmere', toId: 'ashford', days: 1, biomeIds: [] }];
    expect(resolveFacilityRoute(routes, 'route_ashford_lowmere')).toBe('road_ashford_lowmere');
    expect(resolveFacilityRoute(routes, 'road_ashford_lowmere')).toBe('road_ashford_lowmere');
    expect(resolveFacilityRoute(routes, 'route_ashford_city_glare')).toBeNull();
    expect(resolveFacilityRoute(routes, null)).toBeNull();
  });
});

describe('staffing', { timeout: 60_000 }, () => {
  it('scales output from unstaffedMul to 1', () => {
    const lo = FACILITY_WORKERS.staffing.unstaffedMul;
    expect(staffFactor(0, 2)).toBeCloseTo(lo);
    expect(staffFactor(1, 2)).toBeCloseTo(lo + (1 - lo) / 2);
    expect(staffFactor(2, 2)).toBe(1);
    expect(staffFactor(5, 2)).toBe(1);
    expect(rolesFor('mill')).toBe(2);
    expect(rolesFor('mine')).toBe(1);
  });

  it('every facility starts with a full crew from its road\'s towns, nobody on two crews', () => {
    const { state } = boot(42);
    const seen = new Set<string>();
    for (const p of facilityPlaces(state)) {
      const s = state.facilityStaff![p.id]!;
      expect(s.crew).toHaveLength(rolesFor(p.kind));
      expect(s.staffed).toBe(rolesFor(p.kind));
      for (const c of s.crew) {
        expect(c).toBeTruthy();
        expect(p.townIds).toContain(state.people[c!]!.townId);
        expect(seen.has(c!)).toBe(false);
        seen.add(c!);
      }
    }
  });

  it('a crew that loses its fire leaves the facility idle and it makes less; a rekindled neighbour restaffs it', () => {
    const { state } = boot(42);
    const place = facilityPlaces(state).find((p) => p.producer && p.kind === 'mill')!;
    const crew = state.facilityStaff![place.id]!.crew as string[];
    for (const c of crew) state.people[c]!.flame = 2;
    // Nobody rekindled in the road's towns: no one to take the work up.
    for (const p of Object.values(state.people)) if (place.townIds.includes(p.townId!) && p.flame >= 35) p.flame = 30;
    advanceToDawn(state);
    const s = state.facilityStaff![place.id]!;
    expect(s.idle).toBe(true);
    expect(s.change).toBe('idle');
    expect(s.changedDay).toBe(state.day);
    expect(facilityOutput(state, place)[0]!.qty).toBeCloseTo(4 * FACILITY_WORKERS.staffing.unstaffedMul);
    const lines = facilityDawnLines(state);
    expect(lines.some((l) => l.includes(place.name) && l.includes('idle'))).toBe(true);
    expect(collectDawnLines(state)).toEqual(expect.arrayContaining(lines));

    // Someone in the road's towns is rekindled: they take up the work at the next dawn.
    const helper = Object.values(state.people).find((p) => place.townIds.includes(p.townId!) && !crew.includes(p.id) && !Object.values(state.facilityStaff!).some((x) => x.crew.includes(p.id)))!;
    helper.flame = 50;
    advanceToDawn(state);
    const after = state.facilityStaff![place.id]!;
    expect(after.idle).toBe(false);
    expect(after.change).toBe('restaffed');
    expect(after.crew).toContain(helper.id);
    expect(facilityDawnLines(state).some((l) => l.includes(place.name) && l.includes((helper.name ?? '').split(' ')[0]!))).toBe(true);
  });

  it('idle facilities deliver less stock to their road\'s towns at dawn', () => {
    const run = (idle: boolean) => {
      const { state } = boot(42);
      const place = facilityPlaces(state).find((p) => p.producer && p.kind === 'mill')!;
      if (idle) for (const c of state.facilityStaff![place.id]!.crew) state.people[c!]!.flame = 0;
      for (const p of Object.values(state.people)) if (p.flame >= 35) p.flame = 30;
      const res = tickEconomyLod(state);
      return res.moved.filter((m) => m.routeId === place.routeId && m.resourceId === 'food_grain').reduce((a, m) => a + m.qty, 0);
    };
    const full = run(false), idle = run(true);
    expect(full).toBeCloseTo(4);
    expect(idle).toBeCloseTo(4 * FACILITY_WORKERS.staffing.unstaffedMul);
  });

  it('crews persist through save and load; saves without crews deal them fresh', () => {
    const { state, world } = boot(42);
    const crews = JSON.parse(JSON.stringify(state.facilityStaff));
    const loaded = loadState(saveState(state), loadData());
    bindWorldEconomy(loaded, world);
    expect(loaded.facilityStaff).toEqual(crews);
    const blob = saveState(state);
    delete (blob.sim as Record<string, unknown>).facilityStaff;
    const old = loadState(blob, loadData());
    bindWorldEconomy(old, world);
    expect(Object.keys(old.facilityStaff!).sort()).toEqual(facilityPlaces(old).map((p) => p.id).sort());
    updateFacilityStaffing(old);
    expect(Object.values(old.facilityStaff!).every((s) => !s.idle)).toBe(true);
  });
});

describe('work a shift', { timeout: 60_000 }, () => {
  it('yields goods to the satchel and the road\'s towns, once a day, and lifts the spark for meaningful work', () => {
    const { state } = boot(42);
    const mill = facilityPlaces(state).find((p) => p.kind === 'mill')!;
    const [a, b] = mill.townIds as [string, string];
    const before = { a: state.towns![a]!.stock.food_grain ?? 0, b: state.towns![b]!.stock.food_grain ?? 0, flour: state.inventory?.flour ?? 0 };
    state.player.spark = 50;
    const r = workShift(state, mill.id, (t) => `Town ${t}`);
    expect(r.ok).toBe(true);
    expect(r.line).toContain(mill.name);
    expect(r.line).toContain(`Town ${a}`);
    expect(r.hours).toBe(8);
    expect(state.inventory!.flour).toBe(before.flour + 2);
    expect(state.towns![a]!.stock.food_grain).toBeCloseTo(before.a + 2);
    expect(state.towns![b]!.stock.food_grain).toBeCloseTo(before.b + 2);
    expect(r.sparkDelta).toBe(FACILITY_WORKERS.shift.meaningSpark);
    expect(state.player.spark).toBe(50 + FACILITY_WORKERS.shift.meaningSpark);
    expect(shiftWorkedToday(state)).toBe(true);
    const again = workShift(state, mill.id);
    expect(again.ok).toBe(false);
    expect(state.inventory!.flour).toBe(before.flour + 2);
    advanceToDawn(state);
    expect(workShift(state, mill.id).ok).toBe(true);
  });

  it('hard work (a quarry) lifts the spark only a little; spark never rises past its max', () => {
    const { state } = boot(42);
    const quarry = facilityPlaces(state).find((p) => p.kind === 'mine')!;
    state.player.spark = 40;
    const r = workShift(state, quarry.id);
    expect(r.ok).toBe(true);
    expect(r.sparkDelta).toBe(FACILITY_WORKERS.shift.workSpark);
    expect(r.sparkDelta).toBeLessThan(FACILITY_WORKERS.shift.meaningSpark);
    expect(state.inventory!.ore).toBeGreaterThan(0);
    const fresh = boot(42).state;
    fresh.player.spark = 100;
    workShift(fresh, facilityPlaces(fresh).find((p) => p.kind === 'mill')!.id);
    expect(fresh.player.spark).toBe(100);
  });

  it('a waystation shift earns coin and mends its road', () => {
    const { state } = boot(7);
    const way = facilityPlaces(state).find((p) => p.kind === 'waystation')!;
    const route = state.economyRoutes!.find((r) => r.id === way.routeId)!;
    route.condition = 0.5;
    const coin = inventoryOf(state).coin ?? 0;
    const r = workShift(state, way.id);
    expect(r.ok).toBe(true);
    expect(state.inventory!.coin).toBe(coin + 2);
    expect(route.condition).toBeCloseTo(0.65);
  });

  it('unknown facility: no work, no change', () => {
    const { state } = boot(42);
    expect(workShift(state, 'nope').ok).toBe(false);
    expect(shiftWorkedToday(state)).toBe(false);
  });
});

describe('surface', { timeout: 60_000 }, () => {
  it('the noticeboard lists the works on a town\'s roads', () => {
    const { state } = boot(42);
    const town = state.player.townId!;
    const page = boardPages().find((p) => p.id === 'works')!;
    const lines = page.render(state, town, (t) => t).lines!;
    expect(lines.join('\n')).toContain(facilityPlaces(state).find((p) => p.townIds.includes(town))!.name);
    expect(facilityBoardLines(state, 'nowhere', (t) => t)).toEqual(['No works stand on our roads.']);
  });
});
