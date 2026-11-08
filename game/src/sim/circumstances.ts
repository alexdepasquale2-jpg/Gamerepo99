/**
 * The day's circumstances: the tags a latent Blessing or Burden needs before it can come to pass
 * (data/people/unspoken/classes.json requireTagsAny). Read from what already happened in the world,
 * fresh each dawn, before the unspoken tick (letters-scale merges them with 'letter_arrived'):
 *   quiet_dawn       no happening is under way
 *   town_festival    some town has at least half its people burning (and at least three of them)
 *   caravan_arrive   a wagon is halted at a town
 *   kin_visit        a visitor is staying somewhere (folk on the road, kin from away)
 *   doctrine_sermon  every seventh dawn, the preachers' day
 *   show_up_day      you were with people in some town yesterday or today
 * Pure over SimState.
 */
import type { DataTables } from './load-data';
import type { SimState } from './types/runtime';

export const SERMON_EVERY = 7;

export function dawnCircumstances(state: SimState): string[] {
  const tags: string[] = [];
  if (!state.happenings?.active?.length) tags.push('quiet_dawn');
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  const byTown = new Map<string, { n: number; lit: number }>();
  for (const p of Object.values(state.people)) {
    if (!p.townId || p.tags?.includes('retired')) continue;
    const t = byTown.get(p.townId) ?? { n: 0, lit: 0 };
    t.n += 1;
    if (p.flame >= burnAt) t.lit += 1;
    byTown.set(p.townId, t);
  }
  if ([...byTown.values()].some((t) => t.lit >= 3 && t.lit * 2 >= t.n)) tags.push('town_festival');
  if ((state.caravans ?? []).some((c) => !!c.phase)) tags.push('caravan_arrive');
  if (Object.keys(state.visitors?.list ?? {}).length) tags.push('kin_visit');
  if (state.day > 0 && state.day % SERMON_EVERY === 0) tags.push('doctrine_sermon');
  const touched = (state.flags.lastTouchDayByTown ?? {}) as Record<string, number>;
  if (Object.values(touched).some((d) => d >= state.day - 1)) tags.push('show_up_day');
  return tags;
}
