/**
 * Inner state surfaced at dawn: inherited dependence named while it is held, and on the morning it lets go.
 * Lines come through someone in the player's town (the one leaning hardest on you, if anyone is).
 * Texts live in data/dialogue/surface-fallbacks.json. Pure and deterministic.
 */
import fallbackJson from '../../data/dialogue/surface-fallbacks.json';
import { registerDawnLines } from '../dawn-lines';
import type { SimState } from '../types/runtime';

const LINES = (fallbackJson as { lines: Record<string, string[]> }).lines;
const TRAIT = 'inherited_dependence';

const pretty = (id: string): string =>
  id.split(/[_-]/).filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');

/** Who carries the line: someone in the player's town, the most dependent first, then by id. */
export function dependenceSpeaker(state: SimState): string | undefined {
  const townId = state.player.townId;
  const folk = Object.values(state.people)
    .filter((p) => p.townId === townId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!folk.length) return undefined;
  const dep = (p: (typeof folk)[number]): number => p.marks?.find((m) => m.markId === 'dependence')?.stacks ?? 0;
  const best = folk.reduce((a, p) => (dep(p) > dep(a) ? p : a), folk[0]!);
  return best.name ?? pretty(best.id).split(' ')[0];
}

function fill(key: string, state: SimState): string | null {
  const arr = LINES[key] ?? [];
  const who = dependenceSpeaker(state);
  if (!arr.length || !who) return null;
  const prev = state.legacy?.lineage?.[state.legacy.lineage.length - 1]?.imprint.displayName ?? 'the one before you';
  return arr[state.day % arr.length]!.replace(/\{who\}/g, () => who).replace(/\{prev\}/g, () => prev);
}

/** Dawn line(s) for inherited dependence: held -> it is named; resolved this dawn -> it lets go. */
export function inheritedDependenceLines(state: SimState): string[] {
  if (state.player.statusTraits.includes(TRAIT)) return [fill('dawn_inherited_dependence_held', state)].filter((l): l is string => !!l);
  if (state.legacy?.dependenceResolvedDay === state.day) return [fill('dawn_inherited_dependence_resolved', state)].filter((l): l is string => !!l);
  return [];
}

registerDawnLines('inner-state-dependence', inheritedDependenceLines);
