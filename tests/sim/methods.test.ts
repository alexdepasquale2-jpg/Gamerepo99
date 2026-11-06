import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/sim/event-bus';
import { assembleInhabitant } from '../../src/sim/inhabitant';
import { loadData } from '../../src/sim/load-data';
import { commitMethod } from '../../src/sim/methods';
import { createRng } from '../../src/sim/rng';
import type { SimState } from '../../src/sim/types/runtime';
import { seedPeopleFlame } from '../../src/sim/world';

/** Boot Ashford with a playable archetype for method resolve tests. */
function bootAshford(archetypeId: string): SimState {
  const data = loadData();
  const rng = createRng(42);
  const player = assembleInhabitant(data, archetypeId);
  const people = seedPeopleFlame(data, 'ashford');
  return {
    day: 1,
    seed: 42,
    player,
    people,
    flags: {},
    packets: [],
    bus: { lastIds: [], ...createEventBus() },
    data,
    rng,
  } as SimState;
}

describe('commitMethod', () => {
  it('shame on jonah refuses with visible menu semantics', () => {
    const state = bootAshford('marrow');
    const r = commitMethod(state, 'jonah_pike', 'shame');
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') throw new Error('expected refused');
    expect(r.line.length).toBeGreaterThan(0);
    expect(state.player.spark).toBeLessThan(70); // coal flicker -1
    expect(state.people.jonah_pike.flame).toBe(state.people.jonah_pike.flameStart ?? 18);
  });

  it('challenge on marta raises flame using matrix', () => {
    const state = bootAshford('marrow');
    const before = state.people.marta_ellison.flame;
    const r = commitMethod(state, 'marta_ellison', 'challenge');
    expect(r.kind).toBe('resolved');
    expect(state.people.marta_ellison.flame).toBeGreaterThan(before);
  });
});
