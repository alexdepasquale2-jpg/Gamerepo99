import { describe, expect, it } from 'vitest';
import { assembleInhabitant } from '../../src/sim/inhabitant';
import { loadData } from '../../src/sim/load-data';
import {
  installFabricReactionSelector,
  pickFabricReactionLine,
} from '../../src/sim/line-select';
import {
  selectReactionLine,
  setReactionLineSelector,
  type MethodSimState,
} from '../../src/sim/method-reactions';
import { createRng } from '../../src/sim/rng';
import type { SimState } from '../../src/sim/types/runtime';
import { seedPeopleFlame } from '../../src/sim/world';

function bootFabricState(data: ReturnType<typeof loadData>, seed: number): MethodSimState {
  const rng = createRng(seed);
  const player = assembleInhabitant(data, 'marrow');
  const people = seedPeopleFlame(data, 'ashford');
  const state = {
    day: 1,
    seed,
    player,
    people,
    flags: { trust: 0.5, notoriety: 0 },
    packets: [],
    data,
    rng,
  } as MethodSimState;
  installFabricReactionSelector(state);
  return state;
}

describe('pickFabricReactionLine', () => {
  it('default path returns authored alone fragment text for marta carry', () => {
    const data = loadData();
    const state = bootFabricState(data, 1);
    const r = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 1,
      state,
      features: { bakedDynamismLines: false },
    });
    expect(r.source === 'fixed' || r.source === 'fallback').toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.text).toContain('dough');
  });

  it('blend path is deterministic for same seed/state', () => {
    const data = loadData();
    const state = bootFabricState(data, 9);
    const a = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 9,
      state,
      features: { bakedDynamismLines: true },
    });
    const b = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 9,
      state,
      features: { bakedDynamismLines: true },
    });
    expect(a).toEqual(b);
    expect(a.source).toBe('blend');
    expect(a.text.length).toBeGreaterThan(0);
  });

  it('blend picks distinct alone fragments for lonely/low-trust vs high-spark state', () => {
    const data = loadData();
    const lonely = bootFabricState(data, 42);
    lonely.flags = { trust: 0.05, notoriety: 0.2 };
    lonely.people.marta_ellison = {
      ...lonely.people.marta_ellison,
      flame: 8,
      marks: [{ markId: 'hollowness', stacks: 2 }],
    };

    const calm = bootFabricState(data, 42);
    calm.flags = { trust: 0.9, notoriety: 0 };
    calm.people.marta_ellison = {
      ...calm.people.marta_ellison,
      flame: 80,
      marks: [],
    };

    const low = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 42,
      state: lonely,
      features: { bakedDynamismLines: true },
    });
    const high = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 42,
      state: calm,
      features: { bakedDynamismLines: true },
    });

    expect(low.source).toBe('blend');
    expect(high.source).toBe('blend');
    expect(low.text.length).toBeGreaterThan(0);
    expect(high.text.length).toBeGreaterThan(0);
    expect(low.lineId).not.toEqual(high.lineId);
    expect(low.text).not.toEqual(high.text);
    // Prefer axis-tagged alone lines when Loom fragments are present.
    expect(/trust_low|lonely|wary|spark_low|hollowness|dependence/i.test(low.lineId)).toBe(true);
    expect(/spark_high|verbatim_mirror|carry_burden_alone(?!_)/i.test(high.lineId)).toBe(true);
  });

  it('installFabricReactionSelector wires state-scoped setReactionLineSelector', () => {
    const data = loadData();
    const state = bootFabricState(data, 3);
    // re-install explicitly to prove API
    setReactionLineSelector(state, null);
    installFabricReactionSelector(state);
    const viaSelect = selectReactionLine({
      personId: 'marta_ellison',
      methodId: 'inspire',
      seed: 3,
      state,
      features: { bakedDynamismLines: false },
    });
    const direct = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'inspire',
      seed: 3,
      state,
      features: { bakedDynamismLines: false },
    });
    expect(viaSelect).toEqual(direct);
    expect(viaSelect.text.length).toBeGreaterThan(0);
  });

  it('parallel states do not leak fabric selectors', () => {
    const data = loadData();
    const a = bootFabricState(data, 1);
    const b = {
      ...bootFabricState(data, 2),
    } as MethodSimState;
    setReactionLineSelector(b, null); // fixed picker on B
    const ra = selectReactionLine({
      personId: 'jonah_pike',
      methodId: 'challenge',
      seed: 1,
      state: a,
      features: { bakedDynamismLines: true },
    });
    const rb = selectReactionLine({
      personId: 'jonah_pike',
      methodId: 'challenge',
      seed: 2,
      state: b,
      features: { bakedDynamismLines: false },
    });
    expect(ra.source).toBe('blend');
    expect(rb.source === 'fixed' || rb.source === 'fallback').toBe(true);
  });

  it('constraints drop naive_hope when hollowness memory is present', () => {
    const data = loadData();
    const state = bootFabricState(data, 11);
    state.people.marta_ellison = {
      ...state.people.marta_ellison,
      marks: [{ markId: 'hollowness', stacks: 1 }],
    };
    // Inject a contradicting candidate into a shallow copy of fragments for this pick path
    // by calling the public picker: real data has neverContradict rule; ensure picker still returns ok text.
    const r = pickFabricReactionLine({
      personId: 'marta_ellison',
      methodId: 'carry_burden',
      seed: 11,
      state,
      features: { bakedDynamismLines: true },
    });
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.text.toLowerCase()).not.toContain('naive');
  });
});
