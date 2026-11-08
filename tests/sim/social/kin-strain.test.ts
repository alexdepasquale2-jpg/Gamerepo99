import { describe, expect, it } from 'vitest';
import { assembleInhabitant } from '../../../src/sim/inhabitant';
import { loadData } from '../../../src/sim/load-data';
import { pickFabricReactionLine, installFabricReactionSelector } from '../../../src/sim/dyn/line-select';
import type { MethodSimState } from '../../../src/sim/method-reactions';
import { createRng } from '../../../src/sim/rng';
import type { PersonState, SimState } from '../../../src/sim/types/runtime';
import {
  combineStrain,
  gapReach,
  kinStrainMap,
  kinStrainOf,
  STRAINED,
  strainedTiesOf,
  TIE_STRAIN,
} from '../../../src/sim/social/kin-strain';
import { kinDriftDawnLines } from '../../../src/sim/contrib/kin-strain';
import { collectDawnLines } from '../../../src/sim/dawn-lines';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import '../../../src/sim/contrib';
import { createPlaySession } from '../../../src/sim/play-session/play-session';
import type { PlaySession } from '../../../src/sim/play-session/play-session-types';

const METHODS = ['carry_burden', 'challenge', 'inspire', 'lie', 'shame'];

function person(id: string, townId: string, name?: string): PersonState {
  return { id, townId, name, flame: 20 };
}

/** marrow_den gap 0.1 (village), chalk_warren 0.45 (town), city_reach 0.85 (city). */
function miniState(edges: { from: string; to: string; kind?: string }[], extra: PersonState[] = []): SimState {
  const people: Record<string, PersonState> = {};
  for (const p of [
    person('ruth', 'marrow_den', 'Ruth Calder'),
    person('tom', 'city_reach', 'Tom Calder'),
    person('ada', 'marrow_den', 'Ada Calder'),
    person('kit', 'chalk_warren', 'Kit Calder'),
    person('lost', 'nowhere_town', 'Lost Soul'),
    ...extra,
  ]) people[p.id] = p;
  return {
    day: 1,
    seed: 5,
    player: { townId: 'marrow_den' } as SimState['player'],
    people,
    flags: {},
    packets: [],
    kinEdges: edges,
  };
}

describe('kin strain math', () => {
  it('gap reach ramps from the near threshold to full', () => {
    expect(gapReach(0)).toBe(0);
    expect(gapReach(0.3)).toBe(0);
    expect(gapReach(0.75)).toBe(1);
    expect(gapReach(1)).toBe(1);
    expect(gapReach(0.525)).toBeCloseTo(0.5, 5);
    expect(gapReach(-0.75)).toBe(1);
  });

  it('combines ties with saturation, never past 1', () => {
    expect(combineStrain([])).toBe(0);
    expect(combineStrain([1])).toBe(TIE_STRAIN);
    expect(combineStrain([1, 1])).toBeCloseTo(1 - (1 - TIE_STRAIN) ** 2, 3);
    expect(combineStrain([1, 1, 1, 1, 1, 1])).toBeLessThanOrEqual(1);
  });

  it('city kin of a villager strains both ends; same-town kin does not', () => {
    const s = miniState([
      { from: 'ruth', to: 'tom', kind: 'kin' },
      { from: 'ruth', to: 'ada', kind: 'kin' },
    ]);
    expect(kinStrainOf(s, 'ruth')).toBe(TIE_STRAIN);
    expect(kinStrainOf(s, 'tom')).toBe(TIE_STRAIN);
    expect(kinStrainOf(s, 'ada')).toBe(0);
    expect(strainedTiesOf(s, 'ruth').map((t) => t.otherId)).toEqual(['tom']);
  });

  it('weights by gap difference and closeness of the tie', () => {
    const s = miniState([
      { from: 'ruth', to: 'kit', kind: 'kin' }, // 0.35 apart: barely
      { from: 'ada', to: 'tom', kind: 'friend' }, // full gap, looser tie
      { from: 'kit', to: 'lost', kind: 'kin' }, // unknown town: ignored
      { from: 'tom', to: 'ruth', kind: 'introduced' }, // a new acquaintance, not drift
    ]);
    const ruth = kinStrainOf(s, 'ruth');
    expect(ruth).toBeGreaterThan(0);
    expect(ruth).toBeLessThan(STRAINED);
    expect(kinStrainOf(s, 'ada')).toBeCloseTo(TIE_STRAIN * 0.5, 3);
    expect(kinStrainOf(s, 'lost')).toBe(0);
    expect(strainedTiesOf(s, 'tom').map((t) => t.otherId)).toEqual(['ada']);
  });

  it('keeps the strongest edge between two people', () => {
    const s = miniState([
      { from: 'tom', to: 'ruth', kind: 'introduced' },
      { from: 'ruth', to: 'tom', kind: 'kin' },
    ]);
    expect(kinStrainOf(s, 'ruth')).toBe(TIE_STRAIN);
    expect(strainedTiesOf(s, 'ruth')).toHaveLength(1);
  });

  it('follows a move made the same day', () => {
    const s = miniState([{ from: 'ruth', to: 'tom', kind: 'kin' }]);
    expect(kinStrainOf(s, 'ruth')).toBe(TIE_STRAIN);
    s.people.ruth!.townId = 'city_reach';
    expect(kinStrainOf(s, 'ruth')).toBe(0);
  });

  it('recomputes at dawn when people move, and counts grown children with their parents', () => {
    const s = miniState([{ from: 'ruth', to: 'tom', kind: 'kin' }]);
    expect(kinStrainOf(s, 'ruth')).toBe(TIE_STRAIN);
    s.people.tom!.townId = 'marrow_den';
    s.day += 1;
    expect(kinStrainOf(s, 'ruth')).toBe(0);
    s.people.child = person('child', 'city_reach', 'Wren Calder');
    s.kin = { households: [], lineages: {}, next: 1, children: [
      { id: 'c1', householdId: 'h1', townId: 'marrow_den', given: 'Wren', surname: 'Calder', sex: 'f', parents: ['ruth', 'ada'], born: 0, status: 'adult', personId: 'child' },
    ] };
    s.day += 1;
    expect(kinStrainOf(s, 'child')).toBeCloseTo(1 - (1 - TIE_STRAIN) ** 2, 3);
    expect(kinStrainOf(s, 'ruth')).toBe(TIE_STRAIN);
  });

  it('is deterministic per seed and varies across worlds', () => {
    const a = kinStrainMap(bootPlayState(42, 'marrow').state);
    const b = kinStrainMap(bootPlayState(42, 'marrow').state);
    const c = kinStrainMap(bootPlayState(7, 'marrow').state);
    expect(a).toEqual(b);
    expect(Object.values(a).filter((v) => v >= STRAINED).length).toBeGreaterThan(3);
    expect(c).not.toEqual(a);
  });
});

function fabricState(seed: number): MethodSimState {
  const data = loadData();
  const s = bootPlayState(seed, 'marrow').state as unknown as MethodSimState;
  s.data = data;
  s.rng = createRng(seed);
  s.player = s.player ?? assembleInhabitant(data, 'marrow');
  installFabricReactionSelector(s);
  return s;
}

describe('per-person line selection', () => {
  const pick = (s: MethodSimState, personId: string, methodId: string, kinStrain?: number) =>
    pickFabricReactionLine({ personId, methodId, seed: s.seed, state: s, features: { bakedDynamismLines: true }, kinStrain });

  it('a strained anchor voices kin strain; the same person unstrained never does', () => {
    const s = fabricState(42);
    for (const m of METHODS) {
      const hot = pick(s, 'elias_boone', m, 0.9);
      const cold = pick(s, 'elias_boone', m, 0);
      expect(hot.lineId).toMatch(/kin_strain/);
      expect(cold.lineId).not.toMatch(/kin_strain/);
      expect(hot.text).not.toEqual(cold.text);
    }
  });

  it('reads each person’s own derived strain when the ctx does not pass one', () => {
    const s = fabricState(42);
    const ids = Object.keys(s.people).filter((id) => s.data.peopleById[id]);
    const strained = ids.find((id) => kinStrainOf(s, id) >= STRAINED);
    const calm = ids.find((id) => kinStrainOf(s, id) < STRAINED);
    expect(strained && calm).toBeTruthy();
    expect(pick(s, strained!, 'inspire').lineId).toMatch(/kin_strain/);
    expect(pick(s, calm!, 'inspire').lineId).not.toMatch(/kin_strain/);
    // flags.kinStrain still works as a whole-state override when nothing is passed.
    s.flags.kinStrain = 1;
    expect(pick(s, calm!, 'inspire').lineId).toMatch(/kin_strain/);
  });

  it('generated villagers with city kin get a generic kin-strain line; without, the old fallback', () => {
    const s = fabricState(42);
    const gen = Object.keys(s.people).find((id) => !s.data.peopleById[id])!;
    const hot = pick(s, gen, 'carry_burden', 0.8);
    expect(hot.source).toBe('blend');
    expect(hot.lineId).toMatch(/^frag_gen_.*kin_strain$/);
    expect(hot.text).toMatch(/Family/);
    expect(pick(s, gen, 'carry_burden', 0.8)).toEqual(hot);
    expect(pick(s, gen, 'carry_burden', 0).source).toBe('fallback');
  });
});

describe('in play', () => {
  it('a real act on a strained person carries their kin strain; an unstrained one does not', () => {
    const session = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
    session.start({ seed: 42, archetypeId: 'marrow' });
    const st = session.getState()!;
    const said: Record<string, string> = {};
    session.onJuice((id, p) => {
      const q = p as { personId?: string; line?: string };
      if (id === 'person.reaction' && q.personId) said[q.personId] = q.line ?? '';
    });
    const ids = Object.keys(st.people);
    const hot = ids.find((id) => kinStrainOf(st, id) >= STRAINED && !!(st.data as { peopleById: Record<string, unknown> }).peopleById[id])!;
    const cold = ids.find((id) => kinStrainOf(st, id) === 0 && !!(st.data as { peopleById: Record<string, unknown> }).peopleById[id])!;
    for (const id of [hot, cold]) {
      st.player.spark = 100;
      session.act(`inspire@${id}`);
    }
    expect(said[hot]).toMatch(/[Ff]amily/);
    expect(said[cold] ?? '').not.toMatch(/[Ff]amily makes/);
  });
});

describe('drift dawn lines', () => {
  it('tells of families split by the gap, rotating without repeats', () => {
    const { state } = bootPlayState(42, 'marrow');
    const seen: string[] = [];
    for (let d = 1; d <= 6; d++) {
      state.day = d;
      const lines = kinDriftDawnLines(state);
      expect(lines).toHaveLength(1);
      seen.push(lines[0]!);
    }
    expect(new Set(seen).size).toBe(seen.length);
    const names = Object.values(state.people).map((p) => p.name).filter(Boolean) as string[];
    for (const l of seen) expect(names.some((n) => l.startsWith(n) || l.includes(n))).toBe(true);
    state.day = 1;
    expect(collectDawnLines(state)).toContain(kinDriftDawnLines(state)[0]);
  });

  it('says nothing when no tie crosses the gap', () => {
    const s = miniState([{ from: 'ruth', to: 'ada', kind: 'kin' }]);
    expect(kinDriftDawnLines(s)).toEqual([]);
    const t = miniState([{ from: 'ruth', to: 'tom', kind: 'kin' }]);
    expect(kinDriftDawnLines(t)[0]).toMatch(/Ruth Calder|Tom Calder/);
  });
});
