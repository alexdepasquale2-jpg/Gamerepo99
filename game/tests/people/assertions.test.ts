/**
 * The integrity rules (data/systems/assertions) against their own fixture cases, and the voice constraints
 * (data/dialogue/voice-constraints.json) against the authored fragments. The constraints only trip on a
 * line that breaks them, which no authored line does; this is where they are proven to work.
 */
import { describe, expect, it } from 'vitest';
import indexJson from '../../src/data/systems/assertions/index.json';
import constraintsJson from '../../src/data/dialogue/voice-constraints.json';
import { RULES, violations, type AssertionFixture } from '../../src/sim/assertions';
import { violatesConstraints, type Constraint } from '../../src/sim/dyn/line-score';
import { loadLineFragmentsTable } from '../../src/sim/load-fragments';

type Case = { id: string; title: string; expectPass: boolean; violatesRuleId: string | null; fixture: AssertionFixture };
const caseFiles = import.meta.glob('../../src/data/systems/assertions/cases-*.json', { eager: true }) as Record<string, { cases: Case[] }>;
const CASES = Object.values(caseFiles).flatMap((m) => m.cases);

type Beat = { id: string; preconditions?: { tag?: string }[] };
const beatFiles = import.meta.glob('../../src/data/world/history/historyBeats-*.json', { eager: true }) as Record<string, { historyBeats?: Beat[] }>;
const PRE = new Map(Object.values(beatFiles).flatMap((m) => m.historyBeats ?? []).map((b) => [b.id, (b.preconditions ?? []).map((p) => p.tag!).filter(Boolean)]));
const pre = (id: string): string[] | undefined => PRE.get(id);

describe('assertion rules', () => {
  it('index lists every case file and case id', () => {
    const files = Object.keys(caseFiles).map((p) => p.split('/').pop());
    expect([...files, 'rules.json'].sort()).toEqual([...indexJson.files].sort());
    expect(CASES.map((c) => c.id).sort()).toEqual([...indexJson.caseIds].sort());
  });

  it('every rule has a case that breaks it', () => {
    const broken = new Set(CASES.filter((c) => !c.expectPass).map((c) => c.violatesRuleId));
    for (const r of RULES) expect(broken.has(r.id), r.id).toBe(true);
  });

  for (const c of CASES) {
    it(`${c.id}: ${c.title}`, () => {
      const v = violations(c.fixture, pre);
      if (c.expectPass) expect(v).toEqual([]);
      else expect(v).toContain(c.violatesRuleId);
    });
  }
});

describe('voice constraints', () => {
  const constraints = constraintsJson.constraints as (Constraint & { id: string })[];
  const frags = loadLineFragmentsTable().fragments;

  for (const c of constraints) {
    it(`${c.id} keeps a breaking line out`, () => {
      for (const pair of c.forbidTagsTogether ?? []) {
        expect(violatesConstraints({ id: 'bad', text: 'x', tags: [...pair] }, new Set(), [c])).toBe(true);
      }
      for (const rule of c.neverContradict ?? []) {
        expect(violatesConstraints({ id: 'bad', text: 'x', tags: [rule.forbidFragmentTag] }, new Set([rule.ifMemory]), [c])).toBe(true);
        expect(violatesConstraints({ id: 'ok', text: 'x', tags: [rule.forbidFragmentTag] }, new Set(), [c])).toBe(false);
      }
    });

    it(`${c.id}: no authored fragment breaks it`, () => {
      const memory = new Set((c.neverContradict ?? []).map((r) => r.ifMemory));
      const bad = frags.filter((f) => violatesConstraints(f, memory, [c])).map((f) => f.id);
      expect(bad).toEqual([]);
    });
  }
});
