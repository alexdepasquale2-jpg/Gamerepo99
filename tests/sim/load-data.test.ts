import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/sim/load-data';

describe('loadData', () => {
  it('loads three m2 archetypes and refusal_shame_child hook', () => {
    const d = loadData();
    expect(d.archetypes.filter((a) => a.m2Playable)).toHaveLength(3);
    expect(d.hooksById.has('refusal_shame_child')).toBe(true);
    expect(d.hooksById.has('hook_does_not_exist')).toBe(false);
  });
});
