import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/gen/world';
import { dumpWorld } from '../../../src/sim/fabric/world-dump';

describe('worldgen facilities / biomes', () => {
  it('same seed yields identical facilities and biomes', () => {
    const a = generateWorld({ seed: 42, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    expect(a.facilities).toEqual(b.facilities);
    expect(a.biomes).toEqual(b.biomes);
    expect(a).toEqual(b);
  });

  it('emits non-empty facilities with ids tied to settlement or route', () => {
    for (const seed of [7, 42, 1, 99]) {
      const w = generateWorld({ seed, peopleCount: 8 });
      expect(w.facilities?.length ?? 0).toBeGreaterThanOrEqual(1);
      const townIds = new Set((w.settlements ?? []).map((s) => s.id));
      const routeIds = new Set((w.routes ?? []).map((r) => r.id));
      for (const f of w.facilities ?? []) {
        expect(f.id.length).toBeGreaterThan(0);
        const okTown = f.townId != null && townIds.has(f.townId);
        const okRoute = f.routeId != null && routeIds.has(f.routeId);
        expect(okTown || okRoute).toBe(true);
      }
    }
  });

  it('emits non-empty biomes with ids', () => {
    for (const seed of [7, 42, 11]) {
      const w = generateWorld({ seed, peopleCount: 8 });
      expect(w.biomes?.length ?? 0).toBeGreaterThanOrEqual(1);
      for (const b of w.biomes ?? []) {
        expect(b.id.length).toBeGreaterThan(0);
        expect(b.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('seeds 7 vs 42 diverge in facility ids and/or biome ids', () => {
    const a = generateWorld({ seed: 7, peopleCount: 8 });
    const b = generateWorld({ seed: 42, peopleCount: 8 });
    const facKey = (w: typeof a) =>
      (w.facilities ?? [])
        .map((f) => f.id)
        .slice()
        .sort()
        .join('|');
    const biomeKey = (w: typeof a) =>
      (w.biomes ?? [])
        .map((x) => x.id)
        .slice()
        .sort()
        .join('|');
    const diverge = facKey(a) !== facKey(b) || biomeKey(a) !== biomeKey(b);
    expect(diverge).toBe(true);
  });

  it('keeps settlements / routes / doctrines / Probe fields green', () => {
    const w = generateWorld({ seed: 42, peopleCount: 8 });
    expect((w.settlements ?? []).length).toBeGreaterThanOrEqual(3);
    expect((w.routes ?? []).length).toBeGreaterThanOrEqual(1);
    expect((w.doctrines ?? []).length).toBeGreaterThanOrEqual(1);
    expect((w.gapSites ?? []).length).toBeGreaterThanOrEqual(3);
    expect((w.history ?? []).length).toBeGreaterThanOrEqual(2);
    expect((w.kinEdges ?? []).length).toBeGreaterThan(0);
    expect(w.people.length).toBe(8);
  });

  it('dumpWorld mentions facility ids when present', () => {
    const w = generateWorld({ seed: 7, peopleCount: 4 });
    expect((w.facilities ?? []).length).toBeGreaterThanOrEqual(1);
    const { text } = dumpWorld(w);
    for (const f of w.facilities ?? []) {
      expect(text).toContain(`facility:${f.id}`);
    }
  });
});
