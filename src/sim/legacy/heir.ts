/** Heir selection: strongest bonds win; dependence x0.5; resentment excluded; ties by sorted id. */

import archetypesJson from '../../data/people/archetypes.json';
import { scoreBondEvent, successionRules } from '../succession';
import type { SimState } from '../types/runtime';
import { ensureLegacy, legacyTable } from './state';

export type HeirPick = { personId: string; score: number; viaDependence: boolean };

const resentmentMax = (): number =>
  (archetypesJson as { succession?: { resentmentExcludeAbove?: number } }).succession?.resentmentExcludeAbove ?? 2;

export function scoreBonds(state: SimState): HeirPick[] {
  const rules = successionRules();
  const dep = new Set(legacyTable().dependenceEvents);
  const out: HeirPick[] = [];
  const bonds = ensureLegacy(state).bonds;
  for (const personId of Object.keys(bonds).sort()) {
    const p = state.people[personId];
    if (!p || p.tags?.includes('legacy_player')) continue;
    const b = bonds[personId]!;
    if (b.resentment > resentmentMax()) continue;
    let score = 0;
    let depScore = 0;
    for (const [event, n] of Object.entries(b.events)) {
      const w = scoreBondEvent(event, rules) * n;
      score += w;
      if (dep.has(event)) depScore += w;
    }
    if (score < rules.minBond) continue;
    out.push({ personId, score, viaDependence: depScore / score >= legacyTable().dependenceShareMin });
  }
  return out;
}

/** Top bond, or null when no one is eligible (then only "Let it rest" is offered). */
export function pickHeir(state: SimState): HeirPick | null {
  const all = scoreBonds(state).sort((a, b) => b.score - a.score || (a.personId < b.personId ? -1 : 1));
  return all[0] ?? null;
}
