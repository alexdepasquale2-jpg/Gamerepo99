import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { attractorRoadBonus, addNotoriety, ensureHoard, leverageDiscount, rollAttractors, tickNotorietyDawn } from '../../../src/sim/hoard';
import { ensureStash } from '../../../src/sim/hoard/state';
import { tickHoardDawn, applyAttractorEffects } from '../../../src/sim/hoard';
import { startTravel } from '../../../src/sim/travel/travel';

const boot = (seed = 5) => bootPlayState(seed, 'marrow').state;

describe('notoriety', () => {
  it('dawn fade is 1% and heat = n * (0.5 + 0.5 * visibleWealth)', () => {
    const s = boot();
    ensureHoard(s).notoriety = 0.5;
    s.hoard!.lastStashActDay = s.day;
    expect(tickNotorietyDawn(s).heat).toBeCloseTo(0.495 * 0.5);
    expect(s.hoard!.notoriety).toBeCloseTo(0.495);
    ensureStash(s, 'stash_ashford_cellar').coin = 60;
    s.player.townId = 'ashford';
    const full = 60 / 100; // capacity 60 + 40
    expect(tickNotorietyDawn(s).heat).toBeCloseTo(0.49005 * (0.5 + 0.5 * full));
  });

  it('a rise emits a notoriety ripple tag and a kin rumor diluted by kinDilution', () => {
    const s = boot();
    s.player.townId = Object.values(s.people).find((p) => p.townId)!.townId;
    addNotoriety(s, 'gain_patron_deal');
    expect(s.hoard!.notoriety).toBeCloseTo(0.1);
    expect(s.bus?.lastIds).toContain('notoriety.rise');
    const pkt = s.packets.find((p) => p.kind === 'notoriety_rumor');
    if (pkt) expect(pkt.heat).toBeCloseTo(0.05);
    addNotoriety(s, 'loss_quiet_charity');
    expect(s.hoard!.notoriety).toBeCloseTo(0.06);
  });

  it('attractors fire only at >= minNotoriety and are deterministic', () => {
    const s = boot();
    ensureHoard(s).notoriety = 0.2;
    for (let d = 1; d < 300; d++) {
      s.day = d;
      expect(rollAttractors(s, 'dawn')).toEqual([]);
    }
    s.hoard!.notoriety = 1;
    const seen = new Set<string>();
    for (let d = 1; d < 300; d++) {
      s.day = d;
      const a = rollAttractors(s, 'dawn');
      expect(rollAttractors(s, 'dawn')).toEqual(a);
      a.forEach((x) => seen.add(x));
    }
    expect(seen.has('att_copycat')).toBe(true);
    expect(seen.has('att_thief')).toBe(false); // road-only
    expect(rollAttractors(s, 'road').every((x) => x === 'att_thief')).toBe(true);
  });

  it('dying town lowers copycat odds', () => {
    const count = (despair: number) => {
      const s = boot();
      s.towns = { [s.player.townId!]: { id: s.player.townId!, economyOptIn: false, stock: {}, despair } };
      ensureHoard(s).notoriety = 1;
      let n = 0;
      for (let d = 1; d < 400; d++) {
        s.day = d;
        n += rollAttractors(s, 'dawn').filter((x) => x === 'att_copycat').length;
      }
      return n;
    };
    expect(count(0.75)).toBeLessThan(count(0));
  });

  it('both edges: leverage discount and road thief weight rise with notoriety', () => {
    const s = boot();
    expect(leverageDiscount(s, ['hard'])).toBe(0);
    expect(attractorRoadBonus(s, 'att_thief')).toBe(0);
    ensureHoard(s).notoriety = 0.5;
    expect(leverageDiscount(s, ['hard'])).toBeCloseTo(0.15);
    expect(leverageDiscount(s, ['gift'])).toBe(0);
    expect(attractorRoadBonus(s, 'att_thief')).toBeCloseTo(1.2 * 0.5 * 40);
  });

  it('notoriety drives road encounters: thieves only appear when notorious', () => {
    const thieves = (n: number) => {
      let c = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const b = bootPlayState(seed, 'marrow');
        ensureHoard(b.state).notoriety = n;
        const route = b.routes[0]!;
        b.state.player.townId = route.fromId;
        const emit = b.state.bus!.emit!;
        b.state.bus!.emit = (e, p) => {
          if (e === 'encounter.spawn' && (p as { encounterId: string }).encounterId.startsWith('enc_road_thief')) c++;
          emit(e, p);
        };
        startTravel(b.state, route.id);
      }
      return c;
    };
    expect(thieves(0)).toBe(0);
    expect(thieves(1)).toBeGreaterThan(0);
  });

  it('src/sim never branches on archetypeId in hoard code', () => {
    for (const f of ['state', 'stash', 'notoriety', 'neglect', 'index']) {
      expect(readFileSync(`src/sim/hoard/${f}.ts`, 'utf8')).not.toMatch(/archetypeId\s*===/);
      expect(readFileSync(`src/sim/hoard/${f}.ts`, 'utf8')).not.toMatch(/Math\.random/);
    }
  });

  it('each authored attractor effect applies deterministically, scaled by notoriety', () => {
    const run = (id: string, n: number) => {
      const s = boot();
      ensureHoard(s).notoriety = n;
      const before = { spark: s.player.spark, trust: s.player.perception?.trust ?? 0 };
      applyAttractorEffects(s, id);
      return { spark: s.player.spark - before.spark, trust: (s.player.perception?.trust ?? 0) - before.trust };
    };
    const rows = (boot().data as any).notoriety.attractors.filter((a: any) => a.effects?.length);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const a of rows) {
      const e = a.effects[0];
      const key = e.target === 'player.spark' ? 'spark' : 'trust';
      expect(run(a.id, 0)[key as 'spark']).toBe(0);
      expect(run(a.id, 1)[key as 'spark']).toBeCloseTo(e.value);
      expect(run(a.id, 0.5)[key as 'spark']).toBeCloseTo(e.value * 0.5);
      expect(run(a.id, 0.5)).toEqual(run(a.id, 0.5));
    }
  });

  it('dawn applies fired attractor effects (same seed -> same state)', () => {
    const go = () => {
      const s = boot();
      ensureHoard(s).notoriety = 1;
      for (let d = 1; d < 60; d++) {
        s.day = d;
        tickHoardDawn(s);
      }
      return [s.player.spark, s.player.perception?.trust ?? 0];
    };
    expect(go()).toEqual(go());
    expect(go()).not.toEqual([boot().player.spark, 0]);
  });
});
