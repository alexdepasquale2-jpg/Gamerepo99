/**
 * The action layer's news at dawn: what your fighting did (a boss brought down, a lair cleared), told the
 * next morning. Combat itself lives in the front end (src/combat); its rules in sim/hero. Pure.
 */
import { registerDawnLines } from '../dawn-lines';
import type { SimState } from '../types/runtime';
import { heroIfAny } from '../hero/hero';

export function heroDawnLines(state: SimState): string[] {
  // News from yesterday's fighting (deeds are noted on the day; dawn has moved the day on by one).
  return (heroIfAny(state)?.news ?? []).filter((n) => n.day === state.day - 1).slice(-2).map((n) => `Word goes round: ${n.text.charAt(0).toLowerCase()}${n.text.slice(1)}`);
}
registerDawnLines('hero', heroDawnLines);
