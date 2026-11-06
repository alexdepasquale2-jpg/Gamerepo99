import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadData } from '../../src/sim/load-data';
import { createRng } from '../../src/sim/rng';
import { runHooks } from '../../src/sim/hooks';
import type { SimState } from '../../src/sim/types/runtime';

const data = loadData();
const rng = createRng(1);

function makeStateWithHookIds(hookIds: string[]): SimState {
  return {
    day: 1,
    seed: 1,
    player: {
      id: 'player',
      archetypeId: 'fixture',
      spark: 70,
      hookIds,
      statusTraits: [],
      embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] },
    },
    people: {},
    flags: {},
    packets: [],
  };
}

describe('hooks', () => {
  it('runs cost_loneliness_tax only when when{} matches', () => {
    const state = makeStateWithHookIds(['cost_loneliness_tax']);
    state.flags.kindSuccessToday = true;
    state.flags.noBurningAdjacent = true;
    runHooks(state, 'dusk', { data, rng });
    expect(state.player.spark).toBe(68); // 70-2
  });

  it('does not special-case marrow id', () => {
    const src = readFileSync('src/sim/hooks.ts', 'utf8');
    expect(src).not.toMatch(/archetypeId\s*===\s*['"]marrow['"]/);
  });
});
