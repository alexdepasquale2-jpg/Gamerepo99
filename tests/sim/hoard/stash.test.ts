import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { applyStashAct, decayLoss, ensureHoard, theftP, tickStashDawn, unguarded } from '../../../src/sim/hoard';
import { ensureStash, siteDefs, type StashSiteDef } from '../../../src/sim/hoard/state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';

const boot = (seed = 5) => {
  const b = bootPlayState(seed, 'marrow');
  b.state.player.townId = 'ashford';
  return b;
};
const cellar = (): StashSiteDef => ({ id: 'x', townId: 'ashford', hideDifficulty: 0.55, capacity: 60, guardSlots: 1, decayPerDawn: 0.03, theftRiskBase: 0.18 });

describe('stash formulas (spec section 4)', () => {
  it('decayLoss floors goods * decay * unguarded on a 40-goods stash', () => {
    expect(decayLoss(40, 0.03, unguarded(0, 1))).toBe(1);
    expect(decayLoss(40, 0.05, unguarded(0, 2))).toBe(2);
    expect(decayLoss(40, 0.03, unguarded(1, 1))).toBe(0);
    expect(unguarded(1, 2)).toBe(0.5);
  });

  it.each([
    [0, 0, 0.18 - 0.22],
    [1, 0, 0.18 + 0.35 - 0.22],
    [1, 1, 0.18 + 0.35 - 0.22 - 0.15],
  ])('theftP notoriety %s guards %s', (n, g, raw) => {
    expect(theftP(cellar(), n, g)).toBeCloseTo(Math.min(0.85, Math.max(0.02, raw)));
  });

  it('theftP clamps to [0.02, 0.85] and hide difficulty lowers it', () => {
    expect(theftP({ ...cellar(), hideDifficulty: 1 }, 0, 0)).toBe(0.02);
    expect(theftP({ ...cellar(), theftRiskBase: 2 }, 1, 0)).toBe(0.85);
    expect(theftP({ ...cellar(), hideDifficulty: 0.9 }, 0.5, 0)).toBeLessThan(theftP(cellar(), 0.5, 0));
  });
});

describe('theft roll', () => {
  const run = (seed: number) => {
    const { state } = boot(seed);
    ensureHoard(state).notoriety = 1;
    const s = ensureStash(state, 'stash_ashford_cellar');
    s.coin = 100;
    const days: number[] = [];
    for (let d = 1; d <= 20; d++) {
      state.day = d;
      if (tickStashDawn(state).stolen.length) days.push(d);
    }
    return { days, coin: s.coin, state };
  };

  it('is deterministic per seed, steals a bounded fraction, emits a rumor and juice', () => {
    const a = run(9);
    expect(run(9).days).toEqual(a.days);
    expect(a.days.length).toBeGreaterThan(0);
    expect(a.coin).toBeLessThan(100);
    expect(a.state.letters?.pending.length).toBe(a.days.length);
    expect(a.state.bus?.lastIds).toContain('stash.theft');
  });

  it('first theft takes 0.1..0.4 of the stash scaled by (1 - hide*0.5)', () => {
    const { state } = boot(3);
    ensureHoard(state).notoriety = 1;
    const s = ensureStash(state, 'stash_ashford_cellar');
    s.coin = 1000;
    for (let d = 1; d < 50 && !tickStashDawn(state).stolen.length; d++) state.day = d;
    const frac = (1000 - s.coin) / 1000;
    expect(frac).toBeGreaterThanOrEqual(0.1 * (1 - 0.275) - 0.001);
    expect(frac).toBeLessThanOrEqual(0.4 * (1 - 0.275));
  });

  it('dying town (high despair, below collapse) makes theft rarer', () => {
    const count = (despair: number) => {
      const { state } = boot(11);
      state.towns = { ashford: { id: 'ashford', economyOptIn: false, stock: {}, despair } };
      ensureHoard(state).notoriety = 1;
      ensureStash(state, 'stash_ashford_cellar').coin = 1e6;
      let n = 0;
      for (let d = 1; d <= 300; d++) {
        state.day = d;
        n += tickStashDawn(state).stolen.length;
      }
      return n;
    };
    expect(count(0.75)).toBeLessThan(count(0));
    expect(count(0.95)).toBeGreaterThan(count(0.75));
  });
});

describe('stash acts through act()', () => {
  it('earn coin, hide it, hire a guard, withdraw; large deposit raises notoriety', () => {
    const { state, interactionRt } = boot();
    const pid = Object.keys(state.people)[0]!;
    const act = (id: string) => actMethod(state, `${id}@${pid}`, [], undefined, { interactionCompat: interactionRt });
    state.player.spark = 100;
    act('carry_burden');
    act('carry_burden');
    expect(state.player.coin).toBe(24);
    act('stash_hide');
    const s = state.hoard!.stash.stash_ashford_cellar!;
    expect(s.coin).toBe(24);
    expect(state.hoard!.notoriety).toBeCloseTo(0.08); // gain_large_deposit (24 > 20)
    expect(state.hoard!.peakCoin).toBe(24);
  });

  it('applyStashAct hide>20 gains notoriety; guard slot bound; withdraw returns coin; no-op off-site', () => {
    const { state } = boot();
    state.player.coin = 50;
    expect(applyStashAct(state, 'stash_hide')).toBe(true);
    expect(state.hoard!.notoriety).toBeCloseTo(0.08);
    expect(applyStashAct(state, 'stash_guard_hire')).toBe(true);
    expect(applyStashAct(state, 'stash_guard_hire')).toBe(false);
    expect(state.player.coin).toBe(15);
    expect(applyStashAct(state, 'stash_withdraw')).toBe(true);
    expect(state.player.coin).toBe(40);
    state.player.townId = 'nowhere';
    expect(applyStashAct(state, 'stash_hide')).toBe(false);
  });

  it('dawn applies decay to goods and ticks deterministically', () => {
    const { state } = boot();
    ensureStash(state, 'stash_ashford_cellar').goods.food_grain = 40;
    advanceToDawn(state);
    expect(siteDefs(state).length).toBeGreaterThan(1);
    expect(state.hoard!.stash.stash_ashford_cellar!.goods.food_grain).toBeLessThanOrEqual(39);
  });
});
