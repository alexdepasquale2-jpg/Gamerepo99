/** Neglect is never a lose state: a cold-handed hoarder run is a legitimate ending (imprint hoard_legacy). */

import { pushJuice } from '../packets';
import type { SimState } from '../types/runtime';
import { ensureHoard, notorietyTable } from './state';

export function detectEnding(state: SimState): 'ash_hoard' | null {
  const legacy = notorietyTable(state)?.hoardLegacy;
  const h = ensureHoard(state);
  if (!legacy || h.reigniteCount !== 0 || h.peakCoin < legacy.peakCoinMin) return null;
  // A real hoarder keeps coin in stashes; carried coin alone (kind favors pay it too) is not a hoard.
  const stashed = Object.values(h.stash).reduce((a, s) => a + s.coin, 0);
  return stashed > 0 ? 'ash_hoard' : null;
}

/** Set aside this life ("Carry on") — a later life (an heir) can reach it again. */
const dismissedThisLife = (state: SimState): boolean => {
  const day = ensureHoard(state).ending?.dismissedDay;
  return day !== undefined && day >= Number(state.flags.lifeStartDay ?? 0);
};

/**
 * Dawn: the ending is offered once it has held for hoardLegacy.offerAfterDawns dawns in a row,
 * the run has not already ended, and it was not set aside this life. Never a fail state.
 */
export function tickEndingDawn(state: SimState): void {
  const h = ensureHoard(state);
  const e = (h.ending ??= { dawns: 0 });
  if (detectEnding(state) !== 'ash_hoard') {
    e.dawns = 0;
    e.open = false;
    return;
  }
  e.dawns += 1;
  if (e.open || state.ended || dismissedThisLife(state)) return;
  if (e.dawns < (notorietyTable(state)?.hoardLegacy.offerAfterDawns ?? 1)) return;
  e.open = true;
  pushJuice(state, 'hoard.ending_open', { ending: 'ash_hoard', dawns: e.dawns });
}

/** True while the hoard ending is waiting for the player's answer. */
export function hoardEndingOpen(state: SimState): boolean {
  return !!ensureHoard(state).ending?.open && !state.ended && detectEnding(state) === 'ash_hoard';
}
