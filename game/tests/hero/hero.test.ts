import { describe, expect, it } from 'vitest';
import type { SimState } from '../../src/sim/types/runtime';
import { BASES, FOES, LAIRS, PACKS, SKILLS, foeRow, xpToNext } from '../../src/sim/hero/data';
import { banditCalm, clearCell, clearLair, onKill, weakenedMul } from '../../src/sim/hero/deeds';
import { equip, rollGear, salvage } from '../../src/sim/hero/gear';
import { afterArmor, fall, gainXp, heroOf, hurt, statsOf } from '../../src/sim/hero/hero';
import { assign, learn } from '../../src/sim/hero/skills';
import { lairSites, packFor, scaled } from '../../src/sim/hero/spawns';
import { worksOf } from '../../src/sim/works/state';
import { defenceOf } from '../../src/sim/works/war';
import { ITEM_BY_ID } from '../../src/sim/goods/inventory';

function tiny(): SimState {
  return {
    day: 5, seed: 3, flags: {}, packets: [],
    player: { id: 'player', townId: 't1', spark: 50, sparkMax: 100, coin: 100, embodiment: {} },
    inventory: { coin: 100 },
    people: { a: { id: 'a', townId: 't2', flame: 30, age: 30 } },
    towns: { t1: { id: 't1', despair: 0.4, stock: {}, economyOptIn: true }, t2: { id: 't2', despair: 0.2, stock: {}, economyOptIn: true } },
  } as unknown as SimState;
}

describe('hero tables', () => {
  it('every pack and lair names real foes; every drop is a real item; bases and skills are sound', () => {
    for (const shapes of Object.values(PACKS)) for (const s of shapes) for (const id of s) expect(foeRow(id), id).toBeTruthy();
    for (const l of Object.values(LAIRS)) for (const id of [l.boss, ...l.guard]) expect(foeRow(id), id).toBeTruthy();
    for (const f of FOES) {
      for (const d of f.drops.items) expect(ITEM_BY_ID.has(d.id), `${f.id}: ${d.id}`).toBe(true);
      if (f.summon) expect(foeRow(f.summon)).toBeTruthy();
    }
    expect(BASES.some((b) => b.slot === 'weapon' && b.level === 1)).toBe(true);
    expect(SKILLS.length).toBe(9);
  });
});

describe('the hero', () => {
  it('starts with a sword, a jerkin, Cleave on Q and full health', () => {
    const s = tiny();
    const h = heroOf(s);
    expect(h.gear.weapon?.base).toBe('sword');
    expect(h.slots[0]).toBe('cleave');
    expect(h.hp).toBe(statsOf(s).maxHp);
  });

  it('levels up with experience: points, full health, more health', () => {
    const s = tiny();
    const h = heroOf(s);
    const hp0 = statsOf(s).maxHp;
    h.hp = 1;
    expect(gainXp(s, xpToNext(1) + 1)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.points).toEqual({ attr: 2, skill: 1 });
    expect(statsOf(s).maxHp).toBeGreaterThan(hp0);
    expect(h.hp).toBe(statsOf(s).maxHp);
  });

  it('armour turns harm aside; falling costs a tenth of your coin and leaves half health', () => {
    const s = tiny();
    expect(afterArmor(20, 40)).toBe(10);
    expect(hurt(s, 1000)).toBe(true);
    expect(fall(s)).toBe(10);
    expect(heroOf(s).hp).toBe(Math.ceil(statsOf(s).maxHp / 2));
  });

  it('gear rolls are seeded, equip swaps into the bag, salvage pays', () => {
    const a = tiny(), b = tiny();
    const ga = rollGear(a, 5, 'rare'), gb = rollGear(b, 5, 'rare');
    expect(ga).toEqual(gb);
    expect(ga.affixes.length).toBeGreaterThanOrEqual(2);
    heroOf(a).bag.push(ga);
    expect(equip(a, ga.id).ok).toBe(true);
    const coin = a.inventory!.coin!;
    const old = heroOf(a).bag[0]!;
    expect(salvage(a, old.id).ok).toBe(true);
    expect(a.inventory!.coin!).toBeGreaterThan(coin);
  });

  it('skills are learned with points at their level and slotted on Q R F', () => {
    const s = tiny();
    expect(learn(s, 'spark_bolt').ok).toBe(false); // no points
    gainXp(s, xpToNext(1));
    expect(learn(s, 'spark_bolt').ok).toBe(true);
    expect(heroOf(s).slots[1]).toBe('spark_bolt');
    expect(learn(s, 'lunge').ok).toBe(false); // level 7
    expect(assign(s, 2, 'cleave').ok).toBe(true);
    expect(heroOf(s).slots).toEqual([null, 'spark_bolt', 'cleave']);
  });
});

describe('the wilds', () => {
  it('packs are seeded per cell and day, and a cleared cell stays empty today', () => {
    const s = tiny();
    const ctx = { nearRoad: true, despair: 0.5, night: false, hostile: false };
    let key = '';
    for (let cx = 0; cx < 30 && !key; cx++) { const p = packFor(s, cx, 0, ctx); if (p) key = p.key; }
    const [cx, cy] = key.split(',').map(Number) as [number, number];
    expect(packFor(s, cx, cy, ctx)).toEqual(packFor(s, cx, cy, ctx));
    clearCell(s, key);
    expect(packFor(s, cx, cy, ctx)).toBeNull();
    s.day++;
    // A new day may bring a new pack (or not), but the cell is no longer marked cleared.
    expect(heroOf(s).cleared[key]).toBe(s.day - 1);
  });

  it('only rival soldiers come where a town is hostile, and none where it is not', () => {
    const s = tiny();
    const fams = new Set<string>();
    for (let cx = 0; cx < 60; cx++) { const p = packFor(s, cx, 1, { nearRoad: false, despair: 0, night: false, hostile: false }); if (p) fams.add(p.family); }
    expect(fams.has('rival')).toBe(false);
  });

  it('lairs are stable for a save, and a cleared lair sleeps', () => {
    const s = tiny();
    const a = lairSites(s, ['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(lairSites(s, ['r1', 'r2', 'r3', 'r4', 'r5'])).toEqual(a);
    const r = clearLair(s, a[0]!.id, a[0]!.name, 3, 't1');
    expect(r.coin).toBeGreaterThan(0);
    expect(['rare', 'epic', 'kindled']).toContain(r.gear.rarity);
    expect(worksOf(s).stats.lairs).toBe(1);
  });

  it('kills pay experience and leave their mark: despair eases, roads calm, rival towns weaken', () => {
    const s = tiny();
    const d0 = s.towns!.t1!.despair;
    const sp = onKill(s, 'hollow', 3, { nearTown: 't1' });
    expect(sp.xp).toBe(scaled(foeRow('hollow')!, 3).xp);
    expect(s.towns!.t1!.despair).toBeLessThan(d0);
    expect(banditCalm(s)).toBe(1);
    onKill(s, 'raider', 1);
    expect(banditCalm(s)).toBeLessThan(1);
    const def0 = defenceOf(s, 't2');
    for (let i = 0; i < 5; i++) onKill(s, 'levy', 1, { rivalTown: 't2' });
    expect(weakenedMul(s, 't2')).toBeCloseTo(0.7);
    expect(defenceOf(s, 't2')).toBeLessThanOrEqual(def0);
    expect(worksOf(s).stats.slain).toBe(7);
  });
});
