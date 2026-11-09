/**
 * Gear: rolled loot (a base fit for the item level, a rarity by weight, that many affixes scaled by the
 * level, and a name), the bag, equipping (the old piece goes to the bag), salvaging for coin and ember
 * shards, and describing a piece for the sheet. Rolls are seeded from the save and a counter, so the same
 * world drops the same things. Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import { deriveRng, type Rng } from '../rng';
import type { SimState } from '../types/runtime';
import { AFFIXES, BASES, GEAR_NAMES, RARITIES, baseRow, rarityRow } from './data';
import { heroOf, levelScale } from './hero';
import type { GearItem, Slot } from './types';

export const BAG_MAX = 24;
const RARITY_ORDER = RARITIES.map((r) => r.id);

function pickWeighted<T>(rng: Rng, xs: T[], w: (x: T) => number): T {
  const total = xs.reduce((n, x) => n + w(x), 0);
  let r = rng.next() * total;
  for (const x of xs) { r -= w(x); if (r <= 0) return x; }
  return xs[xs.length - 1]!;
}

/** Roll a piece of gear at an item level; `minRarity` floors it (bosses and lair chests drop rare or better). */
export function rollGear(state: SimState, level: number, minRarity = 'common', luck = 0): GearItem {
  const h = heroOf(state);
  const rng = deriveRng(state.seed, 'loot', h.rolls++);
  const bases = BASES.filter((b) => b.level <= level);
  const base = bases[rng.int(0, bases.length)]!;
  const floor = RARITY_ORDER.indexOf(minRarity);
  const rarity = pickWeighted(rng, RARITIES.filter((r) => RARITY_ORDER.indexOf(r.id) >= floor), (r) => r.weight * (RARITY_ORDER.indexOf(r.id) > 1 ? 1 + luck : 1));
  const pool = AFFIXES.filter((a) => a.slots.includes(base.slot));
  const affixes: GearItem['affixes'] = [];
  for (let i = 0; i < rarity.affixes && pool.length; i++) {
    const a = pool.splice(rng.int(0, pool.length), 1)[0]!;
    const raw = (a.range[0] + rng.next() * (a.range[1] - a.range[0])) * levelScale(level);
    affixes.push({ stat: a.stat, value: a.range[1] < 2 ? Math.round(raw * 10) / 10 : Math.round(raw) });
  }
  const pre = GEAR_NAMES.prefix[rng.int(0, GEAR_NAMES.prefix.length)]!;
  const suf = GEAR_NAMES.suffix[rng.int(0, GEAR_NAMES.suffix.length)]!;
  const name = rarity.affixes === 0 ? base.name : rarity.affixes === 1 ? `${pre} ${base.name.toLowerCase()}` : `${pre} ${base.name.toLowerCase()} ${suf}`;
  return { id: `g${h.rolls}`, base: base.id, rarity: rarity.id, level, name, affixes };
}

/** Put a piece in the bag; false (and salvaged for coin) when the bag is full. */
export function stash(state: SimState, g: GearItem): boolean {
  const h = heroOf(state);
  if (h.bag.length >= BAG_MAX) { addItem(state, 'coin', valueOf(g)); return false; }
  h.bag.push(g);
  return true;
}

export const slotOf = (g: GearItem): Slot => baseRow(g.base)?.slot ?? 'charm';
export const valueOf = (g: GearItem): number => Math.round((2 + g.level) * (1 + RARITY_ORDER.indexOf(g.rarity)) * 1.5);

export function equip(state: SimState, gearId: string): { ok: boolean; line: string } {
  const h = heroOf(state);
  const i = h.bag.findIndex((g) => g.id === gearId);
  if (i < 0) return { ok: false, line: 'That is not in your bag.' };
  const g = h.bag.splice(i, 1)[0]!;
  const slot = slotOf(g);
  const old = h.gear[slot];
  h.gear[slot] = g;
  if (old) h.bag.splice(i, 0, old);
  return { ok: true, line: `You take up the ${g.name.toLowerCase()}.` };
}

export function salvage(state: SimState, gearId: string): { ok: boolean; line: string } {
  const h = heroOf(state);
  const i = h.bag.findIndex((g) => g.id === gearId);
  if (i < 0) return { ok: false, line: 'That is not in your bag.' };
  const g = h.bag.splice(i, 1)[0]!;
  const coin = valueOf(g);
  addItem(state, 'coin', coin);
  const shards = Math.max(0, RARITY_ORDER.indexOf(g.rarity) - 1);
  if (shards) addItem(state, 'ember_shard', shards);
  return { ok: true, line: `You break down the ${g.name.toLowerCase()}: ${coin} coin${shards ? ` and ${shards} ember shard${shards === 1 ? '' : 's'}` : ''}.` };
}

const STAT_NAME = new Map(AFFIXES.map((a) => [a.stat, a.name]));
/** One line per number a piece gives, for the sheet. */
export function describe(g: GearItem): string[] {
  const b = baseRow(g.base);
  const out: string[] = [];
  const s = levelScale(g.level);
  if (b?.dmg) out.push(`${Math.round(b.dmg[0] * s)}–${Math.round(b.dmg[1] * s)} damage · ${b.rate} a second · ${b.arc ? `${b.reach}px reach` : `shoots ${b.reach}px`}`);
  if (b?.armor) out.push(`${Math.round(b.armor * s)} armour${b.speed && b.speed < 1 ? ` · ${Math.round((1 - b.speed) * 100)}% slower` : ''}`);
  if (b?.sparkRegen) out.push(`+${b.sparkRegen} spark a second`);
  for (const a of g.affixes) {
    const name = STAT_NAME.get(a.stat) ?? a.stat;
    out.push(name.startsWith('%') ? `+${a.value}${name}` : `+${a.value} ${name}`);
  }
  return out;
}
export const rarityColor = (g: GearItem): string => rarityRow(g.rarity).color;
