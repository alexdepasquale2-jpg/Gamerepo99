import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../../src/sim';
import { detectEnding, ensureHoard } from '../../../src/sim/hoard';
import { ensureEconomyState } from '../../../src/sim/economy';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { advanceDays } from '../../../src/sim/scenario/scenario-advance';
import { serializeSave, parseSave } from '../../../src/sim/save';

describe('neglect is an ending, not a loss', () => {
  it('30 dawns without reignites raise despair via the LOD and never set a lose flag', () => {
    const { state } = bootPlayState(7, 'marrow');
    ensureEconomyState(state);
    const before = Object.values(state.towns ?? {}).reduce((a, t) => a + t.despair, 0);
    advanceDays(state, 30);
    const after = Object.values(state.towns ?? {}).reduce((a, t) => a + t.despair, 0);
    expect(after).toBeGreaterThanOrEqual(before);
    expect(state.ended).toBeUndefined();
    expect(state.flags.lost).toBeUndefined();
  });

  it('detectEnding returns ash_hoard only with 0 reignites and peakCoin >= legacy min', () => {
    const { state } = bootPlayState(7, 'marrow');
    expect(detectEnding(state)).toBeNull();
    ensureHoard(state).peakCoin = 40;
    expect(detectEnding(state)).toBeNull();
    state.hoard!.stash.s = { siteId: 's', coin: 40, goods: {}, guardsHired: 0 };
    expect(detectEnding(state)).toBe('ash_hoard');
    state.hoard!.reigniteCount = 1;
    expect(detectEnding(state)).toBeNull();
  });

  it('scripted 30-dawn hoarder bot ends cleanly with ash_hoard, deterministically, and saves', () => {
    const run = () => {
      const { state, interactionRt } = bootPlayState(21, 'marrow');
      ensureEconomyState(state);
      state.player.townId = 'ashford';
      const pid = Object.keys(state.people)[0]!;
      const act = (id: string) => actMethod(state, `${id}@${pid}`, [], undefined, { interactionCompat: interactionRt });
      for (let day = 0; day < 30; day++) {
        state.player.spark = 100;
        if (day % 2 === 0) act('carry_burden');
        act('stash_hide');
        if (day === 3) act('stash_guard_hire');
        actMethod(state, 'advance:dawn', []);
      }
      return state;
    };
    const a = run();
    expect(a.hoard!.reigniteCount).toBe(0);
    expect(a.hoard!.peakCoin).toBeGreaterThanOrEqual(40);
    expect(detectEnding(a)).toBe('ash_hoard');
    expect(a.ended).toBeUndefined();
    expect(run().hoard).toEqual(a.hoard);
    const blob = parseSave(serializeSave({ version: 1, seed: 21, tick: 0, npcs: [], coin: a.player.coin, hoard: a.hoard }));
    expect(blob?.hoard).toEqual(a.hoard);
  });

  it('play session still boots (no shame branch needed)', () => {
    expect(createPlaySession({ mode: 'play', seed: 1, archetypeId: 'marrow' })).not.toBeNull();
  });

  it('a favor (carry_burden -> favor_do) pays coin', () => {
    const { state, interactionRt } = bootPlayState(21, 'marrow');
    state.player.townId = 'ashford';
    state.player.spark = 100;
    const pid = Object.keys(state.people)[0]!;
    const before = state.player.coin ?? 0;
    actMethod(state, `carry_burden@${pid}`, [], undefined, { interactionCompat: interactionRt });
    expect(state.player.coin ?? 0).toBeGreaterThan(before);
  });
});
