/** Neglect is never a lose state: a cold-handed hoarder run is a legitimate ending (imprint hoard_legacy). */

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
