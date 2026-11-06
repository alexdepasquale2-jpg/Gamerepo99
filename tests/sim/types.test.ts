import { describe, expect, it } from 'vitest';
import { DATA_TYPES_MODULE, type ArchetypeDef, type Effect, type HookDef } from '../../src/sim/types/data';
import {
  RUNTIME_TYPES_MODULE,
  type Inhabitant,
  type SimState,
} from '../../src/sim/types/runtime';

describe('core sim types', () => {
  it('loads data and runtime type modules', () => {
    expect(DATA_TYPES_MODULE).toBe('data');
    expect(RUNTIME_TYPES_MODULE).toBe('runtime');
  });

  it('exports data shapes usable as plain objects', () => {
    const effect: Effect = {
      id: 'fx_loneliness',
      target: 'player.spark',
      op: 'add',
      value: -2,
      tags: ['cost'],
    };
    const hook: HookDef = {
      id: 'cost_loneliness_tax',
      kind: 'personal_cost',
      trigger: 'dusk',
      when: { kindSuccessToday: true },
      effects: [effect],
    };
    const archetype: ArchetypeDef = {
      id: 'marrow',
      name: 'Marrow',
      m2Playable: true,
      embodimentTraitId: 'body_ogre_large',
      perceptionTraitId: 'perc_feared_outsider',
      methodModifierId: 'mods_marrow',
      sparkProfileId: 'spark_den_ogre',
      personalCostHookIds: [hook.id],
      refusalHookIds: [],
      legacyHookIds: [],
      startingTownId: 'ashford',
    };
    expect(archetype.id).toBe('marrow');
    expect(hook.effects?.[0]?.op).toBe('add');
  });

  it('exports runtime inhabitant and sim state shells', () => {
    const inhabitant: Inhabitant = {
      id: 'player-1',
      archetypeId: 'marrow',
      spark: 70,
      hookIds: ['cost_loneliness_tax'],
      statusTraits: [],
      embodiment: {
        bodySlots: 1,
        activeBodiesMax: 1,
        blockedTileTags: ['door_front'],
      },
    };
    const state: SimState = {
      day: 0,
      seed: 1,
      player: inhabitant,
      people: {},
      flags: {},
      packets: [],
    };
    expect(state.player.spark).toBe(70);
    expect(state.people).toEqual({});
  });
});
