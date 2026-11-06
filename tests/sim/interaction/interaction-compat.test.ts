import { describe, expect, it } from 'vitest';
import {
  expandMethodAct,
  createCompatRuntime,
} from '../../../src/sim/interaction/interaction-compat';
import { loadInteractionTables } from '../../../src/sim/interaction/load-interactions';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { resolveInteraction } from '../../../src/sim/interaction/interactions';
import type { SimState } from '../../../src/sim/types/runtime';

const tables = loadInteractionTables();

describe('migration map', () => {
  it('expands method ids to recipeDefault interaction id', () => {
    const { migration } = tables;
    expect(migration.get('inspire')).toEqual(['talk_gentle']);
    expect(expandMethodAct(migration, 'inspire')).toBe('talk_gentle');
    expect(expandMethodAct(migration, 'carry_burden')).toBe('favor_do');
    expect(expandMethodAct(migration, 'shame')).toBe('talk_hard_shame');
    expect(expandMethodAct(migration, 'nope')).toBeUndefined();
  });
});

describe('actMethod compat flag', () => {
  const person = { id: 'marta', flame01: 0.28, trust: 0.35, marks: {}, touchScore: 0, presence: 0, bond: 0, spark: 86 };

  it('inspire@marta resolves via interaction recipe strain, not methods.sparkCost', () => {
    const rt = createCompatRuntime(tables, person);
    const log: { type: string; methodId?: string }[] = [];
    // state is never touched on the compat path
    actMethod({} as SimState, 'inspire@marta', log, undefined, { interactionCompat: rt });
    const p = rt.people.get('marta')!;
    const expected = createCompatRuntime(tables, person);
    const exp = resolveInteraction(expected, 'talk_gentle', 'marta');
    expect(p.spark).toBe(exp.spark);
    expect(p.flame01).toBeCloseTo(0.31, 5);
    expect(log).toContainEqual({ type: 'interaction', methodId: 'talk_gentle' });
  });

  it('unmapped methods fall through to legacy path when flag set', () => {
    const rt = createCompatRuntime(tables, person);
    const log: { type: string; methodId?: string }[] = [];
    actMethod({ player: { spark: 1 } } as unknown as SimState, 'zzz@marta', log, undefined, { interactionCompat: rt });
    expect(rt.people.get('marta')!.spark).toBe(86);
    expect(log.some((e) => e.type === 'interaction')).toBe(false);
  });
});
