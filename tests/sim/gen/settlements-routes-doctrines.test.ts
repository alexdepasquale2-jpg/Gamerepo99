import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { dumpWorld } from '../../../src/sim/fabric/world-dump';

describe('worldgen settlements / routes / doctrines', () => {
  it('same seed yields identical settlements, routes, and doctrines', () => {
    const a = generateWorld({ seed: 42, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    expect(a.settlements).toEqual(b.settlements);
    expect(a.routes).toEqual(b.routes);
    expect(a.doctrines).toEqual(b.doctrines);
    expect(a).toEqual(b);
  });

  it('emits ≥3 settlements with ids and gap01', () => {
    for (const seed of [7, 42, 1, 99]) {
      const w = generateWorld({ seed, peopleCount: 8 });
      expect(w.settlements?.length ?? 0).toBeGreaterThanOrEqual(3);
      for (const s of w.settlements ?? []) {
        expect(s.id.length).toBeGreaterThan(0);
        expect(s.gap01).toBeGreaterThanOrEqual(0);
        expect(s.gap01).toBeLessThanOrEqual(1);
      }
    }
  });

  it('has at least one route linking selected settlements', () => {
    for (const seed of [7, 42, 11]) {
      const w = generateWorld({ seed, peopleCount: 8 });
      const ids = new Set((w.settlements ?? []).map((s) => s.id));
      expect(w.routes?.length ?? 0).toBeGreaterThanOrEqual(1);
      for (const r of w.routes ?? []) {
        expect(ids.has(r.fromId)).toBe(true);
        expect(ids.has(r.toId)).toBe(true);
      }
    }
  });

  it('doctrines list is non-empty', () => {
    for (const seed of [7, 42, 3]) {
      const w = generateWorld({ seed, peopleCount: 8 });
      expect(w.doctrines?.length ?? 0).toBeGreaterThanOrEqual(1);
      for (const d of w.doctrines ?? []) {
        expect(d.id.length).toBeGreaterThan(0);
      }
    }
  });

  it('seeds 7 vs 42 diverge in settlement ids and doctrine ids', () => {
    const a = generateWorld({ seed: 7, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    const settKey = (w: typeof a) =>
      (w.settlements ?? [])
        .map((s) => s.id)
        .slice()
        .sort()
        .join('|');
    const docKey = (w: typeof a) =>
      (w.doctrines ?? [])
        .map((d) => d.id)
        .slice()
        .sort()
        .join('|');
    const routeKey = (w: typeof a) =>
      (w.routes ?? [])
        .map((r) => `${r.fromId}->${r.toId}`)
        .slice()
        .sort()
        .join('|');
    // At least one of settlements / doctrines / routes must differ across seeds.
    const diverge =
      settKey(a) !== settKey(b) ||
      docKey(a) !== docKey(b) ||
      routeKey(a) !== routeKey(b);
    expect(diverge).toBe(true);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('keeps Probe gapSites / history / kin present and coherent', () => {
    const w = generateWorld({ seed: 42, peopleCount: 8 });
    expect((w.gapSites ?? []).length).toBeGreaterThanOrEqual(3);
    expect((w.history ?? []).length).toBeGreaterThanOrEqual(2);
    expect((w.kinEdges ?? []).length).toBeGreaterThan(0);
    expect(w.people.length).toBe(8);
  });

  it('dumpWorld mentions settlement ids when present', () => {
    const w = generateWorld({ seed: 7, peopleCount: 4 });
    expect((w.settlements ?? []).length).toBeGreaterThanOrEqual(3);
    const { text } = dumpWorld(w);
    for (const s of w.settlements ?? []) {
      expect(text).toContain(`settlement:${s.id}`);
    }
  });
});
