/**
 * Crafting by hand: at a station (a town hearth, a facility's workbench or forge, or the bench in one of
 * your own built workshops), turn carried goods into others by a recipe (craft/recipes). Counts move
 * through goods/inventory; what you make is minted as an item instance with you as its maker (as deed
 * goods are), so a crafted axe given away is known as yours. Pure + deterministic: no Phaser/DOM/RNG.
 */
import { facilityPlaces } from '../economy/facilities';
import { companyOnClaim } from '../economy/workshops';
import { addItem, inventoryOf, itemName, removeItem } from '../goods/inventory';
import { consumeInstance, mintInstance } from '../goods/instances';
import { toolAtHand, toolsText } from '../land-acts';
import type { Target } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import { recipeById, recipeHours, recipesAt, STATIONS, stationForBuilding, stationForFacility, type Recipe, type StationId } from './recipes';
import { noteUse } from '../data-use-world';

export type StationAt = { station: StationId; townId: string; name: string };
export type RecipeView = { recipe: Recipe; ok: boolean; short: string[] };
export type CraftResult = { ok: boolean; line: string; hours?: number };

const amount = (id: string, n: number): string => `${n} ${itemName(id).toLowerCase()}`;
export const goodsText = (rec: Record<string, number>): string => Object.entries(rec).map(([id, n]) => amount(id, n)).join(' and ');

/** The station a thing in the world is, if any (with the town it serves). */
export function stationOf(state: SimState, t: Target): StationAt | null {
  if (t.kind === 'hearth') return { station: 'hearth', townId: t.id, name: STATIONS.hearth.name };
  if (t.kind === 'facility') {
    const f = facilityPlaces(state).find((p) => p.id === t.id);
    const s = f && stationForFacility(f.kind);
    return f && s ? { station: s, townId: f.townIds[0] ?? state.player.townId ?? '', name: `${STATIONS[s].name} at ${f.name}` } : null;
  }
  if (t.kind === 'plot') {
    const c = companyOnClaim(state, t.id);
    const s = c && stationForBuilding(c.kind);
    return c && s ? { station: s, townId: c.townId, name: `${STATIONS[s].name} in ${c.name}` } : null;
  }
  return null;
}

/** What stops a recipe right now: each missing input ("1 more flour") and a missing tool. */
export function shortOf(state: SimState, r: Recipe): string[] {
  const inv = inventoryOf(state);
  const out: string[] = [];
  for (const [id, n] of Object.entries(r.in)) {
    const have = inv[id] ?? 0;
    if (have < n) out.push(`${n - have} more ${itemName(id).toLowerCase()}`);
  }
  if (toolAtHand(state, r.tool) === null) out.push(toolsText(r.tool!));
  return out;
}

/** Every recipe at a station, in data order, with what each is short of. */
export function craftView(state: SimState, station: StationId): RecipeView[] {
  return recipesAt(station).map((recipe) => {
    const short = shortOf(state, recipe);
    return { recipe, ok: short.length === 0, short };
  });
}

/** Make one batch of a recipe at a station: spend the inputs, keep the tool, mint what comes out. */
export function craft(state: SimState, recipeId: string, at: StationAt): CraftResult {
  const r = recipeById(recipeId);
  if (!r) return { ok: false, line: 'You know no way to make that.' };
  if (r.station !== at.station) return { ok: false, line: `That is made at a ${STATIONS[r.station].name.toLowerCase()}, not here.` };
  const short = shortOf(state, r);
  if (short.length) return { ok: false, line: `${r.label} needs ${short.join(' and ')}.` };
  for (const [id, n] of Object.entries(r.in)) {
    removeItem(state, id, n);
    for (let k = 0; k < n; k++) consumeInstance(state, id);
  }
  for (const [id, n] of Object.entries(r.out)) {
    addItem(state, id, n);
    if (id !== 'coin') for (let k = 0; k < n; k++) mintInstance(state, id, state.player.id, at.townId);
  }
  noteUse('recipes', r.id); noteUse('stations', at.station);
  const tool = toolAtHand(state, r.tool);
  if (tool) noteUse('items.use', tool);
  return { ok: true, line: `You work at the ${STATIONS[at.station].name.toLowerCase()}. Made by your own hands: ${goodsText(r.out)}.`, hours: recipeHours(r) };
}

