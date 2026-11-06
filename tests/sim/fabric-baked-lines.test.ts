import { describe, expect, it } from 'vitest';
import {
  assertVoice,
  generatePeople,
  generatePersonDraft,
  generateWorld,
} from '../../src/sim/fabric';
import { scoreBakeCandidate } from '../../src/sim/fabric-bake-score';
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

  it('zero stub-voice across Probe default seeds (peopleCount 8)', () => {
    // Mirror fabric-thresholds defaultSeeds — do not import tests/bots from sim/.
    const seeds = [1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29];
    const corpus = new Set(
      loadData().lineFragments.fragments.map((f) => f.text).filter(Boolean),
    );
    for (const seed of seeds) {
      const w = generateWorld({ seed, peopleCount: 8 });
      const lines = w.lines ?? w.people.flatMap((p) => p.lines ?? []);
      expect(lines.length).toBe(8);
      for (const line of lines) {
        expect(line.text).not.toMatch(/^stub-voice-/);
        expect(corpus.has(line.text)).toBe(true);
        expect(assertVoice(line).ok).toBe(true);
      }
      // Determinism per seed
      expect(generateWorld({ seed, peopleCount: 8 })).toEqual(w);
    }
  });

  it('within one world, baked lines are unique (anti-dup clears Probe repeatLineRate)', () => {
    const seeds = [1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29];
    let dupes = 0;
    let total = 0;
    for (const seed of seeds) {
      const w = generateWorld({ seed, peopleCount: 8 });
      const lines = w.lines ?? w.people.flatMap((p) => p.lines ?? []);
      total += lines.length;
      const seen = new Set<string>();
      for (const line of lines) {
        if (seen.has(line.text)) dupes++;
        else seen.add(line.text);
      }
      expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length);
    }
    expect(dupes / total).toBeLessThanOrEqual(0.15);
  });


  it('unique-text count scales with pool across Probe default seeds', () => {
    const seeds = [1, 2, 3, 4, 5, 7, 11, 13, 17, 19, 23, 29];
    const alonePoolSize = (loadData().lineFragments.fragments ?? []).filter((f) => {
      if (!f.text?.trim()) return false;
      if (f.slot === 'alone') return true;
      return (f.tags ?? []).includes('slot:alone');
    }).length;
    expect(alonePoolSize).toBeGreaterThan(100);

    const allTexts: string[] = [];
    for (const seed of seeds) {
      const w = generateWorld({ seed, peopleCount: 8 });
      const lines = w.lines ?? w.people.flatMap((p) => p.lines ?? []);
      expect(lines).toHaveLength(8);
      expect(new Set(lines.map((l) => l.text)).size).toBe(8);
      allTexts.push(...lines.map((l) => l.text));
    }
    const totalLines = allTexts.length; // 96
    const uniqueAcrossSeeds = new Set(allTexts).size;
    // Far above the pre-widen catchphrase deck (~24). Scales with pool usage, not favorites.
    expect(totalLines).toBe(96);
    expect(uniqueAcrossSeeds).toBeGreaterThanOrEqual(80);
    expect(uniqueAcrossSeeds).toBeGreaterThanOrEqual(
      Math.min(96, Math.floor(alonePoolSize * 0.05)),
    );
  });

  it('scoreBakeCandidate prefers rotated band and penalizes recent neighbors', () => {
    const poolLength = 1000;
    const seed = 42;
    const personIndex = 3;
    const stride = Math.max(1, Math.floor(poolLength / 16));
    const base = (Math.imul(seed, 0x9e3779b9) >>> 0) % poolLength;
    const ideal = (base + personIndex * stride) % poolLength;

    const near = scoreBakeCandidate({
      poolIndex: ideal,
      poolLength,
      personIndex,
      seed,
      usedPoolIndices: [],
      fragId: 'near',
    });
    const far = scoreBakeCandidate({
      poolIndex: (ideal + Math.floor(poolLength / 2)) % poolLength,
      poolLength,
      personIndex,
      seed,
      usedPoolIndices: [],
      fragId: 'far',
    });
    expect(near).toBeGreaterThan(far);

    const awayFromUsed = scoreBakeCandidate({
      poolIndex: (ideal + stride * 4) % poolLength,
      poolLength,
      personIndex,
      seed,
      usedPoolIndices: [ideal],
      fragId: 'away',
    });
    const besideUsed = scoreBakeCandidate({
      poolIndex: (ideal + 1) % poolLength,
      poolLength,
      personIndex,
      seed,
      usedPoolIndices: [ideal],
      fragId: 'beside',
    });
    // Novelty: sitting on/near a recently chosen index is worse than sitting farther away
    // (comparing two non-ideal spots — besideUsed is closer to ideal but novelty should dominate).
    expect(awayFromUsed).toBeGreaterThan(besideUsed);
  });

  it('gen/world stub path may still emit stub-voice (facade is the public seam)', () => {
    const w = generateWorldGen({ seed: 42 });
    const text = w.people[0]?.lines?.[0]?.text ?? '';
    expect(text).toMatch(/^stub-voice-/);
  });
});
