import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/sim/load-data';
import { buildStateVector, isAuthoredAnchor } from '../../src/sim/person-vector';

describe('person state vector', () => {
  it('authored ashford marta is anchor and has finite vector', () => {
    const data = loadData();
    const v = buildStateVector(data.peopleById.marta_ellison, {
      trust: 0.5,
      notoriety: 0,
      data,
    });
    expect(isAuthoredAnchor(data.peopleById.marta_ellison)).toBe(true);
    expect(v.warmth).toBeGreaterThanOrEqual(0);
    expect(v.warmth).toBeLessThanOrEqual(1);
  });

  it('ashford cast are authored anchors; lowmere are not', () => {
    const data = loadData();
    expect(isAuthoredAnchor(data.peopleById.jonah_pike)).toBe(true);
    expect(isAuthoredAnchor(data.peopleById.nora_voss)).toBe(false);
  });

  it('vector clamps continuous drives and reads hollowness from worldCtx', () => {
    const data = loadData();
    const v = buildStateVector(data.peopleById.marta_ellison, {
      trust: 1.5,
      notoriety: -0.2,
      flame01: 0.25,
      hollowness: 0.8,
      kinStrain: 0.1,
      data,
    });
    expect(v.trust).toBe(1);
    expect(v.notoriety).toBe(0);
    expect(v.flame01).toBe(0.25);
    expect(v.hollowness).toBe(0.8);
    expect(v.kinStrain).toBe(0.1);
  });

  it('person without voice-anchor still gets a finite default vector', () => {
    const data = loadData();
    const v = buildStateVector(data.peopleById.nora_voss, { trust: 0.2, notoriety: 0.1, data });
    for (const key of [
      'warmth',
      'bite',
      'piety',
      'secrecy',
      'weariness',
      'flame01',
      'trust',
      'hollowness',
      'notoriety',
      'kinStrain',
    ] as const) {
      expect(Number.isFinite(v[key])).toBe(true);
      expect(v[key]).toBeGreaterThanOrEqual(0);
      expect(v[key]).toBeLessThanOrEqual(1);
    }
  });
});
