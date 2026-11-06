import { describe, it, expect } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { listRoutesFrom, startTravel } from '../../src/sim/travel';
import type { PlaySession } from '../../src/sim';

describe('travel play', () => {
  it('travel advances day by daysEff and may emit encounter', () => {
    const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' });
    expect(s).not.toBeNull();
    if (!s || !('listActions' in s)) throw new Error('expected play session');
    const play = s as PlaySession;
    play.start();
    const day0 = play.snapshot().day;
    const townId = play.snapshot().townId;
    const routes =
      typeof play.listRoutes === 'function'
        ? play.listRoutes()
        : listRoutesFrom([], townId);
    expect(routes.length).toBeGreaterThan(0);
    expect(typeof play.travel).toBe('function');
    play.travel!(routes[0]!);
    expect(play.snapshot().day).toBeGreaterThanOrEqual(day0 + 1);
  });

  it('startTravel returns daysEff and moves player along route', () => {
    const routes = [
      { id: 'route_a_b', fromId: 'town_a', toId: 'town_b', days: 2, biomeIds: [] },
    ];
    const state = {
      day: 1,
      seed: 1,
      player: { id: 'p', archetypeId: 'marrow', spark: 70, hookIds: [], statusTraits: [], embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] }, townId: 'town_a' },
      people: {},
      flags: {},
      packets: [],
      bus: { lastIds: [] as string[] },
      routes,
      rng: { next: () => 0.01, int: () => 0, nextInt: () => 0 },
    };
    const result = startTravel(state, 'route_a_b');
    expect(result.daysEff).toBeGreaterThanOrEqual(1);
    expect(state.day).toBeGreaterThanOrEqual(2);
    expect(state.player.townId).toBe('town_b');
    expect(state.bus.lastIds!.some((id) => id === 'route.travel_step')).toBe(true);
  });
});
