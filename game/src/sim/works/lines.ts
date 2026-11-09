/**
 * Manufacturing lines: set a yard building to one of its recipes, take on townsfolk to work it, and every
 * dawn it makes batches on its own from the yard's stock (no satchel). Each hand makes one batch; the
 * line's level caps the hands; a fed crew (one ration each from the yard) makes half again; the Great
 * Engine adds one batch to every line. Hands earn a wage each dawn from your purse; unpaid, they stand idle.
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { BUILDING_BY_ID, RECIPE_BY_ID, TUNING, goodName, isRation, recipeEra } from './data';
import { addStock, bump, coinOf, depotAt, eraOf, freeHands, give, nextId, news, personFirst, shortfall, stockOf, take, townName, worksIfAny, worksOf } from './state';
import type { Line, Result } from './types';

export const linesIn = (state: SimState, townId: string): Line[] => (worksIfAny(state)?.lines ?? []).filter((l) => l.townId === townId);
export const lineCap = (level: number): number => TUNING.lineLevelCap[level] ?? 2;

/** Line slots a building has left in a yard. */
export function slotsLeft(state: SimState, townId: string, buildingId: string): number {
  const used = linesIn(state, townId).filter((l) => RECIPE_BY_ID.get(l.recipeId)?.at === buildingId).length;
  return (BUILDING_BY_ID.get(buildingId)?.lines ?? 0) - used;
}

/** Recipes a line could be set to in this yard (built buildings, this Era, not hand-only, a free slot). */
export function lineChoices(state: SimState, townId: string): string[] {
  const d = depotAt(state, townId);
  if (!d) return [];
  const era = eraOf(state);
  return [...RECIPE_BY_ID.values()].filter((r) => d.buildings.includes(r.at) && r.line !== false && recipeEra(r) <= era && slotsLeft(state, townId, r.at) > 0).map((r) => r.id);
}

export function startLine(state: SimState, townId: string, recipeId: string): Result & { lineId?: string } {
  const r = RECIPE_BY_ID.get(recipeId);
  if (!r || !lineChoices(state, townId).includes(recipeId)) return { ok: false, line: 'There is no free place in the yard to set that line.' };
  const w = worksOf(state);
  const line: Line = { id: nextId(w, 'line'), townId, recipeId, workers: [], level: 1, on: true, fed: false, made: 0, status: 'no hands' };
  w.lines.push(line);
  return { ok: true, line: `You chalk out a line at the ${BUILDING_BY_ID.get(r.at)?.name.toLowerCase()}: ${r.label.toLowerCase()}. It needs hands.`, lineId: line.id };
}

export const lineById = (state: SimState, id: string): Line | undefined => worksIfAny(state)?.lines.find((l) => l.id === id);

export function hireHand(state: SimState, lineId: string, personId?: string): Result {
  const l = lineById(state, lineId);
  if (!l) return { ok: false, line: 'No such line.' };
  if (l.workers.length >= lineCap(l.level)) return { ok: false, line: 'The line has all the hands it can use. Improve it for more.' };
  const pick = personId ?? freeHands(state, l.townId)[0];
  if (!pick || !freeHands(state, l.townId).includes(pick)) return { ok: false, line: `Nobody in ${townName(state, l.townId)} is free to take the work.` };
  l.workers.push(pick);
  return { ok: true, line: `${personFirst(state, pick)} takes the work (${TUNING.wage} coin a dawn).` };
}
export function dropHand(state: SimState, lineId: string): Result {
  const l = lineById(state, lineId);
  const p = l?.workers.pop();
  return p ? { ok: true, line: `${personFirst(state, p)} goes back to their own work.` } : { ok: false, line: 'Nobody works that line.' };
}
export function upgradeLine(state: SimState, lineId: string): Result {
  const l = lineById(state, lineId);
  if (!l) return { ok: false, line: 'No such line.' };
  const cost = TUNING.lineUpgrade[l.level];
  if (!cost) return { ok: false, line: 'The line is as good as it gets.' };
  const short = shortfall(state, l.townId, cost, state.player.townId === l.townId);
  if (short.length) return { ok: false, line: `Improving it needs ${short.join(' and ')}.` };
  take(state, l.townId, cost, state.player.townId === l.townId);
  l.level++;
  return { ok: true, line: `The line is improved: room for ${lineCap(l.level)} hands.` };
}
export function toggleLine(state: SimState, lineId: string, what: 'on' | 'fed'): Result {
  const l = lineById(state, lineId);
  if (!l) return { ok: false, line: 'No such line.' };
  l[what] = !l[what];
  return { ok: true, line: what === 'on' ? (l.on ? 'The line starts up.' : 'The line stops.') : (l.fed ? 'The crew will be fed from the yard.' : 'The crew feeds itself.') };
}
export function scrapLine(state: SimState, lineId: string): Result {
  const w = worksOf(state);
  const i = w.lines.findIndex((l) => l.id === lineId);
  if (i < 0) return { ok: false, line: 'No such line.' };
  w.lines.splice(i, 1);
  return { ok: true, line: 'The line is taken down; its hands go home.' };
}

/** Take one ration-worthy food from a yard (rations first). */
export function eatRation(state: SimState, townId: string): boolean {
  const s = stockOf(state, townId);
  const id = ['ration', 'hardtack', 'porridge', 'stew', 'bread', 'fish', 'berries'].find((k) => (s[k] ?? 0) > 0 && isRation(k));
  if (!id) return false;
  addStock(state, townId, id, -1);
  return true;
}

/** Dawn: pay the hands, feed them, and run every line. */
export function tickLines(state: SimState): void {
  const w = worksIfAny(state);
  if (!w) return;
  const engine = w.boons.includes('industry') ? 1 : 0;
  for (const l of w.lines) {
    const r = RECIPE_BY_ID.get(l.recipeId);
    if (!r || !depotAt(state, l.townId)) continue;
    if (!l.on) { l.status = 'stopped'; continue; }
    if (!l.workers.length) { l.status = 'no hands'; continue; }
    const wages = l.workers.length * TUNING.wage;
    if (coinOf(state) < wages) {
      l.status = 'unpaid';
      news(state, `${personFirst(state, l.workers[0]!)} says nobody on the ${r.label.toLowerCase()} line was paid, so nobody worked.`, l.workers[0], l.townId);
      continue;
    }
    addItem(state, 'coin', -wages);
    let batches = l.workers.length;
    if (l.fed) {
      let fed = 0;
      for (let i = 0; i < l.workers.length; i++) if (eatRation(state, l.townId)) fed++;
      batches += Math.floor(fed * TUNING.fedBonus + 0.5);
    }
    batches += engine;
    let ran = 0;
    for (; ran < batches; ran++) {
      if (r.in && !take(state, l.townId, r.in, false)) break;
      give(state, l.townId, r.out);
    }
    if (!ran) {
      l.status = `short of ${shortfall(state, l.townId, r.in ?? {}, false).join(', ') || 'inputs'}`;
      continue;
    }
    l.status = '';
    const made = Object.values(r.out).reduce((a, b) => a + b, 0) * ran;
    l.made += made;
    bump(w, 'produced', made);
  }
}

/** One dawn line about the lines (the best one), spoken by a hand on it. */
export function lineNews(state: SimState): void {
  const w = worksIfAny(state);
  const best = (w?.lines ?? []).filter((l) => !l.status && l.workers.length).sort((a, b) => b.made - a.made)[0];
  if (!best) return;
  const r = RECIPE_BY_ID.get(best.recipeId)!;
  if (state.day % 3 !== 0) return;
  news(state, `${personFirst(state, best.workers[0]!)} says the ${goodName(Object.keys(r.out)[0]!).toLowerCase()} line has made ${best.made} so far. Steady work.`, best.workers[0], best.townId);
}

/** How many crew or soldier meals a yard holds right now. */
export function rationsIn(state: SimState, townId: string): number {
  return Object.entries(stockOf(state, townId)).filter(([id]) => isRation(id)).reduce((n, [, q]) => n + q, 0);
}
