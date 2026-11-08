import { afterEach, describe, expect, it } from 'vitest';
import { DAWN_SLOTS, dawnTickIds, registerDawnTick, runDawnSlot } from '../../src/sim/dawn-ticks';
import { advanceToDawn } from '../../src/sim/scenario/scenario-advance';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import type { SimState } from '../../src/sim/types/runtime';

const seen: string[] = [];
afterEach(() => { for (const s of DAWN_SLOTS) registerDawnTick(s, `t-${s}`, () => {}); seen.length = 0; });

describe('dawn tick slots', () => {
  it('run registered ticks in slot order, in registration order within a slot', () => {
    registerDawnTick('roads', 't-roads', () => seen.push('roads'));
    registerDawnTick('season', 't-season', () => seen.push('season'));
    registerDawnTick('season', 't-season-2', () => seen.push('season-2'));
    registerDawnTick('late', 't-late', () => seen.push('late'));
    const st = {} as SimState;
    for (const s of DAWN_SLOTS) runDawnSlot(st, s);
    expect(seen).toEqual(['season', 'season-2', 'roads', 'late']);
    expect(dawnTickIds().season).toEqual(['t-season', 't-season-2']);
    registerDawnTick('season', 't-season-2', () => {});
  });

  it('advanceToDawn calls every slot once, with the day already advanced', () => {
    const { state } = bootPlayState(7, 'marrow');
    const day0 = state.day;
    for (const s of DAWN_SLOTS) registerDawnTick(s, `t-${s}`, (st) => seen.push(`${s}@${st.day - day0}`));
    advanceToDawn(state);
    expect(seen).toEqual(DAWN_SLOTS.map((s) => `${s}@1`));
  });
});
