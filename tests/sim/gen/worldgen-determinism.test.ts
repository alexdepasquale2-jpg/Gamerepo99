import { describe, expect, it } from 'vitest';
import {
  gapSpread,
  historyCoherence,
  kinConnectedness,
} from '../../bots/fabric/fabric-metrics';
import thresholds from '../../bots/fabric/fabric-thresholds.json';
import { generateWorld } from '../../../src/sim/gen/world';

function historyBeatIds(seed: number): string[] {
  return (generateWorld({ seed, peopleCount: 8 }).history ?? []).map((h) => h.id);
}

function historyTagKeys(seed: number): string {
  const tags = (generateWorld({ seed, peopleCount: 8 }).history ?? [])
    .flatMap((h) => h.tags ?? [])
    .slice()
    .sort();
  return tags.join('|');
}

function gap01Key(seed: number): string {
  return (generateWorld({ seed, peopleCount: 8 }).gapSites ?? [])
    .map((s) => s.gap01.toFixed(4))
    .sort()
    .join(',');
}

function kinShapeKey(seed: number): string {
  const w = generateWorld({ seed, peopleCount: 8 });
  return (w.kinEdges ?? [])
    .map((e) => `${e.kind ?? 'kin'}:${e.from}->${e.to}`)
    .sort()
    .join('|');
}

describe('worldgen determinism', () => {
  it('same seed yields deep-equal worlds', () => {
    const a = generateWorld({ seed: 42, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    expect(a).toEqual(b);
  });

  it('same seed fingerprint is stable across runs', () => {
    const a = generateWorld({ seed: 7, peopleCount: 8 });
    const b = generateWorld({ seed: 7, peopleCount: 8 });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('worldgen cross-seed structural diversity (Probe NO-SHIP killers)', () => {
  it('seeds 7 vs 42 differ in history beat ids (not only seed embedded in id)', () => {
    const ids7 = historyBeatIds(7);
    const ids42 = historyBeatIds(42);
    expect(ids7.length).toBeGreaterThanOrEqual(2);
    expect(ids42.length).toBeGreaterThanOrEqual(2);

    // Strip digit/seed suffixes — structural beat identity must differ.
    const stripSeed = (id: string) => id.replace(/_?\d+/g, '').replace(/hist_/g, '');
    const core7 = ids7.map(stripSeed).sort().join('|');
    const core42 = ids42.map(stripSeed).sort().join('|');
    expect(core7).not.toBe(core42);
  });

  it('seeds 7 vs 42 differ in history tags', () => {
    expect(historyTagKeys(7)).not.toBe(historyTagKeys(42));
  });

  it('seeds 7 vs 42 differ in gap01 multisets (not the fixed 0/0.5/1 scaffold)', () => {
    const g7 = gap01Key(7);
    const g42 = gap01Key(42);
    expect(g7).not.toBe('0.0000,0.5000,1.0000');
    expect(g42).not.toBe('0.0000,0.5000,1.0000');
    expect(g7).not.toBe(g42);
  });

  it('seeds 7 vs 42 differ in kin graph shape/edge kinds (not the fixed 8-edge chain)', () => {
    const k7 = kinShapeKey(7);
    const k42 = kinShapeKey(42);
    expect(k7).not.toBe(k42);

    // Must not be a pure linear kin chain of length peopleCount-1 with one friend wrap.
    const w = generateWorld({ seed: 7, peopleCount: 8 });
    const kinds = (w.kinEdges ?? []).map((e) => e.kind ?? 'kin');
    const kinOnlyChain =
      kinds.filter((k) => k === 'kin').length === 7 &&
      kinds.filter((k) => k === 'friend').length === 1 &&
      kinds.length === 8;
    // Across seeds at least one should break the stub pattern; seed 7 alone may vary.
    // Require: either edge count ≠ 8 or kind multiset ≠ {kin×7, friend×1}.
    const stubShape = kinOnlyChain;
    const w42 = generateWorld({ seed: 42, peopleCount: 8 });
    const kinds42 = (w42.kinEdges ?? []).map((e) => e.kind ?? 'kin');
    const stub42 =
      kinds42.filter((k) => k === 'kin').length === 7 &&
      kinds42.filter((k) => k === 'friend').length === 1 &&
      kinds42.length === 8;
    expect(stubShape && stub42).toBe(false);
  });

  it('seeds 7 vs 42 yield distinct world fingerprints', () => {
    const a = generateWorld({ seed: 7, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});


describe('worldgen includeAnchors merge', () => {
  it('includes authored ashford anchors when includeAnchors true', () => {
    const w = generateWorld({ seed: 7, peopleCount: 3, includeAnchors: true });
    const byId = Object.fromEntries(w.people.map((p) => [p.id, p]));
    expect(byId.marta_ellison?.anchor || byId.marta_ellison?.authored).toBeTruthy();
    expect(byId.jonah_pike?.anchor || byId.jonah_pike?.authored).toBeTruthy();
    expect(byId.harold_finch?.anchor || byId.harold_finch?.authored).toBeTruthy();
    expect(byId.ruth_calder?.anchor || byId.ruth_calder?.authored).toBeTruthy();
    expect(byId.elias_boone?.anchor || byId.elias_boone?.authored).toBeTruthy();
    expect(byId.clara_whitby?.anchor || byId.clara_whitby?.authored).toBeTruthy();
  });

  it('same seed + includeAnchors is deterministic', () => {
    const a = generateWorld({ seed: 7, peopleCount: 3, includeAnchors: true });
    const b = generateWorld({ seed: 7, peopleCount: 3, includeAnchors: true });
    expect(a).toEqual(b);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('omitted / false includeAnchors keeps procedural-only people for Probe', () => {
    const omitted = generateWorld({ seed: 42, peopleCount: 8 });
    const falsy = generateWorld({ seed: 42, peopleCount: 8, includeAnchors: false });
    expect(omitted.people.map((p) => p.id)).toEqual(falsy.people.map((p) => p.id));
    expect(omitted.people.every((p) => p.id.startsWith('gen_p_'))).toBe(true);
    expect(omitted.people.some((p) => p.id === 'marta_ellison')).toBe(false);
    expect(omitted.fingerprint).toBe(falsy.fingerprint);
    expect(omitted.people).toHaveLength(8);
  });
});

describe('worldgen Probe structural floors', () => {
  for (const seed of [7, 42, 1, 99]) {
    it(`seed ${seed} keeps historyCoherence / kinConnectedness / gapSpread above floors`, () => {
      const w = generateWorld({ seed, peopleCount: 8 });
      expect(historyCoherence(w)).toBeGreaterThanOrEqual(thresholds.historyCoherenceFloor);
      expect(
        kinConnectedness(
          w.people.map((p) => p.id),
          w.kinEdges ?? [],
        ),
      ).toBeGreaterThanOrEqual(thresholds.kinConnectednessFloor);
      expect(gapSpread(w.gapSites ?? [])).toBeGreaterThanOrEqual(thresholds.gapSpreadFloor);
      expect((w.gapSites ?? []).length).toBeGreaterThanOrEqual(3);
      const history = w.history ?? [];
      expect(history.length).toBeGreaterThanOrEqual(2);
      const ats = history.map((h) => h.at ?? 0);
      expect(ats).toEqual([...ats].sort((x, y) => x - y));
    });
  }
});
