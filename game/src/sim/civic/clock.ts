/**
 * The clock: every way time passes goes through here (a night's rest is the session's own dusk + dawn;
 * waiting at the hearth, long road stretches and trunk roads call fastForward). The dawn pipeline stays
 * the unit: up to FULL_DAYS days run it whole, one dawn at a time, exactly as resting does. Past that the
 * stretch runs on the LOD day (civic/lod: aggregates per town) and only the last morning is a full dawn,
 * so people wake, speak and the day's flags roll as any morning, while the cost stays flat.
 * Pure over SimState (no Phaser/DOM).
 */
import { advanceToDawn } from '../scenario/scenario-advance';
import { tickPackets } from '../packets';
import { tickLetters } from '../letters-scale';
import { regrowNodes } from '../goods/nodes';
import type { SimState } from '../types/runtime';
import { lodDays, type LodReport } from './lod';

/** Stretches this long or shorter run every dawn in full. */
export const FULL_DAYS = 10;

/** `tellOn` is the morning the stretch's news is told (the next dawn you wake to in that district). */
type ClockState = { news?: LodReport & { tellOn: number; away?: boolean } };
const clockOf = (state: SimState): ClockState => ((state as SimState & { clock?: ClockState }).clock ??= {});

/**
 * The LOD stretch to tell this morning (contrib/clock): a long wait's, or the days a district lived
 * without you (told at your first dawn back). `away` marks the second.
 */
export function lastStretch(state: SimState): (LodReport & { away?: boolean }) | undefined {
  const n = (state as SimState & { clock?: ClockState }).clock?.news;
  return n && n.tellOn === state.day ? n : undefined;
}

/** One whole world day: the dawn pipeline plus what follows each dawn (packets on the road, regrowth). */
export function fullDay(state: SimState): void {
  advanceToDawn(state);
  tickPackets(state);
  regrowNodes(state);
}

/**
 * The player's own clocks that must keep time through a LOD stretch: their mail and packets land on the
 * day they would have, and gathered ground regrows. (Letters ride carried state, so they are theirs.)
 */
function carriedDay(state: SimState): void {
  tickLetters(state);
  tickPackets(state);
  regrowNodes(state);
}

/** Pass `days` whole days. Returns the LOD report when the stretch was long enough to need one. */
export function fastForward(state: SimState, days: number): LodReport | undefined {
  const n = Math.max(0, Math.floor(days));
  if (n <= FULL_DAYS) {
    for (let i = 0; i < n; i++) fullDay(state);
    return undefined;
  }
  const rep = lodDays(state, n - 1, carriedDay);
  clockOf(state).news = { ...rep, tellOn: rep.to + 1 };
  fullDay(state);
  return rep;
}

/**
 * Advance by days, or by hours (hours carry over in the player's flags until they make a day: a shift's
 * hours alone never roll a dawn, a day's worth does). Returns the whole days that passed.
 */
export function advance(state: SimState, by: { days: number } | { hours: number }): number {
  if ('days' in by) {
    const n = Math.max(0, Math.floor(by.days));
    fastForward(state, n);
    return n;
  }
  const total = ((state.flags.clockHours as number | undefined) ?? 0) + Math.max(0, by.hours);
  const n = Math.floor(total / 24);
  state.flags.clockHours = total - n * 24;
  fastForward(state, n);
  return n;
}

/**
 * Days a district lived without you, in one step (thawing a frozen one, or a rebuilt one from its
 * summary's day): the LOD day only, never the full pipeline (the player's clocks already ran where they
 * were). The calendar is the player's and has moved on; the district is run from `since` up to it.
 */
export function catchUpDistrict(state: SimState, since: number): LodReport | undefined {
  const now = state.day, days = now - since;
  if (days <= 0) return undefined;
  state.day = since;
  const rep = lodDays(state, days);
  state.day = now;
  clockOf(state).news = { ...rep, tellOn: now + 1, away: true };
  return rep;
}
