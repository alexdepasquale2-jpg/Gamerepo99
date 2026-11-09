import { describe, expect, it } from 'vitest';
import { allPairs, polityIfAny } from '../../src/sim/civic/district-relations';
import { realm } from '../../src/sim/map/districts';
import { createPlaySession } from '../../src/sim/play-session/play-session';
import type { PlaySession } from '../../src/sim/play-session/play-session-types';
import { BAKE, BAKE_MAX, agoText, bakeDawnsOf, bakeOf, bakeRealm, clampDawns, createBaker, districtTale, isBakedBeat, realmSummary } from '../../src/sim/realm-bake';
import { realmIfAny } from '../../src/sim/realm';

const SEED = 42;
function play(bakeDawns?: number): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: SEED, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: SEED, archetypeId: 'marrow', ...(bakeDawns !== undefined ? { bakeDawns } : {}) });
  return s;
}

describe('realm bake', () => {
  it('clamps the dawns to 0..100000', () => {
    expect(BAKE_MAX).toBe(100_000);
    expect(clampDawns(-5)).toBe(0);
    expect(clampDawns(12.9)).toBe(12);
    expect(clampDawns(1e9)).toBe(BAKE_MAX);
    expect(clampDawns('x')).toBe(0);
  });

  it('0 dawns is the seed: no past, nothing moved', () => {
    const b = bakeRealm(SEED, 0), seed = realm(SEED);
    expect(b.districts).toHaveLength(100);
    b.districts.forEach((d, i) => {
      expect(d.despair).toBe(seed[i]!.despair);
      expect(d.glow).toBe(0);
      expect(d.events).toEqual([]);
    });
    expect(b.ages).toEqual([]);
    expect(Object.values(b.pairs).every((p) => p.state === 'peace')).toBe(true);
  });

  it('is a pure function of (seed, dawns), whole or in slices', () => {
    const whole = createBaker(SEED, 3000).result();
    const sliced = createBaker(SEED, 3000);
    while (!sliced.step(700));
    expect(sliced.done()).toBe(3000);
    expect(JSON.stringify(sliced.result())).toBe(JSON.stringify(whole));
    expect(JSON.stringify(createBaker(SEED + 1, 3000).result())).not.toBe(JSON.stringify(whole));
  });

  it('every district lives the whole past, in bounds, and keeps a bounded memory', () => {
    for (const dawns of [1, 100, 2800, 28000]) {
      const b = bakeRealm(SEED, dawns);
      const keep = BAKE.tuning.keepGreat + BAKE.tuning.keepRecent;
      for (const d of b.districts) {
        expect(d.despair).toBeGreaterThanOrEqual(0);
        expect(d.despair).toBeLessThanOrEqual(1);
        expect(Math.abs(d.glow)).toBeLessThanOrEqual(1);
        expect(d.people).toBeGreaterThan(0);
        expect(d.events.length).toBeLessThanOrEqual(keep);
        for (const e of d.events) { expect(e.day).toBeLessThanOrEqual(0); expect(e.day).toBeGreaterThan(-dawns); }
      }
      expect(Object.keys(b.pairs)).toHaveLength(allPairs().length);
      // Ages tile the whole past with no gap.
      if (b.ages.length) {
        expect(b.ages[0]!.from).toBe(1 - dawns);
        expect(b.ages[b.ages.length - 1]!.to).toBe(0);
        for (let i = 1; i < b.ages.length; i++) expect(b.ages[i]!.from).toBe(b.ages[i - 1]!.to + 1);
        expect(b.ages.length).toBeLessThanOrEqual(BAKE.tuning.ages.count + 1);
        expect(new Set(b.ages.map((a) => a.name)).size).toBe(b.ages.length);
      }
    }
  });

  it('a long past leaves a realm that differs from district to district', () => {
    const b = bakeRealm(SEED, 28000);
    const desp = b.districts.map((d) => d.despair);
    expect(Math.max(...desp) - Math.min(...desp)).toBeGreaterThan(0.5);
    expect(b.totals.wars).toBeGreaterThan(100);
    expect(b.totals.sparkbearer).toBeGreaterThan(10);
    expect((b.totals.fallen ?? 0) + (b.totals.beacons ?? 0)).toBeGreaterThan(0);
    expect(realmSummary(b).join(' ')).toContain('1,000 years');
  });

  it('the full 100,000 dawns bake', () => {
    const t0 = performance.now();
    const b = bakeRealm(SEED, BAKE_MAX);
    expect(b.dawns).toBe(BAKE_MAX);
    expect(b.ages).toHaveLength(10);
    expect(performance.now() - t0).toBeLessThan(20_000);
  });

  it('every remembered event can be told, with every slot filled', () => {
    const b = bakeRealm(SEED, 28000);
    let told = 0;
    for (const d of b.districts) {
      const tale = districtTale(b, d.id);
      expect(tale).toHaveLength(d.events.length);
      for (const t of tale) { expect(t.line).not.toMatch(/[{}]/); expect(t.gist).not.toMatch(/[{}]/); expect(t.line.length).toBeGreaterThan(20); told++; }
    }
    expect(told).toBeGreaterThan(500);
    expect(agoText(3)).toBe('only days ago');
    expect(agoText(28 * 12)).toBe('12 years ago');
    expect(agoText(28 * 1400)).toBe('some 1,400 years ago');
  });
});

describe('a baked realm in play', () => {
  it('a young world is exactly the world the game always made', () => {
    const a = play(), b = play(0);
    expect(b.snapshot().fingerprint).toBe(a.snapshot().fingerprint);
    expect(realmIfAny(b.getState())?.bake).toBeUndefined();
    expect(bakeOf(b.getState())).toBeUndefined();
    expect(JSON.stringify(b.saveBlob()!.sim!.towns)).toBe(JSON.stringify(a.saveBlob()!.sim!.towns));
    expect(JSON.stringify(b.saveBlob()!.sim!.people)).toBe(JSON.stringify(a.saveBlob()!.sim!.people));
  });

  it('the home district wakes in what its past left, and its people can tell it', () => {
    const young = play(0).getState()!, s = play(2800), st = s.getState()!;
    expect(bakeDawnsOf(st)).toBe(2800);
    const bake = bakeOf(st)!, home = bake.byId.d4_4!;
    const beats = (st.history ?? []).filter(isBakedBeat);
    expect(beats).toHaveLength(home.events.length);
    expect(beats.every((h) => !!h.summary && !!h.gist && !!h.townId && !!st.towns![h.townId!])).toBe(true);
    const shift = home.despair - 0.3;
    for (const [id, t] of Object.entries(st.towns!)) expect((t as { despair: number }).despair).toBeCloseTo(Math.min(0.95, Math.max(0, (young.towns![id] as { despair: number }).despair + shift)), 6);
    // Its neighbours' pacts and wars are on the map from day 1, as the bake left them.
    const rel = polityIfAny(st)!.relations;
    expect(Object.keys(rel)).toHaveLength(allPairs().length);
    for (const [k, r] of Object.entries(rel)) expect(r.state).toBe(bake.pairs[k]!.state);
  });

  it('the past survives a save and a load, and is never laid twice', () => {
    const s = play(2800);
    s.tick();
    const beats = (s.getState()!.history ?? []).filter(isBakedBeat).length;
    const blob = JSON.parse(JSON.stringify(s.saveBlob()));
    const t = play();
    t.loadBlob(blob);
    expect(bakeDawnsOf(t.getState())).toBe(2800);
    expect((t.getState()!.history ?? []).filter(isBakedBeat)).toHaveLength(beats);
    t.loadBlob(JSON.parse(JSON.stringify(t.saveBlob())));
    expect((t.getState()!.history ?? []).filter(isBakedBeat)).toHaveLength(beats);
  });

  it('another district is as its own past left it the first time you enter', () => {
    const s = play(28000);
    const to = s.trunkRoads()[0]!.to, id = `d${to.col}_${to.row}`;
    const baked = bakeOf(s.getState())!.byId[id]!;
    expect(s.trunkRoads()[0]!.despair).toBe(baked.despair);
    s.enterDistrict(to);
    const st = s.getState()!;
    const desp = Object.values(st.towns!).map((t) => (t as { despair: number }).despair);
    expect(Math.abs(desp.reduce((a, b) => a + b, 0) / desp.length - baked.despair)).toBeLessThan(0.2);
    expect((st.flags.baked as Record<string, boolean>)[id]).toBe(true);
    expect((st.history ?? []).filter(isBakedBeat)).toHaveLength(baked.events.length);
    if (baked.glow > 0.3) expect(Object.values(st.people).some((p) => p.flame >= 35)).toBe(true);
  });
});
