/**
 * Hooks felt at dawn: the personal costs and comforts that moved your spark since yesterday's dawn
 * (dusk loneliness, a lie's ink, waking by your own hearth...) are told as one or two lines in your own
 * body's words, from each hook's `felt` variants (data/hooks/*.json). Each starts "You"/"Your", which
 * voice/dawn.ts says over the player rather than handing to a villager. Without this they only nudged the
 * spark meter, which nobody can read as a reason. The everyday dawn toll (recovery_base_dawn) is told
 * only on a morning nothing else was felt. Deterministic: variants by seed/day/hook.
 */
import { registerDawnLines } from '../dawn-lines';
import type { DataTables } from '../load-data';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

/** At most this many felt lines a dawn, strongest first: more would bury what people said. */
const MAX_LINES = 2;
const QUIET = 'recovery_base_dawn';

const weight = (data: DataTables, id: string): number =>
  (data.hooksById.get(id)?.effects ?? []).reduce((s, fx) => s + Math.abs(Number(fx.value) || 0), 0);

export function hookFeltLines(state: SimState): string[] {
  const data = state.data as DataTables | undefined;
  const felt = state.hookFelt;
  if (!data || !felt || felt.day !== state.day) return [];
  const ids = [...new Set([...(felt.prev ?? []), ...felt.ids])].filter((id) => data.hooksById.get(id)?.felt?.length);
  const loud = ids.filter((id) => id !== QUIET).sort((a, b) => weight(data, b) - weight(data, a) || a.localeCompare(b));
  const told = loud.length ? loud.slice(0, MAX_LINES) : ids.filter((id) => id === QUIET);
  return told.map((id) => {
    const lines = data.hooksById.get(id)!.felt!;
    return lines[deriveRng(state.seed, 'hook-felt', state.day, id).int(0, lines.length)]!;
  });
}

registerDawnLines('hook-felt', hookFeltLines);
