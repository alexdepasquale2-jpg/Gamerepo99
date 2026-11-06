import { describe, expect, it } from 'vitest';
import {
  peopleDiversity,
  worldDiversity,
  historyCoherence,
  kinConnectedness,
  gapSpread,
  assertionViolationRate,
  assertionViolations,
  determinismEqual,
  repeatLineRate,
  type FabricPersonSample,
  type FabricWorldSample,
  type KinEdgeSample,
  type GapSiteSample,
  type HistoryEventSample,
  type AssertionSample,
  type LineSample,
} from './fabric-metrics';
import thresholds from './fabric-thresholds.json';

function person(
  partial: Partial<FabricPersonSample> & Pick<FabricPersonSample, 'id' | 'fingerprint'>,
): FabricPersonSample {
  return { ...partial };
}

function world(
  partial: Partial<FabricWorldSample> &
    Pick<FabricWorldSample, 'seed' | 'fingerprint'>,
): FabricWorldSample {
  return {
    people: [],
    ...partial,
  };
}

describe('fabric-metrics — people diversity', () => {
  it('returns 1 when all fingerprints are distinct', () => {
    const people = [
      person({ id: 'a', fingerprint: 'fp-a' }),
      person({ id: 'b', fingerprint: 'fp-b' }),
      person({ id: 'c', fingerprint: 'fp-c' }),
    ];
    expect(peopleDiversity(people)).toBe(1);
  });

  it('returns 0 when all fingerprints collide', () => {
    const people = [
      person({ id: 'a', fingerprint: 'same' }),
      person({ id: 'b', fingerprint: 'same' }),
      person({ id: 'c', fingerprint: 'same' }),
    ];
    expect(peopleDiversity(people)).toBe(0);
  });

  it('uses vector distance when fingerprints collide but vectors differ', () => {
    const people = [
      person({
        id: 'a',
        fingerprint: 'same',
        vector: { warmth: 0, bite: 0 },
      }),
      person({
        id: 'b',
        fingerprint: 'same',
        vector: { warmth: 1, bite: 1 },
      }),
    ];
    const d = peopleDiversity(people);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });
});

describe('fabric-metrics — world diversity', () => {
  it('is 1 when every world fingerprint is unique', () => {
    const worlds = [
      world({ seed: 1, fingerprint: 'w1' }),
      world({ seed: 2, fingerprint: 'w2' }),
      world({ seed: 3, fingerprint: 'w3' }),
    ];
    expect(worldDiversity(worlds)).toBe(1);
  });

  it('is 0 when all worlds share one fingerprint', () => {
    const worlds = [
      world({ seed: 1, fingerprint: 'clone' }),
      world({ seed: 2, fingerprint: 'clone' }),
      world({ seed: 3, fingerprint: 'clone' }),
    ];
    expect(worldDiversity(worlds)).toBe(0);
  });

  it('flags near-duplicates via distinct-fingerprint ratio below floor', () => {
    const worlds = [
      world({ seed: 1, fingerprint: 'a' }),
      world({ seed: 2, fingerprint: 'a' }),
      world({ seed: 3, fingerprint: 'b' }),
      world({ seed: 4, fingerprint: 'c' }),
    ];
    // 3 distinct / 4 worlds = 0.75
    expect(worldDiversity(worlds)).toBeCloseTo(0.75);
    expect(worldDiversity(worlds)).toBeLessThan(thresholds.worldDiversityFloor);
  });
});

describe('fabric-metrics — history coherence', () => {
  it('returns precomputed coherence when provided', () => {
    expect(historyCoherence(world({ seed: 1, fingerprint: 'x', historyCoherence: 0.9 }))).toBe(
      0.9,
    );
  });

  it('returns 1 for empty or well-ordered history without breaks', () => {
    const events: HistoryEventSample[] = [
      { id: 'e1', at: 1 },
      { id: 'e2', at: 2 },
      { id: 'e3', at: 5 },
    ];
    expect(
      historyCoherence(world({ seed: 1, fingerprint: 'x', history: events })),
    ).toBe(1);
  });

  it('penalizes out-of-order timestamps as hard breaks', () => {
    const events: HistoryEventSample[] = [
      { id: 'e1', at: 5 },
      { id: 'e2', at: 2 },
      { id: 'e3', at: 3 },
    ];
    const score = historyCoherence(
      world({ seed: 1, fingerprint: 'x', history: events }),
    );
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('fabric-metrics — kin connectedness', () => {
  it('is 1 for a fully connected triangle of people', () => {
    const people = ['p1', 'p2', 'p3'];
    const edges: KinEdgeSample[] = [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p3' },
      { from: 'p3', to: 'p1' },
    ];
    expect(kinConnectedness(people, edges)).toBe(1);
  });

  it('is low when graph is disconnected', () => {
    const people = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const edges: KinEdgeSample[] = [{ from: 'p1', to: 'p2' }];
    const c = kinConnectedness(people, edges);
    // largest component 2/5 = 0.4
    expect(c).toBeCloseTo(0.4);
    expect(c).toBeLessThan(thresholds.kinConnectednessFloor);
  });

  it('is 1 for a single person with no edges', () => {
    expect(kinConnectedness(['solo'], [])).toBe(1);
  });
});

describe('fabric-metrics — gap spread (city↔village)', () => {
  it('is high when sites span near 0 and near 1', () => {
    const sites: GapSiteSample[] = [
      { id: 'v', gap01: 0.05 },
      { id: 't', gap01: 0.5 },
      { id: 'c', gap01: 0.95 },
    ];
    expect(gapSpread(sites)).toBeGreaterThanOrEqual(thresholds.gapSpreadFloor);
  });

  it('is near 0 when all sites collapse to one pole', () => {
    const sites: GapSiteSample[] = [
      { id: 'a', gap01: 0.5 },
      { id: 'b', gap01: 0.51 },
      { id: 'c', gap01: 0.49 },
    ];
    expect(gapSpread(sites)).toBeLessThan(0.2);
  });
});

describe('fabric-metrics — assertions', () => {
  it('assertionViolations counts failing results', () => {
    const results: AssertionSample[] = [
      { ok: true },
      { ok: false, violationId: 'v1' },
      { ok: false, violationId: 'v2' },
    ];
    expect(assertionViolations(results)).toBe(2);
  });

  it('assertionViolationRate is fraction failing', () => {
    const results: AssertionSample[] = [
      { ok: true },
      { ok: false },
      { ok: true },
      { ok: true },
    ];
    expect(assertionViolationRate(results)).toBeCloseTo(0.25);
  });

  it('empty assertions → 0 violations and 0 rate', () => {
    expect(assertionViolations([])).toBe(0);
    expect(assertionViolationRate([])).toBe(0);
  });
});

describe('fabric-metrics — determinism', () => {
  it('determinismEqual is true for deep-equal worlds', () => {
    const a = world({
      seed: 7,
      fingerprint: 'fp',
      people: [person({ id: 'p', fingerprint: 'x' })],
    });
    const b = world({
      seed: 7,
      fingerprint: 'fp',
      people: [person({ id: 'p', fingerprint: 'x' })],
    });
    expect(determinismEqual(a, b)).toBe(true);
  });

  it('determinismEqual is false when fingerprints diverge', () => {
    const a = world({ seed: 7, fingerprint: 'a' });
    const b = world({ seed: 7, fingerprint: 'b' });
    expect(determinismEqual(a, b)).toBe(false);
  });
});

describe('fabric-metrics — repeat line rate', () => {
  it('is 0 when all line texts are unique', () => {
    const lines: LineSample[] = [
      { id: 'l1', text: 'one' },
      { id: 'l2', text: 'two' },
      { id: 'l3', text: 'three' },
    ];
    expect(repeatLineRate(lines)).toBe(0);
  });

  it('counts duplicate texts toward the rate', () => {
    const lines: LineSample[] = [
      { id: 'l1', text: 'same' },
      { id: 'l2', text: 'same' },
      { id: 'l3', text: 'other' },
      { id: 'l4', text: 'same' },
    ];
    // 3 of 4 share the duplicated text → duplicates beyond first = 2/4 = 0.5
    expect(repeatLineRate(lines)).toBeCloseTo(0.5);
  });
});
