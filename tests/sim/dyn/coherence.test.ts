import { describe, expect, it } from 'vitest';
import { loadData } from '../../../src/sim/load-data';
import {
  assertLineCandidate,
  assertWorldCoherence,
  type CoherenceWorld,
  type LineFragment,
  type LinePerson,
} from '../../../src/sim/dyn/coherence';
import { assertVoice } from '../../../src/sim/dyn/voice';

function constraints() {
  return loadData().voiceConstraints;
}

describe('assertLineCandidate', () => {
  it('rejects fragment that contradicts hollowness memory (rule_no_contradict_memory / vc)', () => {
    const person: LinePerson = {
      id: 'ruth',
      marks: [{ markId: 'hollowness', stacks: 1 }],
    };
    const fragment: LineFragment = { tags: ['mood:naive_hope'] };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('rejects cheerful line on grief wound (rule_no_cheerful_grief / vc_no_cheerful_grief)', () => {
    const person: LinePerson = { id: 'mourner', woundId: 'grief' };
    const fragment: LineFragment = { tags: ['mood:cheerful'] };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('rejects calls_protagonist_kind after shame_resolved (vc_child_after_shame)', () => {
    const person: LinePerson = {
      id: 'child',
      tags: ['child'],
      memory: ['event:shame_resolved'],
    };
    const fragment: LineFragment = { tags: ['mood:calls_protagonist_kind'] };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('rejects forbidTagsTogether tender+savage (vc_no_warm_bite_spike)', () => {
    const person: LinePerson = { id: 'any' };
    const fragment: LineFragment = { tags: ['mood:tender', 'mood:savage'] };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('rejects dead person line candidate (rule_no_dead_speak)', () => {
    const person: LinePerson = { id: 'ghost', flags: ['dead'], alive: false };
    const fragment: LineFragment = { tags: ['mood:somber'], text: 'hello' };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('rejects voice vector out of bounds (rule_voice_vector_bounds)', () => {
    const person: LinePerson = {
      id: 'oob',
      vector: { warmth: 1.4, bite: 0.2, piety: 0.2, secrecy: 0.2, weariness: 0.2 },
    };
    const fragment: LineFragment = { tags: ['mood:somber'] };
    expect(assertLineCandidate(person, fragment, constraints())).toBe(false);
  });

  it('accepts aligned hollowness / grief / alive candidates (happy path)', () => {
    expect(
      assertLineCandidate(
        { id: 'ruth', marks: [{ markId: 'hollowness', stacks: 1 }] },
        { tags: ['mood:hollow', 'axis:mark_hollowness'] },
        constraints(),
      ),
    ).toBe(true);
    expect(
      assertLineCandidate(
        { id: 'mourner', woundId: 'grief', alive: true },
        { tags: ['mood:somber', 'shape:grief'] },
        constraints(),
      ),
    ).toBe(true);
    expect(
      assertLineCandidate(
        {
          id: 'ok',
          vector: { warmth: 0.4, bite: 0.5, piety: 0.2, secrecy: 0.3, weariness: 0.6 },
        },
        { tags: ['mood:wary'] },
        constraints(),
      ),
    ).toBe(true);
  });
});

describe('assertWorldCoherence', () => {
  it('flags orphan facility without town or route', () => {
    const bad: CoherenceWorld = {
      facilities: [{ id: 'x', townId: 'nope' }],
      towns: {},
      routes: [],
    };
    const r = assertWorldCoherence(bad);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('orphan_facility') || v.includes('x'))).toBe(
      true,
    );
  });

  it('passes when facility town exists', () => {
    const ok: CoherenceWorld = {
      facilities: [{ id: 'mill', townId: 'ashford' }],
      towns: { ashford: { id: 'ashford' } },
      routes: [],
    };
    expect(assertWorldCoherence(ok).ok).toBe(true);
  });

  it('flags gapAxis out of [0,1] when gapSites present', () => {
    const bad: CoherenceWorld = {
      facilities: [],
      towns: {},
      routes: [],
      gapSites: [{ id: 'bad', gap01: 1.5 }],
    };
    const r = assertWorldCoherence(bad);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('gap'))).toBe(true);
  });
});

describe('assertVoice + coherence', () => {
  it('assertVoice fires coherence violation when person+fragment contradict', () => {
    const r = assertVoice({
      text: 'Maybe tomorrow will be bright.',
      person: { id: 'ruth', marks: [{ markId: 'hollowness', stacks: 1 }] },
      fragment: { tags: ['mood:naive_hope'] },
      constraints: constraints(),
    });
    expect(r.ok).toBe(false);
    expect(r.violationId).toBeTruthy();
  });

  it('assertVoice still rejects scaffold lines without coherence opts', () => {
    expect(assertVoice({ text: 'stub-voice-1-0' }).ok).toBe(false);
  });
});
