import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { ensureHoard } from '../../../src/sim/hoard';
import { ensureLetters } from '../../../src/sim/letters-scale';
import { carryItOn, ensureLegacy, letItRest, offerSuccession, tickInheritedDependence } from '../../../src/sim/legacy';
import { advanceDays } from '../../../src/sim/scenario/scenario-advance';
import { lockedSuccessionUi } from '../../../src/sim/succession';
import { bondedState, burnOut } from './helpers';

describe('Carry it on', () => {
  it('heir continues with their own archetype plus the ember gift', () => {
    const { state, pid } = bondedState();
    const oldArch = state.player.archetypeId;
    burnOut(state);
    expect(state.ended).toBe('succession');
    const offer = offerSuccession(state);
    expect(offer.canContinue).toBe(true);
    expect(offer.ui.screenCopy).toBe('Your fire went out. Someone remembers it.');
    const r = carryItOn(state);
    expect(r.ok).toBe(true);
    expect(state.player.id).toBe(`inh-heir-${pid}`);
    expect(state.people[pid]).toBeUndefined();
    expect(state.ended).toBeUndefined();
    const fresh = bootPlayState(7, state.player.archetypeId).state.player;
    expect(state.player.spark).toBe(Math.min(fresh.sparkMax ?? Infinity, fresh.spark + 15));
    expect(typeof oldArch).toBe('string');
    expect(ensureLegacy(state).lineage).toHaveLength(1);
    expect(ensureLegacy(state).graves).toHaveLength(1);
  });

  it('applies reputation echoes, memory packet and rumor via letters-scale', () => {
    const { state } = bondedState();
    const lg = ensureLegacy(state);
    const touched = [...lg.touchedTowns];
    expect(touched.length).toBeGreaterThan(0);
    const growth = [...lg.growthTowns];
    burnOut(state);
    const packetsBefore = state.packets.length;
    carryItOn(state);
    for (const t of touched) expect(state.legacy!.townRep[t]!.fear).toBeCloseTo(-0.05);
    for (const t of growth) expect(state.legacy!.townRep[t]!.trust).toBeCloseTo(0.08);
    expect(state.packets.slice(packetsBefore).some((p) => p.kind === 'vitality_echo')).toBe(true);
    expect(ensureLetters(state).pending.some((p) => p.kind === 'rumor')).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const run = () => {
      const { state } = bondedState();
      burnOut(state);
      carryItOn(state);
      return JSON.stringify({ p: state.player, rep: state.legacy!.townRep, l: ensureLetters(state).pending, pk: state.packets });
    };
    expect(run()).toBe(run());
  });

  it('dependence-path heir gets inherited_dependence and it decays on spark above 80', () => {
    const { state, pid } = bondedState();
    ensureLegacy(state).bonds[pid] = { events: { dependence_stack: 20, carry_completed: 1 }, resentment: 0 };
    burnOut(state);
    carryItOn(state);
    expect(state.player.statusTraits).toContain('inherited_dependence');
    state.player.spark = 90;
    expect(tickInheritedDependence(state)).toBe(true);
    expect(state.player.statusTraits).not.toContain('inherited_dependence');
  });

  it('inherited_dependence decays after two genuine growths and after 3 days without carrying', () => {
    const mk = () => {
      const { state, pid } = bondedState();
      ensureLegacy(state).bonds[pid] = { events: { dependence_stack: 20 }, resentment: 0 };
      burnOut(state);
      carryItOn(state);
      state.player.spark = 50;
      return state;
    };
    const a = mk();
    expect(tickInheritedDependence(a)).toBe(false);
    ensureLegacy(a).growthSinceSuccession = 2;
    expect(tickInheritedDependence(a)).toBe(true);
    const b = mk();
    b.day += 3;
    expect(tickInheritedDependence(b)).toBe(true);
  });

  it('play continues after succession (dawns advance)', () => {
    const { state } = bondedState();
    burnOut(state);
    carryItOn(state);
    advanceDays(state, 3);
    expect(state.player.spark).toBeGreaterThan(0);
  });
});

describe('Let it rest and no heir', () => {
  it('rest ends the run without shame and hoard state adds ash_hoard', () => {
    const { state } = bootPlayState(7, 'marrow');
    const h = ensureHoard(state);
    h.peakCoin = 40;
    h.stash.s1 = { siteId: 's1', coin: 40, goods: {}, guardsHired: 0 };
    burnOut(state);
    const offer = offerSuccession(state);
    expect(offer.canContinue).toBe(false);
    expect(carryItOn(state)).toEqual({ ok: false, reason: 'no_heir' });
    const r = letItRest(state);
    expect(r.ok && r.imprint.ending).toBe('ash_hoard');
    expect(r.ok && r.imprint.flags).toEqual(['hoard_legacy']);
    expect(state.ended).toBe('rest');
    expect(lockedSuccessionUi().quitNeverShamed).toBe(true);
    expect(lockedSuccessionUi().buttons).toEqual({ continue: 'Carry it on', quit: 'Let it rest' });
  });

  it('refuses while the fire still burns', () => {
    const { state } = bondedState();
    expect(carryItOn(state)).toEqual({ ok: false, reason: 'not_open' });
  });
});
