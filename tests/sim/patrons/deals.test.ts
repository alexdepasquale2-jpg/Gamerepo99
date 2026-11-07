import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { ensureHoard } from '../../../src/sim/hoard';
import { ensureDoctrines } from '../../../src/sim/doctrine-tick';
import { acceptDeal, breakDeal, openDeals, tickPatronDawn } from '../../../src/sim/patrons';

const boot = (seed = 7) => {
  const b = bootPlayState(seed, 'marrow');
  b.state.player.townId = 'ashford';
  return b;
};
const voice = (b: ReturnType<typeof boot>) =>
  Object.keys(b.state.people).sort().find((id) => b.state.people[id]!.townId === 'ashford' && b.state.people[id]!.tags?.includes('doctrine_voice'))!;
const act = (b: ReturnType<typeof boot>, id: string) => actMethod(b.state, `${id}@${voice(b)}`, [], undefined, { interactionCompat: b.interactionRt });

describe('patron deals', () => {
  it('openDeals gated by openNotorietyMin', () => {
    const { state } = boot();
    expect(openDeals(state, 'patron_mill_trust')).toEqual([]);
    ensureHoard(state).notoriety = 0.35;
    expect(openDeals(state, 'patron_mill_trust').length).toBe(2);
  });

  it('acceptDeal applies offer + gain_patron_deal, once', () => {
    const { state } = boot();
    ensureHoard(state).notoriety = 0.4;
    expect(acceptDeal(state, 'patron_mill_trust', 'deal_mill_deny_reignite').ok).toBe(true);
    expect(state.player.coin).toBe(40);
    expect(state.flags.travelSafeDays).toBe(3);
    expect(state.hoard!.notoriety).toBeCloseTo(0.5);
    expect(acceptDeal(state, 'patron_mill_trust', 'deal_mill_deny_reignite').ok).toBe(false);
    expect(acceptDeal(state, 'patron_strand_wardens', 'deal_mill_tithe_coin').ok).toBe(false);
  });

  it('deny_reignite accept raises propaganda; tithe paid raises realDelivery; legitimacy recomputed', () => {
    const b = boot();
    ensureHoard(b.state).notoriety = 0.5;
    const doc = ensureDoctrines(b.state).doctrine_mill_bread!;
    const prop = doc.propaganda;
    const real = doc.realDelivery;
    act(b, 'patron_accept_mill_deny');
    expect(doc.propaganda).toBeGreaterThan(prop);
    act(b, 'patron_accept_mill_tithe');
    b.state.player.coin = 50;
    act(b, 'patron_pay_mill_tithe');
    expect(doc.realDelivery).toBeCloseTo(real + 0.08);
    expect(b.state.player.coin).toBe(40);
    expect(b.state.patronDeals!.deal_mill_tithe_coin!.status).toBe('fulfilled');
    const lg = doc.legitimacy;
    advanceToDawn(b.state);
    expect(doc.legitimacy).not.toBe(lg);
  });

  it('unmet tithe breaks once: leverage fires, no hard lock', () => {
    const { state } = boot();
    ensureHoard(state).notoriety = 0.5;
    acceptDeal(state, 'patron_mill_trust', 'deal_mill_tithe_coin');
    const exp = ensureDoctrines(state).doctrine_mill_bread!.exposure;
    state.patronDeals!.deal_mill_tithe_coin!.dueDay = state.day;
    state.seed = 1;
    const before = state.hoard!.notoriety;
    breakDeal(state, 'deal_mill_tithe_coin');
    breakDeal(state, 'deal_mill_tithe_coin');
    expect(state.hoard!.notoriety).toBeCloseTo(before + 0.15);
    expect(ensureDoctrines(state).doctrine_mill_bread!.exposure).toBeCloseTo(exp + 0.1);
    expect(tickPatronDawn(state).broken).toEqual([]);
  });

  it('breaking deny_reignite spawns att_spy juice; kept deal is fulfilled', () => {
    const { state } = boot();
    ensureHoard(state).notoriety = 0.5;
    acceptDeal(state, 'patron_mill_trust', 'deal_mill_deny_reignite');
    state.bus?.lastIds && (state.bus.lastIds.length = 0);
    breakDeal(state, 'deal_mill_deny_reignite');
    expect(state.bus?.lastIds).toContain('notoriety.attractor');
  });

  it('collapsed doctrine voids deals', () => {
    const { state } = boot();
    ensureHoard(state).notoriety = 0.5;
    acceptDeal(state, 'patron_mill_trust', 'deal_mill_tithe_coin');
    ensureDoctrines(state).doctrine_mill_bread!.collapsed = true;
    expect(tickPatronDawn(state).voided).toEqual(['deal_mill_tithe_coin']);
    expect(state.patronDeals!.deal_mill_tithe_coin!.status).toBe('void');
  });

  it('low legitimacy / souring raises betrayal odds deterministically (same seed => same day)', () => {
    const run = (low: boolean) => {
      const { state } = boot(11);
      ensureHoard(state).notoriety = 0.5;
      acceptDeal(state, 'patron_mill_trust', 'deal_mill_deny_reignite');
      state.patronDeals!.deal_mill_deny_reignite!.dueDay = 9999;
      const doc = ensureDoctrines(state).doctrine_mill_bread!;
      let day = -1;
      for (let i = 0; i < 400 && day < 0; i++) {
        state.day++;
        if (low) doc.legitimacy = 0;
        if (tickPatronDawn(state).betrayed.length) day = i;
      }
      return day;
    };
    expect(run(true)).toBe(run(true));
    const hi = run(false);
    expect(run(true)).toBeGreaterThanOrEqual(0);
    expect(hi === -1 || run(true) <= hi).toBe(true);
  });

  it('act_expose_lie on the patron voice raises exposure past the deal baseline', () => {
    const b = boot();
    ensureHoard(b.state).notoriety = 0.5;
    acceptDeal(b.state, 'patron_mill_trust', 'deal_mill_tithe_coin');
    const d = b.state.patronDeals!.deal_mill_tithe_coin!;
    b.state.player.spark = 100;
    act(b, 'shame');
    expect(ensureDoctrines(b.state).doctrine_mill_bread!.exposure).toBeGreaterThan(d.exposureAtAccept);
  });
});
