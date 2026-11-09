/**
 * Building up a yard and making things in it by hand: raise a building (goods from the yard or your
 * satchel, coin from your purse), work a recipe at one of the yard's buildings (output into the yard),
 * and eat a cooked meal. Cooking is crafting at the kitchen; every new dish counts for the Hearth arc.
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import {
  BUILDINGS, BUILDING_BY_ID, RECIPES, RECIPE_BY_ID, goodName, goodRow, recipeEra, recipeHours, stockText,
  type BuildingRow, type RecipeRow,
} from './data';
import { addStock, bump, coinOf, depotAt, eraOf, give, hereOf, shortfall, stockOf, take, townName, worksOf } from './state';
import type { Result } from './types';

export type BuildingView = { row: BuildingRow; built: boolean; locked: boolean; short: string[] };
export type RecipeView = { row: RecipeRow; ok: boolean; locked: boolean; short: string[] };

export function buildingsView(state: SimState, townId: string): BuildingView[] {
  const d = depotAt(state, townId);
  const era = eraOf(state);
  const here = hereOf(state) === townId;
  return BUILDINGS.map((row) => {
    const built = !!d?.buildings.includes(row.id);
    const short = built ? [] : shortfall(state, townId, row.cost, here);
    if (!built && coinOf(state) < row.coin) short.push(`${row.coin - coinOf(state)} more coin`);
    return { row, built, locked: row.era > era, short };
  });
}

export function raise(state: SimState, townId: string, buildingId: string): Result {
  const d = depotAt(state, townId);
  const row = BUILDING_BY_ID.get(buildingId);
  if (!d || !row) return { ok: false, line: 'There is nowhere to build that.' };
  if (d.buildings.includes(row.id)) return { ok: false, line: `The yard already has a ${row.name.toLowerCase()}.` };
  if (row.era > eraOf(state)) return { ok: false, line: `A ${row.name.toLowerCase()} belongs to a later age. Earn renown.` };
  const here = hereOf(state) === townId;
  const short = shortfall(state, townId, row.cost, here);
  if (coinOf(state) < row.coin) short.push(`${row.coin - coinOf(state)} more coin`);
  if (short.length) return { ok: false, line: `A ${row.name.toLowerCase()} needs ${short.join(' and ')}.` };
  take(state, townId, row.cost, here);
  if (row.coin) addItem(state, 'coin', -row.coin);
  d.buildings.push(row.id);
  const w = worksOf(state);
  bump(w, `built_${row.id}`);
  bump(w, 'buildings');
  return { ok: true, line: `A ${row.name.toLowerCase()} goes up in your ${townName(state, townId)} yard.`, hours: 2 };
}

/** Every recipe the yard's buildings know, with what each is short of right now (hand work: satchel counts). */
export function recipesView(state: SimState, townId: string): RecipeView[] {
  const d = depotAt(state, townId);
  if (!d) return [];
  const era = eraOf(state);
  const here = hereOf(state) === townId;
  return RECIPES.filter((r) => d.buildings.includes(r.at)).map((row) => {
    const short = row.in ? shortfall(state, townId, row.in, here) : [];
    if (row.spark && state.player.spark < row.spark + 1) short.push(`${row.spark} spark to spare`);
    const locked = recipeEra(row) > era;
    return { row, ok: !locked && short.length === 0 && here, locked, short };
  });
}

/** Make one batch by hand. You must stand in the town; inputs come from the yard, then your satchel. */
export function make(state: SimState, townId: string, recipeId: string): Result {
  const row = RECIPE_BY_ID.get(recipeId);
  const d = depotAt(state, townId);
  if (!row || !d) return { ok: false, line: 'You know no way to make that here.' };
  if (hereOf(state) !== townId) return { ok: false, line: 'You have to be in the yard to work it by hand. Set a line to it instead.' };
  if (!d.buildings.includes(row.at)) return { ok: false, line: `That is made at a ${BUILDING_BY_ID.get(row.at)?.name.toLowerCase()}.` };
  if (recipeEra(row) > eraOf(state)) return { ok: false, line: 'That belongs to a later age.' };
  const short = row.in ? shortfall(state, townId, row.in, true) : [];
  if (row.spark && state.player.spark < row.spark + 1) short.push(`${row.spark} spark to spare`);
  if (short.length) return { ok: false, line: `${row.label} needs ${short.join(' and ')}.` };
  if (row.in) take(state, townId, row.in, true);
  if (row.spark) state.player.spark -= row.spark;
  give(state, townId, row.out);
  const w = worksOf(state);
  bump(w, 'made');
  if (row.at === 'kitchen') {
    bump(w, 'cooked');
    if (!w.dishes.includes(row.id)) w.dishes.push(row.id);
  }
  for (const id of ['great_engine', 'iron_road', 'long_table']) if (row.out[id]) finishProject(state, id, townId);
  const spent = row.spark ? ` It cost you ${row.spark} spark; the core hums with it.` : '';
  return { ok: true, line: `${row.label}: ${stockText(row.out)} into the yard.${spent}`, hours: recipeHours(row) };
}

/** Eat a cooked meal from the yard you stand in. */
export function eat(state: SimState, townId: string, goodId: string): Result {
  const meal = goodRow(goodId)?.meal;
  if (!meal) return { ok: false, line: 'That is not a meal.' };
  if (hereOf(state) !== townId) return { ok: false, line: 'The meal is in another town.' };
  if ((stockOf(state, townId)[goodId] ?? 0) < 1) return { ok: false, line: `There is no ${goodName(goodId).toLowerCase()} left.` };
  addStock(state, townId, goodId, -1);
  const max = state.player.sparkMax ?? 100;
  state.player.spark = Math.min(max, state.player.spark + meal.spark);
  bump(worksOf(state), 'eaten');
  return { ok: true, line: `You eat the ${goodName(goodId).toLowerCase()}. Warmth comes back (+${meal.spark} spark).` };
}

/** The three great projects, when made, take effect at once (and stay: the project good is spent). */
function finishProject(state: SimState, id: string, townId: string): void {
  const w = worksOf(state);
  addStock(state, townId, id, -1);
  bump(w, id);
  if (id === 'long_table') longTable(state);
}

/** The Long Table: every town eats; despair eases everywhere and your spark grows. */
function longTable(state: SimState): void {
  for (const t of Object.values(state.towns ?? {})) t.despair = Math.max(0, t.despair - 0.2);
  for (const p of Object.values(state.people)) p.flame = Math.min(100, p.flame + 10);
}
