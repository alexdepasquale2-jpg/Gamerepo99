/**
 * Social graph 06 — Blessings and Burdens runtime (§10 hooks, §11 tests-first).
 * Spec: docs/superpowers/specs/2026-11-06-social-graph/06-blessings-and-burdens.md
 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../../src/sim/load-data';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { parseSave, serializeSave } from '../../../src/sim/save';
import {
  comeToPassUnspoken,
  createUnspokenState,
  decayUnspoken,
  encodeUnspoken,
  encodeUnspokenForState,
  witnessOutcome,
} from '../../../src/sim/social';
import { createSocialGraph } from '../../../src/sim/social/social-graph';
import { createPlaySession } from '../../../src/sim';

const data = loadData();
const T = data.unspoken;
const SEED = 7;

function encodeKeep(st = createUnspokenState(), personId = 'p1') {
  const made = encodeUnspoken(st, T, {
    interactionId: 'promise_keep',
    sourcePersonId: personId,
    placeTownId: 'ashford',
    day: 1,
    seed: SEED,
  });
  return { st, made };
}

describe('unspoken tables', () => {
  it('loadData exposes classes, outcomes, tuning and fragments', () => {
    expect(T.classes.length).toBeGreaterThan(5);
    expect(T.outcomes.some((o) => o.id === 'dance_for_kids')).toBe(true);
    expect(T.tuning.caps.blessingBiasMax).toBe(0.1);
    expect(T.fragments.some((f) => f.id === 'frag_unspoken_dance_for_kids')).toBe(true);
  });
});

describe('encode (§4)', () => {
  it('promise_keep creates a kept-promise instance at ≈ baseWeight', () => {
    const { made } = encodeKeep();
    expect(made).toHaveLength(1);
    const cls = T.classes.find((c) => c.id === made[0].classId)!;
    expect(made[0].classId).toMatch(/^unspoken_kept_promise_/);
    expect(made[0].weight).toBeCloseTo(cls.baseWeight, 6);
    expect(made[0].consumed).toBe(false);
  });

  it('unmatched interaction encodes nothing', () => {
    const st = createUnspokenState();
    expect(encodeUnspoken(st, T, { interactionId: 'nope', sourcePersonId: 'p', placeTownId: 't', day: 0, seed: 1 })).toEqual([]);
  });

  it('caps active instances per source person', () => {
    const st = createUnspokenState();
    for (let i = 0; i < 9; i++) encodeKeep(st, 'p1');
    expect(st.instances.filter((x) => x.sourcePersonId === 'p1')).toHaveLength(T.tuning.runtime.maxActivePerSource);
  });
});

describe('decay (§5)', () => {
  it('after halfLifeDays dawns weight ≈ half', () => {
    const { st, made } = encodeKeep();
    const cls = T.classes.find((c) => c.id === made[0].classId)!;
    for (let d = 0; d < cls.halfLifeDays; d++) decayUnspoken(st, T);
    expect(st.instances[0].weight).toBeCloseTo(cls.baseWeight / 2, 4);
  });

  it('below epsilon fades without coming to pass', () => {
    const { st } = encodeKeep();
    const faded: string[] = [];
    for (let d = 0; d < 200 && st.instances.length; d++) faded.push(...decayUnspoken(st, T));
    expect(st.instances).toEqual([]);
    expect(faded).toHaveLength(1);
  });
});

describe('come to pass (§6, §8)', () => {
  const ctx = (day: number) => ({
    day,
    seed: SEED,
    playerId: 'player',
    circumstanceTags: ['kin_visit'],
    peopleByTown: { ashford: ['player', 'p1', 'p2'] },
    roll: () => 0,
  });

  it('forced tags + rng stub → consumed exactly once', () => {
    const { st } = encodeKeep();
    const first = comeToPassUnspoken(st, T, ctx(2));
    expect(first).toHaveLength(1);
    expect(st.instances).toEqual([]);
    expect(comeToPassUnspoken(st, T, ctx(3))).toEqual([]);
  });

  it('carrier is never the player and a fragment line is chosen', () => {
    const { st } = encodeKeep(createUnspokenState(), 'player');
    const [r] = comeToPassUnspoken(st, T, ctx(2));
    expect(r.carrierId).not.toBe('player');
    expect(r.fragmentId).toBeTruthy();
    expect(typeof r.line).toBe('string');
  });

  it('filled line has no unfilled slots', () => {
    const { st } = encodeKeep();
    const [r] = comeToPassUnspoken(st, T, ctx(2));
    expect(r.line).toBeTruthy();
    expect(r.line).not.toContain('{');
  });

  it('carrierPrefer kin picks the kin-linked candidate', () => {
    const { st } = encodeKeep();
    const graph = createSocialGraph([
      { id: 'e1', a: 'p1', b: 'p3', kind: 'kin', weight: 0.5 },
    ]);
    const c = { ...ctx(2), graph, peopleByTown: { ashford: ['player', 'p1', 'p2', 'p3'] } };
    const prefer = (k: string) => ({ ...T, outcomes: T.outcomes.map((o) => ({ ...o, carrierPrefer: k })) });
    const [r] = comeToPassUnspoken(st, prefer('kin'), c);
    expect(r.carrierId).toBe('p3');
  });

  it('no matching circumstance → nothing comes to pass', () => {
    const { st } = encodeKeep();
    expect(comeToPassUnspoken(st, T, { ...ctx(2), circumstanceTags: ['nothing'] })).toEqual([]);
    expect(st.instances).toHaveLength(1);
  });
});

describe('carrier slot uses display name, never raw id', () => {
  const FRAG_T = {
    ...T,
    fragments: T.fragments.map((f) => ({ ...f, text: '{carrier} nodded.' })),
  };
  const run = (nameOf?: (id: string) => string | undefined) => {
    const { st } = encodeKeep();
    return comeToPassUnspoken(st, FRAG_T, {
      day: 2, seed: SEED, playerId: 'player', circumstanceTags: ['kin_visit'],
      peopleByTown: { ashford: ['p_ashford_03'] }, roll: () => 0, nameOf,
    })[0];
  };
  it('fills with nameOf, falls back to a neutral phrase', () => {
    expect(run((id) => (id === 'p_ashford_03' ? 'Ada Vale' : undefined))?.line).toBe('Ada Vale nodded.');
    const line = run()?.line;
    expect(line).toBe('a neighbour nodded.');
    expect(line).not.toContain('p_ashford_03');
  });
  it('SimState come-to-pass line has the person name, not the id', () => {
    const { state } = bootPlayState(SEED, 'marrow');
    const id = Object.keys(state.people).find((k) => typeof state.data?.peopleById?.[k]?.name === 'string')!;
    const name = state.data!.peopleById[id].name as string;
    state.flags.circumstanceTags = ['kin_visit', 'letter_arrived', 'show_up_day', 'town_festival', 'quiet_dawn'];
    const lines: string[] = [];
    (state.bus ??= { lastIds: [] } as never) as { emit?: (e: string, p: unknown) => void };
    (state.bus as { emit?: (e: string, p: unknown) => void }).emit = (e, p) => {
      const l = (p as { line?: string; source?: string })?.line;
      if (e === 'person.reaction' && l) lines.push(l);
    };
    for (let i = 0; i < 5; i++) encodeUnspokenForState(state, 'promise_keep', id);
    for (let i = 0; i < 40 && state.unspoken!.instances.length; i++) advanceToDawn(state);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) for (const pid of Object.keys(state.people)) expect(l).not.toContain(pid);
    expect(lines.some((l) => l.includes(name)) || lines.every((l) => !l.includes('{'))).toBe(true);
  });
});

describe('tuning (§9)', () => {
  it('20 blessing witnesses never push blessingBias past +0.10', () => {
    const st = createUnspokenState();
    for (let i = 0; i < 20; i++) witnessOutcome(st, T, 'unspoken_favor_warmth', 'blessing');
    const b = st.tuning.unspoken_favor_warmth.blessingBias;
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThanOrEqual(0.1 + 1e-9);
    for (let i = 0; i < 60; i++) witnessOutcome(st, T, 'unspoken_favor_warmth', 'burden');
    expect(st.tuning.unspoken_favor_warmth.blessingBias).toBeGreaterThanOrEqual(-0.1 - 1e-9);
  });
});

describe('SimState integration (§10)', () => {
  it('dawn surfaces only via person.reaction / packet.emit / letter.*, consumes once, persists in save', () => {
    const { state } = bootPlayState(SEED, 'marrow');
    const personId = Object.keys(state.people)[0];
    state.flags.circumstanceTags = ['kin_visit', 'letter_arrived', 'show_up_day', 'town_festival', 'quiet_dawn'];
    const made = encodeUnspokenForState(state, 'promise_keep', personId);
    expect(made).toHaveLength(1);

    const blob = serializeSave({ version: 1, seed: SEED, tick: 0, npcs: [], unspoken: state.unspoken });
    expect(parseSave(blob)?.unspoken?.instances).toHaveLength(1);

    const before = state.bus?.lastIds?.length ?? 0;
    for (let i = 0; i < 40 && state.unspoken!.instances.length; i++) advanceToDawn(state);
    const ids = (state.bus?.lastIds ?? []).slice(before).filter((id) => /unspoken|reaction|packet|letter|popup|toast/.test(id));
    for (const id of ids) expect(id === 'person.reaction' || id === 'packet.emit' || id.startsWith('letter.')).toBe(true);
    expect(state.unspoken!.instances).toEqual([]);
  });

  it('play session snapshot carries unspoken state and stays deterministic', () => {
    const run = () => {
      const s = createPlaySession({ mode: 'play', seed: SEED });
      s.start({ seed: SEED });
      for (let i = 0; i < 6; i++) {
        const a = s.listActions()[0];
        if (a) s.act(a.id);
        s.tick();
      }
      return s.snapshot();
    };
    const a = run();
    expect(a.unspoken).toBeDefined();
    expect(run()).toEqual(a);
  });
});
