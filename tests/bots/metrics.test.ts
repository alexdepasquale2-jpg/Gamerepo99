import { describe, expect, it } from 'vitest';
import {
  detectStuck,
  detectBoredom,
  methodDominance,
  burnoutRate,
  hollowVsReignited,
  type TickTrace,
  type RunSummary,
} from './metrics';
import thresholds from './thresholds.json';

function tick(
  partial: Partial<TickTrace> & Pick<TickTrace, 'tick' | 'fingerprint'>,
): TickTrace {
  return {
    actionCount: 2,
    meaningfulChoices: 2,
    methodId: undefined,
    burnedOut: false,
    hollowCount: 0,
    reignitedCount: 0,
    ...partial,
  };
}

describe('metrics', () => {
  it('detectStuck is true when fingerprint is unchanged for N ticks with no/identical actions', () => {
    const N = thresholds.stuckTicks;
    const traces: TickTrace[] = [];
    for (let i = 0; i < N; i++) {
      traces.push(tick({ tick: i, fingerprint: 'same', actionCount: 0 }));
    }
    expect(detectStuck(traces, thresholds)).toBe(true);
  });

  it('detectStuck is false when fingerprint changes within window', () => {
    const N = thresholds.stuckTicks;
    const traces: TickTrace[] = [];
    for (let i = 0; i < N; i++) {
      traces.push(tick({ tick: i, fingerprint: `fp-${i}`, actionCount: 0 }));
    }
    expect(detectStuck(traces, thresholds)).toBe(false);
  });

  it('detectBoredom is true when meaningfulChoices <= 1 for N ticks', () => {
    const N = thresholds.boredomTicks;
    const traces = Array.from({ length: N }, (_, i) =>
      tick({ tick: i, fingerprint: `f${i}`, meaningfulChoices: 1 }),
    );
    expect(detectBoredom(traces, thresholds)).toBe(true);
  });

  it('detectBoredom is false when a tick has >1 meaningful choices inside window', () => {
    const N = thresholds.boredomTicks;
    const traces = Array.from({ length: N }, (_, i) =>
      tick({
        tick: i,
        fingerprint: `f${i}`,
        meaningfulChoices: i === Math.floor(N / 2) ? 3 : 1,
      }),
    );
    expect(detectBoredom(traces, thresholds)).toBe(false);
  });

  it('methodDominance reports max pick-rate and flags breach above cap', () => {
    const traces: TickTrace[] = [
      tick({ tick: 0, fingerprint: 'a', methodId: 'strike' }),
      tick({ tick: 1, fingerprint: 'b', methodId: 'strike' }),
      tick({ tick: 2, fingerprint: 'c', methodId: 'strike' }),
      tick({ tick: 3, fingerprint: 'd', methodId: 'comfort' }),
    ];
    const result = methodDominance(traces, thresholds);
    expect(result.maxPickRate).toBeCloseTo(0.75);
    expect(result.dominantMethodId).toBe('strike');
    expect(result.breached).toBe(0.75 > thresholds.methodDominanceCap);
  });

  it('burnoutRate is fraction of runs ending burnedOut', () => {
    const runs: RunSummary[] = [
      { burnedOut: true, hollowCount: 0, reignitedCount: 0 },
      { burnedOut: false, hollowCount: 1, reignitedCount: 2 },
      { burnedOut: true, hollowCount: 0, reignitedCount: 0 },
      { burnedOut: false, hollowCount: 0, reignitedCount: 1 },
    ];
    expect(burnoutRate(runs)).toBeCloseTo(0.5);
  });

  it('hollowVsReignited sums hollow and reignited across runs', () => {
    const runs: RunSummary[] = [
      { burnedOut: false, hollowCount: 2, reignitedCount: 1 },
      { burnedOut: true, hollowCount: 1, reignitedCount: 3 },
    ];
    expect(hollowVsReignited(runs)).toEqual({ hollow: 3, reignited: 4 });
  });
});
