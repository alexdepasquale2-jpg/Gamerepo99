/** Neglect is never a lose state: a cold-handed hoarder run is a legitimate ending (imprint hoard_legacy). */

import type { SimState } from '../types/runtime';
import { ensureHoard, notorietyTable } from './state';

export function detectEnding(state: SimState): 'ash_hoard' | null {
  const legacy = notorietyTable(state)?.hoardLegacy;
  const h = ensureHoard(state);
  return legacy && h.reigniteCount === 0 && h.peakCoin >= legacy.peakCoinMin ? 'ash_hoard' : null;
}
