import { describe, expect, it } from 'vitest';
import {
  expandMethodAct,
  loadMigrationMap,
  createCompatRuntime,
} from '../../src/sim/interaction-compat';
import { actMethod } from '../../src/sim/play-session/play-session-act';
import { resolveInteraction } from '../../src/sim/interactions';
import type { SimState } from '../../src/sim/types/runtime';

describe('migration map', () => {
  it('expands method ids to recipeDefault interaction id', () => {
    expect(loadMigrationMap().get('inspire')).toEqual(['talk_gentle']);
    expect(expandMethodAct('inspire')).toBe('talk_gentle');
    expect(expandMethodAct('carry_burden')).toBe('favor_do');
    expect(expandMethodAct('shame')).toBe('talk_hard_shame');
    expect(expandMethodAct('nope')).toBeUndefined();
  });
});

describe('actMethod compat flag', () => {
  const person = { id: 'marta', flame01: 0.28, trust: 0.35, marks: {}, touchScore: 0, presence: 0, bond: 0, spark: 86 };

  it('inspire@marta resolves via interaction recipe strain, not methods.sparkCost', () => {
    const rt = createCompatRuntime(person);
    const log: { type: string; methodId?: string }[] = [];
    // state is never touched on the compat path
    actMethod({} as SimState, 'inspire@marta', log, undefined, { interactionCompat: rt });
    const p = rt.people.get('marta')!;
    const expected = createCompatRuntime(person);
    const exp = resolveInteraction(expected, 'talk_gentle', 'marta');
    expect(p.spark).toBe(exp.spark);
    expect(p.flame01).toBeCloseTo(0.31, 5);
    expect(log).toContainEqual({ type: 'interaction', methodId: 'talk_gentle' });
  });

  it('unmapped methods fall through to legacy path when flag set', () => {
    const rt = createCompatRuntime(person);
    const log: { type: string; methodId?: string }[] = [];
    actMethod({ player: { spark: 1 } } as unknown as SimState, 'zzz@marta', log, undefined, { interactionCompat: rt });
    expect(rt.people.get('marta')!.spark).toBe(86);
    expect(log.some((e) => e.type === 'interaction')).toBe(false);
  });
});
