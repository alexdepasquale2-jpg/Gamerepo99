import { describe, expect, it } from 'vitest';
import {
  expandMethodAct,
  createCompatRuntime,
} from '../../../src/sim/interaction/interaction-compat';
import { loadInteractionTables } from '../../../src/sim/interaction/load-interactions';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { resolveInteraction } from '../../../src/sim/interaction/interactions';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMuls } from '../../../src/sim/methods';

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
  it('inspire@p resolves via interaction recipe strain, not methods.sparkCost', () => {
    const { state, interactionRt: rt } = bootPlayState(42, 'marrow');
    const personId = Object.keys(state.people)[0]!;
    const flameBefore = state.people[personId]!.flame;
    const sparkBefore = state.player.spark;
    const expected = createCompatRuntime(tables, { ...rt.people.get(personId)!, spark: sparkBefore });
    const exp = resolveInteraction(expected, 'talk_gentle', personId, actMuls(state, 'inspire'));
    const log: { type: string; methodId?: string }[] = [];

    actMethod(state, `inspire@${personId}`, log, undefined, { interactionCompat: rt });

    expect(state.player.spark).toBe(exp.spark);
    expect(state.player.spark).toBeCloseTo(sparkBefore - 1.05, 9); // strain 1 x Marrow inspire 1.05, gain 1, gentle tag -1
    expect(state.people[personId]!.flame).toBe(flameBefore + 3);
    expect(state.people[personId]!.trust).toBeCloseTo(exp.trust, 9);
    expect(log).toContainEqual({ type: 'interaction', methodId: 'talk_gentle' });
    expect(log.some((e) => e.type === 'spark.spend')).toBe(false);
  });

  it('unmapped methods log a bare act (no legacy spend path)', () => {
    const { state, interactionRt: rt } = bootPlayState(42, 'marrow');
    const personId = Object.keys(state.people)[0]!;
    const sparkBefore = state.player.spark;
    const log: { type: string; methodId?: string }[] = [];
    actMethod(state, `zzz@${personId}`, log, undefined, { interactionCompat: rt });
    expect(state.player.spark).toBe(sparkBefore);
    expect(log).toEqual([{ type: 'act', methodId: `zzz@${personId}` }]);
  });

  it('without a runtime, method acts do not fall back to commitMethod', () => {
    const { state } = bootPlayState(42, 'marrow');
    const personId = Object.keys(state.people)[0]!;
    const sparkBefore = state.player.spark;
    const log: { type: string; methodId?: string }[] = [];
    actMethod(state, `inspire@${personId}`, log);
    expect(state.player.spark).toBe(sparkBefore);
    expect(log).toEqual([{ type: 'act', methodId: `inspire@${personId}` }]);
  });
});
