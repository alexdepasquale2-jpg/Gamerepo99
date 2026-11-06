import { describe, expect, it } from 'vitest';
import { createInteractionRuntime, resolveInteraction } from '../../src/sim/interactions';

describe('resolveInteraction', () => {
  it('work_alongside changes flame01 and spark by table (no methods.sparkCost)', () => {
    const rt = createInteractionRuntime({
      catalog: {
        interactions: [{
          id: 'work_alongside',
          kind: 'work_alongside',
          baseStrain: 3,
          sparkGain: 3,
          touch: { flame01: 0.04 },
          bondDelta: 0,
          ripple: 'help',
          tags: ['meaning'],
        }],
      },
      scoring: {
        spark: { sparkMax: 100, situationMulDefault: 1 },
        touchScoreWeights: { flame01Abs: 10, meaning: 4, bond: 5, genuine_growth: 4, keptPromise: 5, presenceDay: 1, giftAccepted: 3, stoodUp: 4, brokenPromise: -6, hollownessAdd: -3, resentmentAdd: -2 },
        reignite: { touchScoreMin: 24, flame01Min: 0.45, requireHollownessStacks: 0 },
      },
      person: { id: 'marta', flame01: 0.28, trust: 0.35, marks: { hollowness: 1 }, touchScore: 7.8, presence: 2, bond: 1, spark: 86 },
    });
    const out = resolveInteraction(rt, 'work_alongside', 'marta');
    expect(out.flame01).toBeCloseTo(0.32, 5);
    expect(out.spark).toBe(86); // -3 +3
    expect(out.touchScore).toBeCloseTo(12.2, 5); // +0.04*10 + meaning 4
    expect(out.usedMethodSparkCost).toBe(false);
  });
});

describe('reignite gate', () => {
  const scoring = {
    spark: { sparkMax: 100, situationMulDefault: 1 },
    touchScoreWeights: { flame01Abs: 10, meaning: 4, bond: 5, keptPromise: 5 },
    reignite: { touchScoreMin: 24, flame01Min: 0.45, requireHollownessStacks: 0 },
    onReignite: { removeMarks: ['hollowness'], addMarks: { genuine_growth: 1 } },
  };
  const d = (id: string, extra: object = {}) => ({ id, kind: id, baseStrain: 0, sparkGain: 0, ...extra });
  const catalog = {
    interactions: [
      d('show_up', { touch: { flame01: 0.05 } }),
      d('talk_gentle', { touch: { flame01: 0.05 } }),
      d('favor_do', { touch: { flame01: 0.05 }, bondDelta: 1 }),
      d('work_alongside', { touch: { flame01: 0.04 }, tags: ['meaning'] }),
      d('promise_keep', { tags: ['kept_promise'], marksAdd: { hollowness: -1 } }),
    ],
  };

  it('reignites only at the end of a 5-kind sequence', () => {
    const rt = createInteractionRuntime({
      catalog, scoring,
      person: { id: 'marta', flame01: 0.28, trust: 0.35, marks: { hollowness: 1 }, touchScore: 7.8, presence: 2, bond: 1, spark: 86 },
    });
    const seq = ['show_up', 'talk_gentle', 'favor_do', 'work_alongside', 'promise_keep', 'talk_gentle'];
    const outs = seq.map((id) => resolveInteraction(rt, id, 'marta'));
    expect(outs.map((o) => o.reignited)).toEqual([false, false, false, false, false, true]);
    const m = rt.people.get('marta')!.marks;
    expect(m.hollowness ?? 0).toBe(0);
    expect(m.genuine_growth).toBe(1);
  });

  it('a single interaction never reignites even with forced high scores', () => {
    const rt = createInteractionRuntime({
      catalog, scoring,
      person: { id: 'marta', flame01: 0.9, trust: 0.9, marks: {}, touchScore: 100, presence: 2, bond: 1, spark: 86 },
    });
    const out = resolveInteraction(rt, 'show_up', 'marta');
    expect(out.reignited).toBe(false);
  });
});
