/**
 * What a rumour says when it reaches another town. The words are the outcome's own come-to-pass
 * fragment (data/dialogue/fragments/unspoken/come-to-pass.json), or a line from rumours.json for news
 * that is not an unspoken outcome (a theft, a patron's bargain), framed as talk out of the teller's town.
 * Pure, deterministic (deriveRng keyed by outcome, teller and day).
 */
import { trackedTable } from './data-use-people';
import comeToPass from '../data/dialogue/fragments/unspoken/come-to-pass.json';
import table from '../data/dialogue/rumours.json';
import { happeningTownName } from './happenings';
import { deriveRng } from './rng';
import type { SimState } from './types/runtime';

type Table = { titles: string[]; frames: string[]; outcomes: Record<string, string>; fallback: string; kinLabel: string };
const T = trackedTable('dialogue/rumours', table as Table, ['outcomes']);
const FRAGMENTS = (comeToPass as { fragments: { text: string; tags: string[] }[] }).fragments;

const fill = (text: string, slots: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);

/** The outcome's own words: its unspoken fragment, else the rumour table's line for it, else the fallback. */
export function outcomeLine(outcomeId: string): string {
  return FRAGMENTS.find((f) => f.tags.includes(`unspoken:${outcomeId}`))?.text ?? T.outcomes[outcomeId] ?? T.fallback;
}

/** `townId` is where it came to pass; `otherTown` is where the word lands (the fragments' "a town other than the carrier's"). */
export function rumourBody(state: SimState, outcomeId: string, tellerId: string, townId: string, otherTown: string): { title: string; body: string } {
  const rng = deriveRng(state.seed, 'rumour-frame', outcomeId, tellerId, state.day);
  const teller = state.people[tellerId]?.name ?? 'someone';
  const town = happeningTownName(townId);
  const filled = fill(outcomeLine(outcomeId), { carrier: teller, kinLabel: T.kinLabel, otherTown: happeningTownName(otherTown) });
  const line = filled.charAt(0).toUpperCase() + filled.slice(1);
  const slots = { town, teller, line };
  return { title: fill(T.titles[rng.int(0, T.titles.length)]!, slots), body: fill(T.frames[rng.int(0, T.frames.length)]!, slots) };
}
