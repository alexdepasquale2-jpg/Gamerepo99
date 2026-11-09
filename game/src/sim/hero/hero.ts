/**
 * The hero's state and numbers: lazily made with starting gear and Cleave; stats from level, attributes
 * and gear; experience and levelling (an attribute point twice a level-up pair, a skill point each level,
 * full health); taking harm through armour; falling (half health back, some coin lost, woken at a town).
 * Pure + deterministic.
 */
import { addItem, inventoryOf } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { worksIfAny } from '../works/state';
import { GEAR_PER_LEVEL, MAX_LEVEL, START_GEAR, START_SKILLS, baseRow, xpToNext } from './data';
import type { Attr, GearItem, HeroNews, HeroState, Stats } from './types';

export function heroOf(state: SimState): HeroState {
  const s = state as SimState & { hero?: HeroState };
  if (!s.hero) {
    const gear: HeroState['gear'] = {};
    for (const [slot, g] of Object.entries(START_GEAR)) gear[slot as keyof HeroState['gear']] = { id: `start-${slot}`, base: g.base, rarity: g.rarity, level: g.level, name: g.name, affixes: [] };
    s.hero = {
      v: 1, level: 1, xp: 0, hp: 0, attrs: { might: 0, grit: 0, wits: 0 }, points: { attr: 0, skill: 0 },
      skills: { ...START_SKILLS.skills }, slots: [...START_SKILLS.slots], gear, bag: [], kills: {}, slain: {},
      lairs: {}, cleared: {}, weakened: {}, banditDays: [], deaths: 0, rolls: 0, news: [],
    };
    s.hero.hp = statsOf(state).maxHp;
  }
  return s.hero;
}
export const heroIfAny = (state: SimState): HeroState | undefined => (state as SimState & { hero?: HeroState }).hero;

/** Item-level scale for a weapon's damage or armour's armour. */
export const levelScale = (level: number): number => 1 + GEAR_PER_LEVEL * (level - 1);
const affixSum = (gear: (GearItem | undefined)[], stat: string): number => gear.reduce((n, g) => n + (g?.affixes.filter((a) => a.stat === stat).reduce((m, a) => m + a.value, 0) ?? 0), 0);

export function statsOf(state: SimState): Stats {
  const h = (state as SimState & { hero?: HeroState }).hero;
  const level = h?.level ?? 1;
  const g = h ? [h.gear.weapon, h.gear.armor, h.gear.charm] : [];
  const might = (h?.attrs.might ?? 0) + affixSum(g, 'might');
  const grit = (h?.attrs.grit ?? 0) + affixSum(g, 'grit');
  const wits = (h?.attrs.wits ?? 0) + affixSum(g, 'wits');
  const w = h?.gear.weapon ? baseRow(h.gear.weapon.base) : baseRow('sword');
  const a = h?.gear.armor ? baseRow(h.gear.armor.base) : undefined;
  const wl = levelScale(h?.gear.weapon?.level ?? 1);
  const valor = worksIfAny(state)?.boons.includes('valor') ? 1.25 : 1;
  const dmgMul = (1 + might * 0.05 + affixSum(g, 'dmgPct') / 100) * valor;
  const base = w?.dmg ?? [4, 6];
  return {
    maxHp: Math.round(60 + (level - 1) * 12 + grit * 7 + affixSum(g, 'hp')),
    armor: Math.round((a?.armor ?? 0) * levelScale(h?.gear.armor?.level ?? 1) + grit * 0.6 + affixSum(g, 'armor')),
    dmg: [Math.max(1, Math.round(base[0] * wl * dmgMul)), Math.max(1, Math.round(base[1] * wl * dmgMul))],
    rate: (w?.rate ?? 1.4) * (1 + affixSum(g, 'ratePct') / 100),
    reach: w?.reach ?? 46,
    arc: w?.arc ?? 100,
    shot: w?.shot ?? 0,
    crit: Math.min(0.6, 0.05 + wits * 0.01 + affixSum(g, 'crit') / 100),
    leech: affixSum(g, 'leech'),
    sparkHit: affixSum(g, 'sparkHit'),
    move: (a?.speed ?? 1) * (1 + affixSum(g, 'movePct') / 100),
    sparkRegen: 0.25 + wits * 0.06 + (w?.sparkRegen ?? 0) + (a?.sparkRegen ?? 0),
    xpMul: 1 + affixSum(g, 'xpPct') / 100,
    might, grit, wits,
  };
}

/** Harm after armour (armour / (armour + 40) is turned aside). */
export const afterArmor = (dmg: number, armor: number): number => Math.max(1, Math.round(dmg * (1 - armor / (armor + 40))));

export function heroNews(state: SimState, text: string, townId?: string): void {
  const h = heroOf(state);
  const n: HeroNews = { day: state.day, text, ...(townId ? { townId } : {}) };
  h.news.push(n);
  if (h.news.length > 30) h.news.splice(0, h.news.length - 30);
}

/** Gain experience; returns the levels gained (each: +1 skill point, +2 attribute points, full health). */
export function gainXp(state: SimState, xp: number): number {
  const h = heroOf(state);
  h.xp += Math.round(xp * statsOf(state).xpMul);
  let gained = 0;
  while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
    h.xp -= xpToNext(h.level);
    h.level++;
    h.points.skill++;
    h.points.attr += 2;
    gained++;
  }
  if (gained) h.hp = statsOf(state).maxHp;
  return gained;
}

export function spendAttr(state: SimState, attr: Attr): boolean {
  const h = heroOf(state);
  if (h.points.attr <= 0) return false;
  h.points.attr--;
  h.attrs[attr]++;
  return true;
}

/** Take harm; true when it fells you. */
export function hurt(state: SimState, dmg: number): boolean {
  const h = heroOf(state);
  h.hp = Math.max(0, h.hp - dmg);
  return h.hp <= 0;
}
export function heal(state: SimState, n: number): void {
  const h = heroOf(state);
  h.hp = Math.min(statsOf(state).maxHp, h.hp + n);
}

/** Fallen: wake with half your health, a tenth of your coin gone (to a most 50). Returns the coin lost. */
export function fall(state: SimState): number {
  const h = heroOf(state);
  h.deaths++;
  h.hp = Math.ceil(statsOf(state).maxHp / 2);
  const coin = inventoryOf(state).coin ?? 0;
  const lost = Math.min(50, Math.floor(coin * 0.1));
  if (lost) addItem(state, 'coin', -lost);
  return lost;
}
