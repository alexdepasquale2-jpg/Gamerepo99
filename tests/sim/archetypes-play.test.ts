import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import type { PlaySession } from '../../src/sim/play-session/play-session';
import { bootPlayState } from '../../src/sim/play-session/play-session-state';
import { loadData } from '../../src/sim/load-data';
import { playableArchetypes, rollArchetype } from '../../src/sim/inhabitant';
import { actMuls, refuseMethod } from '../../src/sim/methods';
import { runHooks } from '../../src/sim/hooks';
import { runDuskHooks } from '../../src/sim/scenario/scenario-advance';
import {
  bodiesElsewhere,
  bodiesWithYou,
  callBodiesBack,
  canEnterBuilding,
  eavesdropReports,
  firstTrust,
  FIRST_TRUST_NEUTRAL,
  leaveBodyHere,
  rollDayFlags,
  setBodyFlags,
  switchToBody,
  walkSpeedMul,
} from '../../src/sim/embodiment';
import { jobOf } from '../../src/sim/goods/jobs';
import type { DataTables } from '../../src/sim/load-data';
import type { Rng } from '../../src/sim/rng';

const ARCHETYPES = ['marrow', 'ivy_quill', 'basilisk_brood', 'ash_widow_bren'];

function session(archetypeId: string): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId });
  if (!s || !('lastResolve' in s)) throw new Error('expected play session');
  s.start({ seed: 42, archetypeId });
  return s as PlaySession;
}

function dawnHooks(state: ReturnType<typeof bootPlayState>['state']): void {
  runHooks(state, 'dawn', { data: state.data as DataTables, rng: state.rng as Rng });
}

describe('archetypes from the vision are playable', () => {
  it('lists four playable inhabitants, including Bren from the mill row', () => {
    const ids = playableArchetypes(loadData()).map((a) => a.id);
    expect(ids).toEqual(ARCHETYPES);
  });

  it('rolls by generator weight, deterministically for a given roll', () => {
    const list = playableArchetypes(loadData());
    expect(rollArchetype(list, 0).id).toBe('marrow');
    expect(rollArchetype(list, 0.999).id).toBe('ash_widow_bren');
    expect(rollArchetype(list, 0.5).id).toBe(rollArchetype(list, 0.5).id);
  });

  it.each(ARCHETYPES)('%s starts a run, acts, rests and saves as itself', (id) => {
    const s = session(id);
    const person = s.listPeople().find((p) => p.id === 'marta_ellison')!;
    s.act(`inspire@${person.id}`);
    expect(s.lastResolve()?.kind).toBe('resolved');
    s.tick();
    const blob = s.saveBlob()!;
    const again = session('marrow');
    again.loadBlob(blob);
    expect(again.getState()?.player.archetypeId).toBe(id);
  });
});

describe('method modifiers reach live play', () => {
  it('the ogre carries hardest and cheapest; the clerk lies best; Bren carries for her old row', () => {
    const muls = (id: string, m: string) => actMuls(bootPlayState(42, id).state, m);
    expect(muls('marrow', 'carry_burden')).toEqual({ powerMul: 1.15, strainMul: 0.9 });
    expect(muls('ivy_quill', 'lie').powerMul).toBe(1.25);
    expect(muls('basilisk_brood', 'challenge').powerMul).toBe(1.25);
    expect(muls('ash_widow_bren', 'carry_burden')).toEqual({ powerMul: 1.2, strainMul: 0.85 });
  });

  it('the same act moves a person differently depending on who does it', () => {
    const flame = (id: string) => {
      const s = session(id);
      s.act('challenge@harold_finch');
      return s.lastResolve()!.flameDelta;
    };
    expect(flame('basilisk_brood')).toBeGreaterThan(flame('ash_widow_bren'));
  });
});

describe('personal costs and recovery fire in play', () => {
  it('lying costs the clerk ink: her standing drops once the lie lands', () => {
    const s = session('ivy_quill');
    const trustBefore = Number(s.getState()!.player.perception?.trust);
    s.act('lie@marta_ellison');
    expect(Number(s.getState()!.player.perception?.trust)).toBeCloseTo(trustBefore - 0.05, 9);
  });

  it('a fire that goes out in the night burns out before dawn can rekindle it', () => {
    const s = session('marrow');
    s.getState()!.player.spark = 1; // the ogre would recover 22 at his den by dawn
    s.getState()!.flags.kindSuccessToday = true; // a kind act with nobody burning nearby: loneliness at dusk
    s.tick();
    expect(s.snapshot().burnedOut).toBe(true);
    expect(s.successionOffer()).not.toBeNull();
  });

  it("Bren's evening costs 2 spark unless she worked beside someone that day", () => {
    const { state } = bootPlayState(42, 'ash_widow_bren');
    const before = state.player.spark;
    runDuskHooks(state);
    expect(before - state.player.spark).toBe(2);
    state.flags.interactionKindsToday = ['work_alongside'];
    const mid = state.player.spark;
    runDuskHooks(state);
    expect(state.player.spark).toBe(mid);
  });

  it('shared work yesterday restores Bren at dawn (base 12 + shared bread 8)', () => {
    const { state } = bootPlayState(42, 'ash_widow_bren');
    state.player.spark = 40;
    state.flags.interactionKindsToday = ['work_alongside'];
    rollDayFlags(state);
    dawnHooks(state);
    expect(state.player.spark).toBe(60);
  });

  it('the clerk recovers on a day without lies; the ogre recovers at his den', () => {
    const ivy = bootPlayState(42, 'ivy_quill').state;
    ivy.player.spark = 40;
    rollDayFlags(ivy);
    dawnHooks(ivy);
    expect(ivy.player.spark).toBe(62); // base 12 + ledger truth 10

    const ogre = bootPlayState(42, 'marrow').state;
    ogre.player.spark = 40;
    rollDayFlags(ogre);
    expect(ogre.flags.playerAtHome).toBe(true);
    dawnHooks(ogre);
    expect(ogre.player.spark).toBe(62); // base 12 + den hearth 10
  });

  it('Bren will not shame the grieving', () => {
    const { state } = bootPlayState(42, 'ash_widow_bren');
    const r = refuseMethod(state, 'elias_boone', 'shame');
    expect(r?.line).toMatch(/grief/i);
    expect(refuseMethod(bootPlayState(42, 'marrow').state, 'elias_boone', 'shame')).toBeUndefined();
  });
});

describe('bodies', () => {
  it('the ogre is slower and only fits the inn (through its yard); humans fit every door', () => {
    const ogre = bootPlayState(42, 'marrow').state.player;
    const ivy = bootPlayState(42, 'ivy_quill').state.player;
    expect(walkSpeedMul(ogre)).toBeLessThan(1);
    expect(['house', 'shop', 'inn'].map((k) => canEnterBuilding(ogre, k as 'house'))).toEqual([false, false, true]);
    expect(['house', 'shop', 'inn'].every((k) => canEnterBuilding(ivy, k as 'house'))).toBe(true);
  });

  it('the brood leaves a sibling, switches to it, and pays strain while apart', () => {
    const { state } = bootPlayState(42, 'basilisk_brood');
    const inh = state.player;
    expect(inh.bodies?.map((b) => b.name)).toEqual(['Ash', 'Flint', 'Wick']);
    const home = inh.townId!;
    const left = leaveBodyHere(state)!;
    expect(left.at).toBe(home);

    // Walk to another town: the sibling now waits elsewhere, listens, and the brood is strained at dusk.
    const other = Object.keys(state.towns ?? {}).find((t) => t !== home)!;
    inh.townId = other;
    setBodyFlags(state);
    expect(state.flags.bodiesInMultipleTowns).toBe(true);
    expect(bodiesElsewhere(inh).map((b) => b.id)).toEqual([left.id]);
    expect(eavesdropReports(state)[0]).toContain(left.name);
    const before = state.player.spark;
    runDuskHooks(state);
    expect(before - state.player.spark).toBe(3);

    // Become the sibling: you stand in the first town; the others wait where you were.
    expect(switchToBody(state, left.id)).toBe(home);
    expect(inh.activeBodyId).toBe(left.id);
    expect(inh.townId).toBe(home);
    expect(bodiesWithYou(inh).map((b) => b.id)).toEqual([left.id]);
    expect(bodiesElsewhere(inh).every((b) => b.at === other)).toBe(true);

    // Walk back and call them home.
    inh.townId = other;
    expect(callBodiesBack(state)).toHaveLength(2);
    expect(bodiesWithYou(inh)).toHaveLength(3);
  });

  it('single-body inhabitants have no siblings to leave', () => {
    const { state } = bootPlayState(42, 'marrow');
    expect(state.player.bodies).toBeUndefined();
    expect(leaveBodyHere(state)).toBeNull();
  });
});

describe('perception sets first impressions', () => {
  it('towns are wary of the ogre, open to the clerk, and the mill trades greet Bren as kin', () => {
    const t = (id: string, person: string) => firstTrust(bootPlayState(42, id).state, person);
    expect(t('marrow', 'marta_ellison')).toBeLessThan(FIRST_TRUST_NEUTRAL);
    expect(t('ivy_quill', 'marta_ellison')).toBeGreaterThan(FIRST_TRUST_NEUTRAL);
    const bren = bootPlayState(42, 'ash_widow_bren');
    const kin = Object.keys(bren.state.people).find((id) => jobOf(bren.state, id).id === 'weaver')!;
    const stranger = Object.keys(bren.state.people).find((id) => jobOf(bren.state, id).id === 'miner')!;
    expect(firstTrust(bren.state, kin) - firstTrust(bren.state, stranger)).toBeCloseTo(0.15, 9);
    expect(bren.interactionRt.people.get(kin)!.trust).toBeCloseTo(firstTrust(bren.state, kin), 9);
  });
});
