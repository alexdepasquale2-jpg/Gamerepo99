/** Thin WorldRenderSnapshot stub — town markers for overworld chips. Pure. */

import { townsFromDump, type TownMarker } from './towns-from-dump';

export type WorldRenderSnapshot = {
  day: number;
  tick: number;
  towns: TownMarker[];
  tiles: unknown[];
  facilities: unknown[];
  mobiles: unknown[];
};

/** Build a minimal snapshot from a session dump text (no Phaser). */
export function getWorldRenderSnapshot(opts: {
  dump: string;
  day?: number;
  tick?: number;
}): WorldRenderSnapshot {
  return {
    day: opts.day ?? 1,
    tick: opts.tick ?? 0,
    towns: townsFromDump(opts.dump),
    tiles: [],
    facilities: [],
    mobiles: [],
  };
}
