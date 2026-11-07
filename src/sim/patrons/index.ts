import type { SimState } from '../types/runtime';
import { acceptDeal, fulfilDeal } from './deals';
import { patronTable } from './doctrine-link';

export { openDeals, acceptDeal, fulfilDeal, breakDeal, tickPatronDawn } from './deals';
export { patronTable, findDeal } from './doctrine-link';
export type { PatronDeal } from './types';

/** Method that hosts a patron interaction when played directly by its catalog id. */
export const patronHostMethod = (state: SimState): string | undefined => patronTable(state)?.rules.hostMethodId;

/** Apply a patron interaction to the voice person's patron (matching home town + voice tags). */
export function applyPatronInteraction(state: SimState, personId: string, accept?: string, fulfil?: string): void {
  if (!accept && !fulfil) return;
  const t = patronTable(state);
  const person = state.people[personId];
  if (!t || !person?.townId || !person.tags?.some((g) => t.rules.voiceTagsAny.includes(g))) return;
  const patron = t.patrons.find((p) => p.homeTownId === person.townId);
  if (!patron) return;
  if (accept) acceptDeal(state, patron.id, accept);
  if (fulfil && patron.deals.some((d) => d.id === fulfil)) fulfilDeal(state, fulfil);
}
