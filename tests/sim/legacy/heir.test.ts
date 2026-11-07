import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { ensureLegacy, pickHeir, scoreBonds } from '../../../src/sim/legacy';
import { bondedState } from './helpers';

describe('pickHeir', () => {
  it('takes the strongest bond; acts feed the ledger', () => {
    const { state, pid } = bondedState();
    const heir = pickHeir(state);
    expect(heir?.personId).toBe(pid);
    expect(heir!.score).toBeGreaterThanOrEqual(3);
  });

  it('requires minBond and returns null with zero eligible bonds', () => {
    const { state } = bootPlayState(7, 'marrow');
    expect(pickHeir(state)).toBeNull();
    const id = Object.keys(state.people).sort()[0]!;
    ensureLegacy(state).bonds[id] = { events: { carry_completed: 1 }, resentment: 0 };
    expect(pickHeir(state)).toBeNull();
  });

  it('excludes high resentment and breaks ties by sorted personId', () => {
    const { state } = bootPlayState(7, 'marrow');
    const [a, b, c] = Object.keys(state.people).sort() as [string, string, string];
    const lg = ensureLegacy(state);
    lg.bonds[c] = { events: { genuine_growth_applied: 2 }, resentment: 0 };
    lg.bonds[b] = { events: { genuine_growth_applied: 2 }, resentment: 0 };
    lg.bonds[a] = { events: { genuine_growth_applied: 5 }, resentment: 3 };
    expect(scoreBonds(state).map((x) => x.personId)).toEqual([b, c]);
    expect(pickHeir(state)?.personId).toBe(b);
  });

  it('weights dependence events x0.5 and flags the dependence path', () => {
    const { state } = bootPlayState(7, 'marrow');
    const id = Object.keys(state.people).sort()[0]!;
    ensureLegacy(state).bonds[id] = { events: { dependence_stack: 8 }, resentment: 0 };
    const h = pickHeir(state)!;
    expect(h.score).toBe(4);
    expect(h.viaDependence).toBe(true);
  });
});
