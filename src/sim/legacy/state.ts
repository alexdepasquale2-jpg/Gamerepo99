import legacyJson from '../../data/systems/legacy-world.json';
import type { SimState } from '../types/runtime';
import type { LegacyState, WorldDelta } from './types';

export type LegacyTable = typeof legacyJson;
export const legacyTable = (): LegacyTable => legacyJson;
export const CURRENT_WORLD_VERSION = 1;

export function ensureLegacy(state: SimState): LegacyState {
  return (state.legacy ??= {
    bonds: {},
    methodCounts: {},
    lastMethodDay: {},
    touchedTowns: [],
    growthTowns: [],
    choices: [],
    deltas: [],
    townRep: {},
    graves: [],
    legends: [],
    npcs: {},
    lineage: [],
    lastImprint: null,
    growthSinceSuccession: 0,
  });
}

export const fill = (tpl: string, legacyName: string): string => tpl.replace(/\{legacyName\}/g, () => legacyName);
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'legend';

const SOFT: ReadonlySet<string> = new Set(['doctrine', 'route', 'letter', 'custom']);

/** Append to the bounded delta log; at the cap the oldest soft delta (doctrine/route/letter) goes first, else the oldest. */
export function pushDelta(state: SimState, d: WorldDelta): void {
  const log = ensureLegacy(state).deltas;
  log.push(d);
  const cap = legacyJson.deltaLogCap;
  while (log.length > cap) {
    const i = log.findIndex((x) => SOFT.has(x.t));
    log.splice(i < 0 ? 0 : i, 1);
  }
}
