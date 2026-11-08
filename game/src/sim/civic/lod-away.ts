/**
 * A district you are not in, as the realm map knows it: only its summary (sim/realm). On leaving, the
 * district's LOD rates are measured once (its people's hazard of death, its households' chance of a
 * child, what its towns make against what they eat); each late dawn the away-tick (sim/realm-away)
 * drifts the summary by them, and despair by the dawn's neglect and flame relief. When you come back the
 * district itself is run on the LOD day from the summary's lastTick (civic/clock catchUpDistrict), so the
 * map and the place agree and no day is lived twice. Pure + deterministic.
 */
import type { DataTables } from '../load-data';
import { driftDespair, type DistrictSummary } from '../realm';
import { birthMul } from '../economy/polity';
import { KIN, security } from '../economy/households';
import { deathless, hazard, LIFE } from '../economy/mortality';
import { districtFood, foodPerDay } from './lod';
import type { SimState } from '../types/runtime';

/** Per day, the whole district: people gained (births) and lost (deaths), and food made less food eaten. */
export type AwayRates = { born: number; died: number; food: number; spoil: number };
/** A summary that knows how its district moves (summaries from before this have none, and only drift despair). */
export type AwaySummary = DistrictSummary & { food?: number; rates?: AwayRates };

/** The district's rates as it stands now (expected values; nothing is rolled). */
export function awayRates(state: SimState): AwayRates {
  let died = 0;
  for (const p of Object.values(state.people)) if (!deathless(state, p)) died += hazard(p.age ?? LIFE.adultAge) / LIFE.yearDays;
  let born = 0;
  for (const h of state.kin?.households ?? []) {
    if (h.adults.length < 2 || h.kids.length >= KIN.maxKids || security(state, h) < KIN.birthSecurity) continue;
    born += KIN.birthChance * birthMul(state, h.townId);
  }
  const data = state.data as DataTables | undefined;
  const spoil = data?.economyResources?.find((r) => r.id === (data.dawnStock?.foodResourceId ?? 'food_grain'))?.spoilPerDawn ?? 0;
  return { born, died, food: foodPerDay(state), spoil };
}

/** What a district carries away into its summary: its store of food and its rates. */
export const awayParts = (state: SimState): Pick<AwaySummary, 'food' | 'rates'> => ({ food: districtFood(state), rates: awayRates(state) });

/** Drift an away summary `days`: despair by neglect and flame, people and food by the rates it left with. */
export function driftSummary(state: SimState, s: AwaySummary, days: number): void {
  if (days <= 0) return;
  s.despair = driftDespair(state, s.despair, s.lit, days);
  const r = s.rates;
  if (!r) return;
  // Children come of age long after they are born; over a stretch, births stand in for them.
  s.people = Math.max(0, s.people + (r.born - r.died) * days);
  if (typeof s.food === 'number') {
    // Food spoils while it is made and eaten: the closed form of food' = food * (1 - spoil) + net.
    const keep = (1 - r.spoil) ** days;
    s.food = Math.max(0, s.food * keep + (r.spoil > 0 ? (r.food * (1 - keep)) / r.spoil : r.food * days));
  }
}
