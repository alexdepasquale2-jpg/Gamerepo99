import legacyJson from '../../data/systems/legacy-world.json';
import type { SimState } from '../types/runtime';
import type { LegacyState } from './types';

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
