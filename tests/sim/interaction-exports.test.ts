import { describe, expect, it } from 'vitest';
import {
  createInteractionRuntime,
  resolveInteraction,
  expandMethodAct,
  createCompatRuntime,
  loadMigrationMap,
  REIGNITE_MIN_KINDS,
} from '../../src/sim';
import type {
  InteractionDef,
  InteractionResult,
  InteractionRuntime,
  InteractionRuntimeInit,
  InteractionScoring,
  InteractionTouch,
  InteractionPerson,
  MarkAdd,
  PromiseStatus,
} from '../../src/sim';

describe('sim barrel: interaction APIs', () => {
  it('exports interaction runtime + compat functions', () => {
    for (const fn of [
      createInteractionRuntime,
      resolveInteraction,
      expandMethodAct,
      createCompatRuntime,
      loadMigrationMap,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exports REIGNITE_MIN_KINDS constant', () => {
    expect(REIGNITE_MIN_KINDS).toBe(3);
  });

  it('exports interaction types (compile-time)', () => {
    type _Types = [
      InteractionDef,
      InteractionResult,
      InteractionRuntime,
      InteractionRuntimeInit,
      InteractionScoring,
      InteractionTouch,
      InteractionPerson,
      MarkAdd,
      PromiseStatus,
    ];
    const ok: _Types | null = null;
    expect(ok).toBeNull();
  });
});
