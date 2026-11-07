/** Play boot binds the economy to the generated 2D world's settlements and roads. */
import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import type { DataTables } from '../../../src/sim/load-data';

describe('bindWorldEconomy', () => {
  it('towns, routes, producers and caravan schedules reference generated settlement/road ids', () => {
    for (const seed of [1, 2, 3]) {
      const { state, world } = bootPlayState(seed, 'marrow');
      const settlements = new Set((world.settlements ?? []).map((s) => s.id));
      expect(new Set(Object.keys(state.towns!))).toEqual(settlements);
      const routeIds = new Set((world.routes ?? []).map((r) => r.id));
      expect(new Set(state.economyRoutes!.map((r) => r.id))).toEqual(routeIds);
      for (const r of state.economyRoutes!) {
        expect(settlements.has(r.fromTownId)).toBe(true);
        expect(settlements.has(r.toTownId)).toBe(true);
      }
      const data = state.data as DataTables;
      expect(data.caravanSchedules.every((s) => routeIds.has(s.routeId))).toBe(true);
      expect(data.facilities.every((f) => !f.routeId || routeIds.has(f.routeId))).toBe(true);
      expect(settlements.has(state.player.townId!)).toBe(true);
    }
  });
});
