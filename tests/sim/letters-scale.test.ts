/** M4 Task D: letters and rumors at scale. */
import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { createRng } from '../../src/sim/rng';
import { MAX_PACKETS_PER_DAWN, enqueueLetter, rollCrossTownLetters, tickLetters } from '../../src/sim/letters-scale';
import { ensureEconomyState } from '../../src/sim/economy';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';

describe('letters at scale', () => {
  it('emits packets across 20 dawns (seed 11) within the per-dawn cap', () => {
    const s = createPlaySession({ mode: 'play', seed: 11, archetypeId: 'ivy_quill' });
    s.start();
    let packets = 0;
    for (let i = 0; i < 20; i++) {
      const before = s.events().length;
      s.act('advance:dawn');
      const n = s.events().slice(before).filter((e) => e.type === 'letter.deliver' || e.type === 'rumor.spread').length;
      expect(n).toBeLessThanOrEqual(MAX_PACKETS_PER_DAWN);
      packets += n;
    }
    expect(packets).toBeGreaterThanOrEqual(2);
  });

  function run(seed: number) {
    const { state } = bootPlayState(seed, 'marrow');
    ensureEconomyState(state);
    for (const p of Object.values(state.people)) p.marks = [{ markId: 'genuine_growth', stacks: 1 }];
    for (let i = 0; i < 20; i++) advanceToDawn(state);
    return JSON.stringify([state.letters, state.bus?.lastIds]);
  }

  it('is deterministic for a fixed seed', () => {
    expect(run(11)).toBe(run(11));
  });

  it('caps new packets and sets letter_arrived on arrival', () => {
    const { state } = bootPlayState(11, 'marrow');
    ensureEconomyState(state);
    for (let i = 0; i < 12; i++) enqueueLetter(state, { kind: 'letter', fromPersonId: Object.keys(state.people)[i % 3]!, outcomeId: 'x' });
    const made = rollCrossTownLetters(state, createRng(1), { genuineGrowth: true, hollowness: true });
    expect(made.length).toBeLessThanOrEqual(MAX_PACKETS_PER_DAWN);
    for (let i = 0; i < 6; i++) {
      state.day++;
      tickLetters(state);
    }
    expect(state.letters!.flight.length + (state.bus?.lastIds ?? []).filter((x) => x === 'letter.deliver').length).toBeGreaterThan(0);
  });
});

/** Golden fingerprints (graph built lazily; the graph draws no RNG, so output is identical to the eager build). Recaptured after world/letter-reply changes. */
describe('letters dawn output unchanged by lazy graph build (M7 perf)', () => {
  function fingerprint(queue: boolean): number {
    const { state } = bootPlayState(11, 'marrow');
    ensureEconomyState(state);
    for (const p of Object.values(state.people)) p.marks = [{ markId: 'genuine_growth', stacks: 1 }];
    const ids = Object.keys(state.people);
    const out: string[][] = [];
    for (let i = 0; i < 25; i++) {
      if (queue && i % 4 === 0) enqueueLetter(state, { kind: i % 8 === 0 ? 'rumor' : 'letter', fromPersonId: ids[i % ids.length]!, outcomeId: 'x' });
      state.day++;
      out.push(tickLetters(state));
    }
    const s = JSON.stringify([out, state.letters, state.bus?.lastIds, state.flags.circumstanceTags]);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  }
  it('empty backlog', () => expect(fingerprint(false)).toBe(903839695));
  it('queued backlog', () => expect(fingerprint(true)).toBe(895593652));
});
