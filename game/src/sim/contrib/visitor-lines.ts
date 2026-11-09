/**
 * Shared bits for the visitor contribs (road-folk, visitors, legitimacy-voices): lines from
 * data/dialogue/visitors.json, placeholder filling, coin and food in the satchel, and the dawn source that
 * tells the player's town who came and went ("Wren says a pilgrim came in at dawn…"). Pure.
 */
import { trackedTable } from '../data-use-people';
import linesJson from '../../data/dialogue/visitors.json';
import { registerDawnLines } from '../dawn-lines';
import { hasItem, inventoryOf, itemName, removeItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { carrierIn, type Visitor } from '../visitors';
import { townLabel } from './power-page';
import { firstNameOf } from '../names';

type Lines = Record<string, string[]>;
export const VL = trackedTable('dialogue/visitors', linesJson as unknown as {
  reason: Record<string, string>;
  bound: Lines;
  news: Lines;
  answers: Lines;
  townNews: Record<string, string>;
  legitimacy: Lines;
}, ['reason', 'bound', 'news', 'answers', 'townNews', 'legitimacy']);

export type Vars = Record<string, string | number | undefined>;

export const fill = (s: string, v: Vars): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] !== undefined ? String(v[k]) : m));

export function pickLine(arr: string[] | undefined, key: string): string {
  if (!arr?.length) return '';
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length]!;
}

/** A line from one group of visitors.json, picked by key and filled. */
export const line = (group: Lines, key: string, seedKey: string, vars: Vars): string => {
  // A filled-in name may open a sentence ("the Reach Creed saw to that"): capitalise sentence starts.
  return fill(pickLine(group[key], seedKey), vars).replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
};

export const townName = (state: SimState, id: string | undefined): string => (id ? townLabel(state, id) : 'the road');
export const goodName = (id: string | undefined): string => (id ? itemName(id).toLowerCase() : 'goods');

/** Everything a visitor line can name about them. */
export function visitorVars(state: SimState, v: Visitor, extra: Vars = {}): Vars {
  const name = state.people[v.id]?.name ?? v.id;
  return {
    name, first: firstNameOf(name), home: townName(state, v.homeTownId), to: townName(state, v.toTownId ?? v.townId),
    town: townName(state, v.townId), item: goodName(v.item), qty: v.qty, coin: v.coin, ...extra,
  };
}

/** Coin carried (the satchel's stack). */
export const coinHeld = (state: SimState): number => inventoryOf(state).coin ?? 0;
export const payCoin = (state: SimState, n: number): boolean => n <= 0 || removeItem(state, 'coin', n);

export const FOODS = ['bread', 'fish', 'berries', 'grain'] as const;
export const foodHeld = (state: SimState): string | undefined => FOODS.find((f) => hasItem(state, f, 1));

/** Raise a person's flame (helped, fed, blessed). */
export function warm(state: SimState, id: string, by: number): void {
  const p = state.people[id];
  if (p) p.flame = Math.min(100, p.flame + by);
}

/** Chip text within 16 characters, else the fallback. */
export const chip = (text: string, fallback: string): string => (text.length <= 16 ? text : fallback);

const MAX_NEWS = 3;

/** This dawn's visitor news for the player's town, each carried by a named resident. */
export function visitorNewsLines(state: SimState): string[] {
  const town = state.player.townId;
  const news = (state.visitors?.news ?? []).filter((n) => n.day === state.day && n.townId === town);
  const out: string[] = [];
  for (const n of news.slice(0, MAX_NEWS)) {
    const who = carrierIn(state, town, `news:${n.about}`, [n.about]);
    if (who) out.push(fill(n.text, { speaker: state.people[who]?.name ?? who }));
  }
  return out;
}

registerDawnLines('visitors', visitorNewsLines);
