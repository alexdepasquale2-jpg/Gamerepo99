import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/sim/event-bus';
import { assembleInhabitant } from '../../src/sim/inhabitant';
import { loadData } from '../../src/sim/load-data';
import {
  commitMethod,
  setReactionLineSelector,
  type ReactionLineSelector,
} from '../../src/sim/methods';
import { createRng } from '../../src/sim/rng';
import type { SimState } from '../../src/sim/types/runtime';
import { seedPeopleFlame } from '../../src/sim/world';

/** Boot Ashford with a playable archetype for method resolve tests. */
function bootAshford(archetypeId: string, seed = 42): SimState {
  const data = loadData();
  const rng = createRng(seed);
  const player = assembleInhabitant(data, archetypeId);
  const people = seedPeopleFlame(data, 'ashford');
  const bus = createEventBus();
  return {
    day: 1,
    seed,
    player,
    people,
    flags: {},
    packets: [],
    bus: { lastIds: [], ...bus },
    data,
    rng,
  } as SimState;
}

describe('commitMethod', () => {
  it('shame on jonah refuses with visible menu semantics', () => {
    const state = bootAshford('marrow');
    const sparkBefore = state.player.spark;
    const r = commitMethod(state, 'jonah_pike', 'shame');
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') throw new Error('expected refused');
    expect(r.line.length).toBeGreaterThan(0);
    expect(state.player.spark).toBeLessThan(sparkBefore); // coal flicker / spend
    expect(state.people.jonah_pike.flame).toBe(state.people.jonah_pike.flameStart ?? 18);
  });

  it('challenge on marta raises flame using matrix', () => {
    const state = bootAshford('marrow');
    const before = state.people.marta_ellison.flame;
    const r = commitMethod(state, 'marta_ellison', 'challenge');
    expect(r.kind).toBe('resolved');
    expect(state.people.marta_ellison.flame).toBeGreaterThan(before);
  });

  it('parallel states do not share reaction line selectors', () => {
    const stateA = bootAshford('marrow', 1);
    const stateB = bootAshford('marrow', 2);
    const seen: { a?: string; b?: string } = {};
    stateA.bus!.on?.('person.reaction', (p: { line: string }) => {
      seen.a = p.line;
    });
    stateB.bus!.on?.('person.reaction', (p: { line: string }) => {
      seen.b = p.line;
    });

    const custom: ReactionLineSelector = () => ({
      lineId: 'custom',
      text: 'STATE_A_ONLY',
      source: 'blend',
    });
    setReactionLineSelector(stateA, custom);

    expect(commitMethod(stateA, 'marta_ellison', 'challenge').kind).toBe('resolved');
    expect(commitMethod(stateB, 'marta_ellison', 'challenge').kind).toBe('resolved');
    expect(seen.a).toBe('STATE_A_ONLY');
    expect(seen.b).toBeDefined();
    expect(seen.b).not.toBe('STATE_A_ONLY');
  });
});
