/** Switch every terrain query (collision, render, nodes, plots, map) to the ladder. */
import { setTerrainMode, type TerrainMode } from '../terrain';
import { createLadder, type Ladder } from './refine';

const ladders = new Map<number, Ladder>();
export function ladderFor(seed: number): Ladder {
  let l = ladders.get(seed);
  if (!l) { l = createLadder(seed); ladders.set(seed, l); }
  return l;
}

export function useTerrain(mode: TerrainMode): void {
  setTerrainMode(mode, (seed, q, r) => ladderFor(seed).tileArea(q, r));
}
