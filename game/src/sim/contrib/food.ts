/**
 * One food stock (F6), told through people. Each dawn the 'late' tick notes whether a town went hungry,
 * is running short (under COVER_DAYS of food in the ledger) or is fed again; the dawn lines then put it in
 * a resident's mouth, in the town you stand in and your home town: "Marta says the larders are bare…".
 * Lines are the fallbacks in data/dialogue/surface-fallbacks.json (food_starve, food_short, food_eased).
 */
import fallbacks from '../../data/dialogue/surface-fallbacks.json';
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { FOOD_RES, foodCover, foodShortToday, isShortOf } from '../economy/food-stock';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

type Word = 'starve' | 'short' | 'ok';
type Key = 'food_starve' | 'food_short' | 'food_eased';
/** Kept in state.flags.foodWord: this dawn's word per town, what is worth saying, and when "short" was last said. */
type FoodWord = { day: number; now: Record<string, Word>; say: Record<string, Key>; saidShort: Record<string, number> };

/** While a town stays short, it is said again after this many dawns. */
const SHORT_REPEAT_DAYS = 3;
const LINES = (fallbacks as { lines: Record<string, string[]> }).lines;
const DEFAULT: Record<string, string> = {
  food_starve: 'the larders are bare, and folk went to bed hungry.',
  food_short: "there's only {days} of food left in the stores.",
  food_eased: 'the larders are filling again. Nobody went hungry last night.',
};

const townLabel = (id: string): string => id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const wordOf = (state: SimState): FoodWord | undefined => state.flags.foodWord as FoodWord | undefined;

function tickFoodWord(state: SimState): void {
  const prev = wordOf(state);
  const now: Record<string, Word> = {};
  const say: Record<string, Key> = {};
  const saidShort = { ...prev?.saidShort };
  const peopled = new Set(Object.values(state.people).map((p) => p.townId).filter((t): t is string => !!t));
  for (const townId of [...peopled].sort()) {
    if (!state.towns?.[townId]) continue;
    // Hungry: households went without at this dawn's meal (economy-lod adds the despair at the next dawn).
    const w = (now[townId] = foodShortToday(state, townId) > 1e-9 ? 'starve' : isShortOf(state, townId, FOOD_RES) ? 'short' : 'ok');
    const was = prev?.now[townId];
    if (w === 'starve') say[townId] = 'food_starve';
    else if (w === 'short' && (was !== 'short' || state.day - (saidShort[townId] ?? -99) >= SHORT_REPEAT_DAYS)) { say[townId] = 'food_short'; saidShort[townId] = state.day; }
    else if (w === 'ok' && (was === 'starve' || was === 'short')) say[townId] = 'food_eased';
  }
  state.flags.foodWord = { day: state.day, now, say, saidShort } satisfies FoodWord;
}

/** Who carries the word: the hungriest-looking resident when food is short, the brightest when it eases. */
function speaker(state: SimState, townId: string, word: Word): string | undefined {
  const folk = Object.entries(state.people).filter(([, p]) => p.townId === townId).sort(([a, p], [b, q]) => (word === 'ok' ? q.flame - p.flame : p.flame - q.flame) || a.localeCompare(b));
  return folk[0]?.[1].name;
}

function line(state: SimState, key: string, townId: string, slots: Record<string, string>): string {
  const pool = LINES[key]?.length ? LINES[key]! : [DEFAULT[key]!];
  const text = pool[deriveRng(state.seed, key, state.day, townId).int(0, pool.length)]!;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? '');
}

/** This dawn's food news, for where you stand and then your home town. */
export function foodDawnLines(state: SimState): string[] {
  const w = wordOf(state);
  if (!w || w.day !== state.day) return [];
  const here = state.player.townId;
  const towns = [here, state.player.homeTownId].filter((t, i, a): t is string => !!t && a.indexOf(t) === i);
  const out: string[] = [];
  for (const townId of towns) {
    const now = w.now[townId], key = w.say[townId];
    if (!now || !key) continue;
    const name = speaker(state, townId, now);
    const days = Math.max(0, Math.floor(foodCover(state, townId)));
    const said = line(state, key, townId, { days: days === 1 ? 'a day' : days === 0 ? 'less than a day' : `${days} days` });
    const away = townId !== here ? `Word from ${townLabel(townId)}: ` : '';
    out.push(name ? `${away}${name.split(' ')[0]} says ${said}` : `${away}${said.replace(/^./, (c) => c.toUpperCase())}`);
  }
  return out;
}

registerDawnTick('late', 'food-word', tickFoodWord);
registerDawnLines('food', foodDawnLines);
