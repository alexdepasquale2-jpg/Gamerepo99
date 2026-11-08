/**
 * The interaction model's worked examples (data/systems/interactions/examples.json) replayed through the
 * runtime (sim/interaction resolveInteraction), and the cross-references in interactions/rules.json
 * checked against the tables they point at (ripples, catalog, the promise states the runtime writes).
 */
import { describe, expect, it } from 'vitest';
import examples from '../../src/data/systems/interactions/examples.json';
import migration from '../../src/data/systems/interactions/migration.json';
import rules from '../../src/data/systems/interactions/rules.json';
import catalog from '../../src/data/systems/interactions/catalog.json';
import ripples from '../../src/data/systems/ripples.json';
import { createInteractionRuntime, resolveInteraction } from '../../src/sim/interaction/interactions';
import { loadInteractionTables } from '../../src/sim/interaction/load-interactions';

type Step = { day: number; interactionId: string; args?: Record<string, unknown>; expect: Record<string, unknown> };
type Seq = { id: string; title: string; steps: Step[] };
const T = loadInteractionTables();
const CAT = new Set(catalog.interactions.map((i) => i.id));
const init = examples.initial;

const fresh = () =>
  createInteractionRuntime({
    catalog: T.catalog,
    scoring: T.scoring,
    person: { id: init.personId, flame01: init.flame01, trust: init.trust, marks: { ...init.marks }, touchScore: 0, presence: 0, bond: 0, spark: init.spark } as never,
  });

describe('interaction examples', () => {
  for (const seq of examples.sequences as Seq[]) {
    it(`${seq.id}: ${seq.title}`, () => {
      const rt = fresh();
      for (const [i, st] of seq.steps.entries()) {
        expect(CAT.has(st.interactionId), `${seq.id}[${i}] ${st.interactionId} is in the catalog`).toBe(true);
        const r = resolveInteraction(rt, st.interactionId, init.personId, st.args);
        const e = st.expect;
        for (const k of ['trust', 'flame01', 'touchScore'] as const) if (typeof e[k] === 'number') expect(r[k], `${seq.id}[${i}] ${k}`).toBeCloseTo(e[k] as number, 1);
        if (e.marks) expect(r.marks, `${seq.id}[${i}] marks`).toEqual(e.marks);
        if (e.promise) expect(r.promise).toBe(e.promise);
        expect(r.reignited, `${seq.id}[${i}] reignited`).toBe(e.reignited ?? false);
        expect(r.reigniteBlocked, `${seq.id}[${i}] blocked`).toBe(e.reigniteBlocked ?? false);
      }
    });
  }

  it('the kind path and the repair both reignite; the broken promise does not yet', () => {
    const last = (id: string) => (examples.sequences as Seq[]).find((s) => s.id === id)!.steps.at(-1)!.expect;
    expect(last('A_kind_path').reignited).toBe(true);
    expect(last('B_savage_then_repair').reignited).toBe(true);
    expect(last('C_break_promise_deepen_hollow').reignited).toBe(false);
  });
});

describe('interaction rules.json', () => {
  it('points at the ripples table and its fields', () => {
    expect(rules.ripples.reuseSystemRipples).toBe('systems/ripples.json');
    const at = (path: string): unknown => path.split('.').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ripples);
    expect(typeof at(rules.ripples.help.crossTownChanceRef)).toBe('number');
    expect(typeof at(rules.ripples.cling.sparkDrainRef)).toBe('number');
    expect(rules.ripples.cling.whenMarksAny).toEqual(ripples.cling.requireMarksAny);
    expect(rules.ripples.help.kinNeighborsMax).toBeGreaterThan(0);
  });

  it('promise states are the ones the runtime writes', () => {
    const rt = fresh();
    const seen = new Set<string>();
    for (const id of ['promise_make', 'promise_keep', 'promise_make', 'promise_break']) {
      const p = resolveInteraction(rt, id, init.personId).promise;
      if (p) seen.add(p);
    }
    expect([...seen].sort()).toEqual([...rules.promise.states].sort());
  });

  it('every retired interaction is gone from the catalog and named in migration', () => {
    const retired = new Set(migration.map.flatMap((m) => (m as { retire?: string[] }).retire ?? []));
    for (const id of ['favor_do', 'work_alongside']) {
      expect(retired.has(id)).toBe(true);
      expect(CAT.has(id)).toBe(false);
    }
  });
});
