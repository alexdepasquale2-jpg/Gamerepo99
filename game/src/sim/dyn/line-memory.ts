/**
 * What each person said to the player lately, so reaction lines stop repeating. Kept in
 * state.flags.lineMemory (saved) as personId → { n: lines said so far, recent: the last RECENT line ids }.
 * Pickers add `n` to their seed (the next visit draws afresh) and damp recent lines. Pure over SimState.
 */
import type { SimState } from '../types/runtime';

const RECENT = 4;
/** A recent line keeps this share of its score (damped, not banned: small pools still answer). */
export const RECENT_DAMP = 0.12;

type Memory = { n: number; recent: string[] };
const book = (state: SimState): Record<string, Memory> => (state.flags.lineMemory ??= {}) as Record<string, Memory>;

/** How many lines this person has said to the player (salts the draw so it moves on each visit). */
export const linesSaid = (state: SimState, personId: string): number => book(state)[personId]?.n ?? 0;

/** Ids this person said lately (a composed line counts its parts too). */
export function recentLines(state: SimState, personId: string): Set<string> {
  const out = new Set<string>();
  for (const id of book(state)[personId]?.recent ?? []) for (const part of id.split('+')) out.add(part);
  return out;
}

/** Damp the scores of lines said lately. */
export function dampRecent<T extends { id: string }>(state: SimState, personId: string, items: T[], scores: number[]): number[] {
  const recent = recentLines(state, personId);
  if (!recent.size || items.length < 2) return scores;
  return scores.map((s, i) => (recent.has(items[i]!.id) ? s * RECENT_DAMP : s));
}

/** Note a line as said. */
export function rememberLine(state: SimState, personId: string, lineId: string): void {
  if (!lineId) return;
  const b = book(state);
  const m = (b[personId] ??= { n: 0, recent: [] });
  m.n += 1;
  m.recent = [...m.recent.filter((x) => x !== lineId), lineId].slice(-RECENT);
}
