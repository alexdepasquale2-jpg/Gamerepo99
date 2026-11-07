import { describe, expect, it } from 'vitest';
import catalogJson from '../../../src/data/systems/interactions/catalog.json';
import examplesJson from '../../../src/data/systems/interactions/examples.json';
import scoringJson from '../../../src/data/systems/interactions/scoring.json';
import {
  createInteractionRuntime,
  resolveInteraction,
  type InteractionDef,
  type InteractionScoring,
} from '../../../src/sim/interaction/interactions';

interface Step {
  day: number;
  interactionId: string;
  args?: Record<string, unknown>;
  expect: Record<string, unknown> & { marks?: Record<string, number> };
}
interface Sequence { id: string; title: string; steps: Step[] }

const examples = examplesJson as unknown as {
  initial: { personId: string; flame01: number; trust: number; marks: Record<string, number>; touchScore: number; presence: number; bond: number; spark: number };
  sequences: Sequence[];
};
const NUMERIC = ['flame01', 'trust', 'bond', 'presence', 'touchScore'] as const;

describe('interaction examples A/B/C (spec §8)', () => {
  for (const seq of examples.sequences) {
    it(`${seq.id}: ${seq.title}`, () => {
      const { personId, ...rest } = examples.initial;
      const rt = createInteractionRuntime({
        catalog: catalogJson as unknown as { interactions: InteractionDef[] },
        scoring: scoringJson as unknown as InteractionScoring,
        person: { id: personId, ...rest, marks: { ...rest.marks } },
      });
      seq.steps.forEach((step, i) => {
        const out = resolveInteraction(rt, step.interactionId, personId, step.args);
        const at = `${seq.id}[${i}] ${step.interactionId}`;
        const e = step.expect;
        for (const k of NUMERIC) {
          if (typeof e[k] === 'number') expect(out[k], `${at} ${k}`).toBeCloseTo(e[k] as number, 6);
        }
        if (typeof e.spark === 'number') expect(out.spark, `${at} spark`).toBeCloseTo(e.spark, 6);
        for (const [m, n] of Object.entries(e.marks ?? {})) {
          expect(out.marks[m] ?? 0, `${at} mark ${m}`).toBe(n);
        }
        if (e.promise !== undefined) expect(out.promise, `${at} promise`).toBe(e.promise);
        if (e.reignited !== undefined) expect(out.reignited, `${at} reignited`).toBe(e.reignited);
        if (e.reigniteBlocked !== undefined) expect(out.reigniteBlocked, `${at} blocked`).toBe(e.reigniteBlocked);
      });
    });
  }
});
