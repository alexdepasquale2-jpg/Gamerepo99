import { describe, expect, it } from 'vitest';
import {
  assertVoice,
  generatePeople,
  generatePersonDraft,
  generateWorld,
} from '../../src/sim/fabric';
import { loadData } from '../../src/sim/load-data';
import { generateWorld as generateWorldGen } from '../../src/sim/gen/world';

describe('fabric facade baked lines (Probe seam)', () => {
  it('generateWorld(42) lines are not stub-voice and come from fragment corpus', () => {
    const corpus = new Set(
      loadData().lineFragments.fragments.map((f) => f.text).filter(Boolean),
    );
    expect(corpus.size).toBeGreaterThan(50);

    const w = generateWorld({ seed: 42, peopleCount: 8 });
    const lines = w.lines ?? w.people.flatMap((p) => p.lines ?? []);
    expect(lines.length).toBeGreaterThanOrEqual(8);

    for (const line of lines) {
      expect(line.text).not.toMatch(/^stub-voice-/);
      expect(corpus.has(line.text)).toBe(true);
      expect(assertVoice(line).ok).toBe(true);
    }
    for (const p of w.people) {
      for (const line of p.lines ?? []) {
        expect(line.text).not.toMatch(/^stub-voice-/);
        expect(corpus.has(line.text)).toBe(true);
      }
    }
  });

  it('generateWorld seed 42 twice is deep-equal', () => {
    const a = generateWorld({ seed: 42, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    expect(a).toEqual(b);
  });

  it('generatePeople / generatePersonDraft via facade also bake real lines', () => {
    const corpus = new Set(loadData().lineFragments.fragments.map((f) => f.text));
    const people = generatePeople({ seed: 7, count: 3 });
    expect(people).toHaveLength(3);
    for (const p of people) {
      const line = p.lines?.[0];
      expect(line?.text).toBeTruthy();
      expect(line!.text).not.toMatch(/^stub-voice-/);
      expect(corpus.has(line!.text)).toBe(true);
    }
    const draft = generatePersonDraft({ seed: 7, index: 1 });
    expect(draft.lines?.[0]?.text).not.toMatch(/^stub-voice-/);
    expect(corpus.has(draft.lines![0]!.text)).toBe(true);
  });

  it('gen/world stub path may still emit stub-voice (facade is the public seam)', () => {
    const w = generateWorldGen({ seed: 42 });
    const text = w.people[0]?.lines?.[0]?.text ?? '';
    expect(text).toMatch(/^stub-voice-/);
  });
});
