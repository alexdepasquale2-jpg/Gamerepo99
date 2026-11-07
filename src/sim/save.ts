import type { HoardState } from './hoard/state';
import type { LegacyState, ProtagonistImprint } from './legacy/types';
import type { UnspokenState } from './social/unspoken-types';

/** Pure save blob helpers — no DOM I/O (persistence adapter lives in ui/). */

export type SaveBlob = {
  version: 1;
  seed: number;
  tick: number;
  npcs: Array<{ id: string; x: number; y: number }>;
  /** Social graph 06: Blessings and Burdens instances + tuning. */
  unspoken?: UnspokenState;
  /** Hoarder path: carried coin + hoard state (notoriety, stashes, peakCoin, reigniteCount). */
  coin?: number;
  hoard?: HoardState;
  /** Legacy: reserved protagonist imprint + bond/grave/lineage state (M5 Task C). */
  imprint?: ProtagonistImprint | null;
  legacy?: LegacyState;
};

export function serializeSave(blob: SaveBlob): string {
  return JSON.stringify(blob);
}

export function parseSave(raw: string): SaveBlob | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveBlob;
  } catch {
    return null;
  }
}
