import { describe, expect, it } from 'vitest';
import { applyDoctrineAct, ensureDoctrines } from '../../../src/sim/doctrine-tick';
import { ensureEconomyState } from '../../../src/sim/economy/economy-lod';
import { exportWorld, importWorld, legacyTable, pushDelta } from '../../../src/sim/legacy';
import { contentHash } from '../../../src/sim/legacy/delta-log';
import { rollCrossTownLetters } from '../../../src/sim/letters-scale';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceDays } from '../../../src/sim/scenario/scenario-advance';
import type { SimState } from '../../../src/sim/types/runtime';

function play(seed = 7): SimState {
  const { state } = bootPlayState(seed, 'marrow') as { state: SimState };
  ensureEconomyState(state);
  const pid = Object.keys(state.people).sort().find((p) => state.people[p]!.townId === 'ashford')!;
  expect(applyDoctrineAct(state, 'act_carry_promise', pid)).toBeTruthy();
  state.economyRoutes![0]!.broken = true;
  state.economyRoutes![0]!.condition = 0.4;
  advanceDays(state, 2);
  for (let i = 0; i < 40 && !state.legacy!.deltas.some((d) => d.t === 'letter'); i++) {
    rollCrossTownLetters(state, { next: () => 0 }, { genuineGrowth: true, hollowness: true });
  }
  advanceDays(state, 2);
  return state;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (s: SimState): any => JSON.parse(JSON.stringify(exportWorld(s)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rehash = (f: any) => {
  f.contentHash = contentHash(f.seed, f.contentPackIds, f.deltas);
  return f;
};

describe('world file deltas recorded in play', () => {
  it('records doctrine, route and letter deltas; same seed => identical file', () => {
    const a = play();
    const kinds = new Set(a.legacy!.deltas.map((d) => d.t));
    for (const k of ['doctrine', 'route', 'letter']) expect(kinds.has(k as never)).toBe(true);
    expect(JSON.stringify(exportWorld(a))).toBe(JSON.stringify(exportWorld(play())));
  });

  it('round trips onto a fresh state with the deltas applied', () => {
    const a = play();
    const out = importWorld(wire(a));
    if ('error' in out) throw new Error(out.error);
    const route = a.economyRoutes![0]!;
    const got = out.state.economyRoutes!.find((r) => r.id === route.id)!;
    expect([got.broken, got.condition]).toEqual([true, 0.4]);
    const d = ensureDoctrines(a).doctrine_mill_bread!;
    expect(ensureDoctrines(out.state).doctrine_mill_bread!.realDelivery).toBeCloseTo(d.realDelivery);
    expect(out.state.packets.length).toBeGreaterThan(0);
    expect(out.state.legacy!.deltas).toEqual(a.legacy!.deltas);
  });

  it('bounds the log', () => {
    const { state } = bootPlayState(7, 'marrow') as { state: SimState };
    for (let i = 0; i < legacyTable().deltaLogCap + 50; i++) pushDelta(state, { t: 'custom', key: 'k', payload: i, day: 1 });
    expect(state.legacy!.deltas.length).toBe(legacyTable().deltaLogCap);
  });

  it('clamps and drops tampered doctrine, route, letter and imprint contents', () => {
    const f = wire(play());
    const pid = Object.keys(play().people)[0]!;
    f.deltas.unshift(
      { t: 'doctrine', townId: 'ashford', patch: { exposure: 9, control: -3, bogus: 1 }, day: 1 },
      { t: 'doctrine', townId: 'nowhere', patch: { exposure: 1 }, day: 1 },
      { t: 'route', routeId: 'no_such_route', broken: true, day: 1 },
      { t: 'letter', packet: { templateId: 'nope', fromPersonId: pid, toPersonId: pid, packetType: 'x' }, day: 1 },
    );
    f.imprint = { slot: 'reserved', displayName: 'X', speciesTags: [], methodTendencies: { shame: 7 }, refusalHookIds: ['ghost_hook'], notableChoices: [], bonds: [], marksLeft: [], legendSeed: 's' };
    f.worldDigest = undefined;
    const out = importWorld(rehash(f));
    if ('error' in out) throw new Error(out.error);
    const logged = out.state.legacy!.deltas;
    expect(logged.some((d) => d.t === 'route' && d.routeId === 'no_such_route')).toBe(false);
    expect(logged.some((d) => d.t === 'doctrine' && d.townId === 'nowhere')).toBe(false);
    const clamped = logged.find((d) => d.t === 'doctrine' && d.day === 1)!;
    expect(clamped).toMatchObject({ patch: { exposure: 1, control: 0 } });
    expect(JSON.stringify(clamped)).not.toContain('bogus');
    expect(out.state.legacy!.lastImprint!.methodTendencies.shame).toBe(1);
    expect(out.state.legacy!.lastImprint!.refusalHookIds).toEqual([]);
  });
});
