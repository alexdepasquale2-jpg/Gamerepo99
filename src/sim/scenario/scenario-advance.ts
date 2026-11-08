/** Advance play clocks (dusk/dawn/day/ticks) and fire dusk personal-cost hooks. */

import { tickDoctrines } from '../doctrine-tick';
import { tickLetters } from '../letters-scale';
import { tickHoardDawn } from '../hoard';
import { tickLegacyDawn } from '../legacy/npc';
import { tickPatronDawn } from '../patrons';
import { tickHappenings } from '../happenings';
import { tickEconomyLod } from '../economy/economy-lod';
import { tickVillageEconomy } from '../economy/village-economy';
import { tickLogistics } from '../economy/logistics';
import { tickBuildPlans } from '../economy/build-plans';
import { tickCompanies } from '../economy/companies';
import { tickHouseholds } from '../economy/households';
import { tickBorders } from '../economy/borders';
import { tickPolity } from '../economy/polity';
import { tickUnspokenDawn } from '../social/unspoken';
import { runHooks } from '../hooks';
import { runDawnSlot } from '../dawn-ticks';
import { rollDayFlags, setBodyFlags } from '../embodiment';
import type { DataTables } from '../load-data';
import { pushJuice } from '../packets';
import type { Rng } from '../rng';
import type { SimState } from '../types/runtime';

export type AdvanceTarget = 'dusk' | 'dawn' | 'day' | { ticks: number };

export function parseAdvanceAction(actionId: string): AdvanceTarget | null {
  if (actionId === 'advance:dusk') return 'dusk';
  if (actionId === 'advance:dawn') return 'dawn';
  if (actionId === 'advance:day') return 'day';
  if (actionId.startsWith('advance:ticks:')) {
    const n = Number(actionId.slice('advance:ticks:'.length));
    if (!Number.isFinite(n) || n < 0) return null;
    return { ticks: Math.floor(n) };
  }
  return null;
}

function anyBurningAdjacent(state: SimState): boolean {
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  const burning = Object.values(state.people).filter((p) => p.flame >= burnAt);
  if (burning.length === 0) return false;
  const placed = burning.filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
  if (placed.length === 0) return false;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (Math.abs((a.x as number) - (b.x as number)) + Math.abs((a.y as number) - (b.y as number)) <= 3) {
        return true;
      }
    }
  }
  return false;
}

function sparkMaxFor(state: SimState, data: DataTables | undefined): number {
  if (typeof state.player.sparkMax === 'number') return state.player.sparkMax;
  const defaults = (data?.player as { defaults?: { sparkMax?: number } } | undefined)?.defaults;
  return typeof defaults?.sparkMax === 'number' ? defaults.sparkMax : 100;
}

/** Clamp player spark into [0-or-current-floor, sparkMax]. Recovery may overshoot. */
export function clampPlayerSpark(state: SimState): void {
  const data = state.data as DataTables | undefined;
  const max = sparkMaxFor(state, data);
  if (state.player.spark > max) state.player.spark = max;
}

/**
 * The evening's personal costs (loneliness, brood strain, an empty row…) without advancing the calendar.
 * Returns false when the state has no data/rng to run hooks with.
 */
export function runDuskHooks(state: SimState): boolean {
  state.flags.noBurningAdjacent = !anyBurningAdjacent(state);
  setBodyFlags(state);
  const data = state.data as DataTables | undefined;
  const rng = state.rng as Rng | undefined;
  if (!data || !rng) return false;
  const sparkBefore = state.player.spark;
  runHooks(state, 'dusk', { data, rng });
  if (state.player.spark < sparkBefore) {
    pushJuice(state, 'spark.spend', {
      amount: sparkBefore - state.player.spark,
      reason: 'dusk',
    });
  }
  return true;
}

/** Advance one dusk beat: personal-cost hooks + optional spark.spend juice. */
export function advanceToDusk(state: SimState): void {
  if (!runDuskHooks(state)) return;
  state.day += 1;
  state.flags.kindSuccessToday = false;
}

/** Advance one dawn: recovery hooks + economy LOD + clamp spark to sparkMax. */
export function advanceToDawn(state: SimState): void {
  state.day += 1;
  state.flags.kindSuccessToday = false;
  rollDayFlags(state);
  const data = state.data as DataTables | undefined;
  const rng = state.rng as Rng | undefined;
  if (data && rng) {
    runHooks(state, 'dawn', { data, rng });
  }
  // New systems register into a slot (src/sim/dawn-ticks.ts) instead of adding a line here.
  runDawnSlot(state, 'season');
  tickEconomyLod(state);
  tickVillageEconomy(state);
  tickBuildPlans(state);
  tickCompanies(state);
  tickHouseholds(state);
  runDawnSlot(state, 'people');
  runDawnSlot(state, 'relations');
  tickBorders(state);
  tickPolity(state);
  tickLogistics(state);
  runDawnSlot(state, 'roads');
  runDawnSlot(state, 'prices');
  if (state.towns) tickDoctrines(state);
  tickLetters(state);
  tickUnspokenDawn(state);
  tickHoardDawn(state);
  tickLegacyDawn(state);
  tickPatronDawn(state);
  tickHappenings(state);
  runDawnSlot(state, 'late');
  clampPlayerSpark(state);
}

export function advanceDays(state: SimState, days: number): void {
  for (let i = 0; i < days; i++) advanceToDawn(state);
}
