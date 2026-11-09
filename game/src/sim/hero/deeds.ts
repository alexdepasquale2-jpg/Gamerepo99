/**
 * What a kill does: experience (and levels), coin and goods into your satchel, sometimes gear into your
 * bag, and the mark it leaves on the world, by family:
 *   despair  the nearest town's despair eases (a colossus lifts a great deal of it)
 *   bandit   the roads are safer for ten days: convoys are raided less (works/logistics reads banditCalm)
 *   rival    that town's defence falls before your band's battle (works/war reads weakenedMul)
 *   beast    hides and meat
 * Clearing a wild cell or a lair is noted (lairs pay a chest). Kills count for the Works' Valor arc.
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { bump, townName, worksOf } from '../works/state';
import { foeRow } from './data';
import { stash, rollGear } from './gear';
import { gainXp, heroNews, heroOf } from './hero';
import { scaled } from './spawns';
import type { GearItem } from './types';

export type KillContext = { nearTown?: string; rivalTown?: string };
export type Spoils = { xp: number; coin: number; items: Record<string, number>; gear?: GearItem; levels: number; lines: string[] };

export function onKill(state: SimState, foeId: string, level: number, c: KillContext = {}): Spoils {
  const row = foeRow(foeId);
  const h = heroOf(state);
  const out: Spoils = { xp: 0, coin: 0, items: {}, levels: 0, lines: [] };
  if (!row) return out;
  const total = Object.values(h.kills).reduce((a, b) => a + b, 0);
  const rng = deriveRng(state.seed, 'drop', state.day, total, foeId);
  h.kills[row.family] = (h.kills[row.family] ?? 0) + 1;
  h.slain[row.id] = (h.slain[row.id] ?? 0) + 1;
  const w = worksOf(state);
  bump(w, 'slain');
  if (row.boss) bump(w, `boss_${row.id}`);

  out.xp = scaled(row, level).xp;
  out.levels = gainXp(state, out.xp);
  if (out.levels) {
    out.lines.push(`You reach level ${h.level}.`);
    w.stats.hero_level = Math.max(w.stats.hero_level ?? 0, h.level);
  }
  const [lo, hi] = row.drops.coin;
  out.coin = hi > 0 ? Math.round((lo + rng.next() * (hi - lo)) * (1 + (level - 1) * 0.1)) : 0;
  if (out.coin) addItem(state, 'coin', out.coin);
  for (const d of row.drops.items) if (rng.next() < d.chance) { addItem(state, d.id, d.n); out.items[d.id] = (out.items[d.id] ?? 0) + d.n; }
  if (rng.next() < row.drops.gear) {
    const g = rollGear(state, level, row.boss ? 'rare' : 'common');
    out.gear = g;
    if (!stash(state, g)) out.lines.push('Your bag is full: you sell it on the spot.');
  }

  const t = c.nearTown ? state.towns?.[c.nearTown] : undefined;
  if (row.family === 'despair' && t) t.despair = Math.max(0, t.despair - (row.boss ? 0.08 : 0.004));
  if (row.family === 'bandit') { h.banditDays.push(state.day); h.banditDays = h.banditDays.filter((d) => state.day - d < 10).slice(-40); }
  if (row.family === 'rival' && c.rivalTown) h.weakened[c.rivalTown] = (h.weakened[c.rivalTown] ?? 0) + (row.boss ? 4 : 1);
  if (row.boss) heroNews(state, `You brought down ${row.name.startsWith('Old') ? row.name : `the ${row.name.toLowerCase()}`}${c.nearTown ? ` near ${townName(state, c.nearTown)}` : ''}.`, c.nearTown);
  return out;
}

/** A wild cell's pack is all dead: none there again today. */
export function clearCell(state: SimState, key: string): void {
  const h = heroOf(state);
  h.cleared[key] = state.day;
  // Keep only today's and yesterday's.
  for (const [k, d] of Object.entries(h.cleared)) if (state.day - d > 1) delete h.cleared[k];
}

/** A lair is cleared: its chest pays coin and a rare-or-better piece; it lies quiet for a while. */
export function clearLair(state: SimState, id: string, name: string, level: number, nearTown?: string): { coin: number; gear: GearItem } {
  const h = heroOf(state);
  h.lairs[id] = state.day;
  bump(worksOf(state), 'lairs');
  const coin = 25 + level * 6;
  addItem(state, 'coin', coin);
  const gear = rollGear(state, level + 1, 'rare', 1);
  stash(state, gear);
  heroNews(state, `The ${name.toLowerCase()}${nearTown ? ` near ${townName(state, nearTown)}` : ''} is cleared.`, nearTown);
  return { coin, gear };
}

/** 0.3..1: how much raiders still trouble the roads (bandits slain in the last ten days calm them). */
export function banditCalm(state: SimState): number {
  const h = (state as SimState & { hero?: { banditDays: number[] } }).hero;
  const n = (h?.banditDays ?? []).filter((d) => state.day - d < 10).length;
  return Math.max(0.3, 1 - n * 0.04);
}
/** 0.5..1: a town's defence after the soldiers you cut down (reset by its next battle). */
export function weakenedMul(state: SimState, townId: string): number {
  const h = (state as SimState & { hero?: { weakened: Record<string, number> } }).hero;
  return Math.max(0.5, 1 - (h?.weakened[townId] ?? 0) * 0.06);
}
export function resetWeakened(state: SimState, townId: string): void {
  const h = (state as SimState & { hero?: { weakened: Record<string, number> } }).hero;
  if (h) delete h.weakened[townId];
}
