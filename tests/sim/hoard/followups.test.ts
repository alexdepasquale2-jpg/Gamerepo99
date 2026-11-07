import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { matchesWhen } from '../../../src/sim/hooks';
import { applyStashAct, ensureHoard, fireNotorietyEvent, noteCoinSpend, tickHoardDawn, tickStashDawn } from '../../../src/sim/hoard';
import { ensureStash } from '../../../src/sim/hoard/state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import type { DataTables } from '../../../src/sim/load-data';

const boot = (seed = 5) => {
  const b = bootPlayState(seed, 'marrow');
  b.state.player.townId = 'ashford';
  return b.state;
};

describe('guard upkeep', () => {
  it('pays per guard per dawn from carried coin', () => {
    const s = boot();
    ensureStash(s, 'stash_ashford_cellar').guardsHired = 1;
    s.player.coin = 10;
    tickHoardDawn(s);
    expect(s.player.coin).toBe(8);
    expect(s.hoard!.stash.stash_ashford_cellar!.guardsHired).toBe(1);
  });
  it('guard leaves (juice only) when coin cannot cover it', () => {
    const s = boot();
    ensureStash(s, 'stash_ashford_cellar').guardsHired = 1;
    s.player.coin = 1;
    tickHoardDawn(s);
    expect(s.hoard!.stash.stash_ashford_cellar!.guardsHired).toBe(0);
    expect(s.bus?.lastIds).toContain('stash.guard_left');
  });
});

describe('notoriety event wiring', () => {
  it('flash_spend fires once when daily spend crosses the threshold', () => {
    const s = boot();
    s.player.coin = 100;
    applyStashAct(s, 'stash_guard_hire');
    expect(s.hoard!.notoriety).toBe(0);
    noteCoinSpend(s, 10);
    expect(s.hoard!.notoriety).toBeCloseTo(0.05);
  });
  it('refuse_tax needs a live tax-collector attractor today', () => {
    const s = boot();
    fireNotorietyEvent(s, 'refusal');
    expect(ensureHoard(s).notoriety).toBe(0);
    s.hoard!.attractorsToday = { day: s.day, ids: ['att_tax_collector'] };
    fireNotorietyEvent(s, 'refusal');
    expect(s.hoard!.notoriety).toBeCloseTo(0.12);
  });
  it('public_theft_defense fires when a guarded stash is robbed in the player town', () => {
    const s = boot(3);
    ensureHoard(s).notoriety = 0.8;
    const st = ensureStash(s, 'stash_ashford_cellar');
    st.coin = 100;
    st.guardsHired = 1;
    let stolen = false;
    for (let d = 1; d < 80 && !stolen; d++) {
      s.day = d;
      stolen = tickStashDawn(s).stolen.length > 0;
    }
    expect(stolen).toBe(true);
    expect(s.hoard!.notoriety).toBeCloseTo(0.87);
  });
});

describe('raid goal attractor', () => {
  it('assigns a deterministic raider (state field) read by the theft roll', () => {
    const run = () => {
      const s = boot(7);
      ensureHoard(s).notoriety = 0.9;
      ensureStash(s, 'stash_ashford_cellar').coin = 50;
      for (let i = 0; i < 60; i++) {
        advanceToDawn(s);
        s.hoard!.notoriety = 0.9;
        s.hoard!.stash.stash_ashford_cellar!.coin = 50;
        if (s.hoard!.raiders?.stash_ashford_cellar) break;
      }
      return { raider: s.hoard!.raiders?.stash_ashford_cellar, day: s.day };
    };
    const a = run();
    expect(a.raider).toBeTruthy();
    expect(run()).toEqual(a);
  });
});

describe('notorietyAbove hook condition', () => {
  it('compares hoard notoriety', () => {
    const s = boot();
    const ctx = { data: s.data as DataTables, rng: s.rng! };
    expect(matchesWhen({ notorietyAbove: 0.4 }, s, ctx)).toBe(false);
    ensureHoard(s).notoriety = 0.5;
    expect(matchesWhen({ notorietyAbove: 0.4 }, s, ctx)).toBe(true);
  });
});
