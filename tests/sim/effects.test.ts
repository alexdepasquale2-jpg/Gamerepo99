import { describe, expect, it } from 'vitest';
import { applyEffect } from '../../src/sim/effects';
import { loadData } from '../../src/sim/load-data';
import { createRng } from '../../src/sim/rng';
import type { SimState } from '../../src/sim/types/runtime';
import type { Effect } from '../../src/sim/types/data';

const data = loadData();
const rng = createRng(7);

function makeState(): SimState {
  return {
    day: 1,
    seed: 7,
    player: {
      id: 'player',
      archetypeId: 'fixture',
      spark: 50,
      hookIds: [],
      statusTraits: [],
      embodiment: { bodySlots: 1, activeBodiesMax: 1, blockedTileTags: [] },
    },
    people: {
      p1: { id: 'p1', flame: 1, marks: [{ markId: 'hollow', stacks: 1 }] },
    },
    flags: {},
    packets: [],
  };
}

describe('applyEffect', () => {
  it('add/mul/set numeric player.spark', () => {
    const state = makeState();
    const ctx = { data, rng };
    applyEffect(state, { id: 'a', op: 'add', target: 'player.spark', value: 5 } as Effect, ctx);
    expect(state.player.spark).toBe(55);
    applyEffect(state, { id: 'm', op: 'mul', target: 'player.spark', value: 2 } as Effect, ctx);
    expect(state.player.spark).toBe(110);
    applyEffect(state, { id: 's', op: 'set', target: 'player.spark', value: 40 } as Effect, ctx);
    expect(state.player.spark).toBe(40);
  });

  it('set player.statusTrait appends once', () => {
    const state = makeState();
    const ctx = { data, rng };
    applyEffect(
      state,
      { id: 't', op: 'set', target: 'player.statusTrait', value: 'inherited_dependence' } as Effect,
      ctx
    );
    applyEffect(
      state,
      { id: 't2', op: 'set', target: 'player.statusTrait', value: 'inherited_dependence' } as Effect,
      ctx
    );
    expect(state.player.statusTraits).toEqual(['inherited_dependence']);
  });

  it('add town.despair via ctx.town', () => {
    const state = makeState();
    const town: Record<string, number> = { despair: 0.1 };
    applyEffect(
      state,
      { id: 'd', op: 'add', target: 'town.despair', value: 0.2 } as Effect,
      { data, rng, town }
    );
    expect(town.despair).toBeCloseTo(0.3);
  });

  it('emit_packet pushes PacketState', () => {
    const state = makeState();
    applyEffect(
      state,
      { id: 'pk', op: 'emit_packet', target: 'link.packet', value: 3, packetType: 'proof_packet' } as Effect,
      { data, rng }
    );
    expect(state.packets).toHaveLength(1);
    expect(state.packets[0]?.kind).toBe('proof_packet');
    expect(state.packets[0]?.days).toBe(3);
  });

  it('grant_mark and remove_mark on ctx.targetId person', () => {
    const state = makeState();
    const ctx = { data, rng, targetId: 'p1' };
    applyEffect(state, { id: 'g', op: 'grant_mark', target: 'person', markId: 'grown' } as Effect, ctx);
    expect(state.people.p1?.marks?.map((m) => m.markId).sort()).toEqual(['grown', 'hollow']);
    applyEffect(state, { id: 'r', op: 'remove_mark', target: 'person', markId: 'hollow' } as Effect, ctx);
    expect(state.people.p1?.marks?.map((m) => m.markId)).toEqual(['grown']);
  });
});

describe('scaleBy', () => {
  const fx = (scaleBy: string): Effect => ({ id: 'fx_s', target: 'player.spark', op: 'add', value: -10, scaleBy }) as Effect;
  it('scales value by notoriety at 0, mid, 1', () => {
    for (const [n, want] of [[0, 50], [0.5, 45], [1, 40]] as const) {
      const s = makeState();
      s.flags.notoriety = n;
      applyEffect(s, fx('player.notoriety'), { data, rng });
      expect(s.player.spark).toBeCloseTo(want);
    }
  });
  it('scales by town despair', () => {
    const s = makeState();
    applyEffect(s, fx('town.despair'), { data, rng, townDespair: 0.25 });
    expect(s.player.spark).toBeCloseTo(47.5);
  });
  it('unknown scaleBy throws', () => {
    expect(() => applyEffect(makeState(), fx('nope'), { data, rng })).toThrow(/scaleBy/);
  });
});
