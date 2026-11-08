import type { SimState } from '../types/runtime';
import { acceptDeal, fulfilDeal } from './deals';
import { findDeal, patronTable, patronsBrokeredBy } from './doctrine-link';

export { openDeals, acceptDeal, canFulfilDeal, fulfilDeal, breakDeal, tickPatronDawn } from './deals';
export { patronTable, findDeal, patronSeat, patronDoctrineId, patronsBrokeredBy } from './doctrine-link';
export type { PatronDeal, PatronDef, DealDef, PatronLines } from './types';

/** Method that hosts a patron interaction when played directly by its catalog id. */
export const patronHostMethod = (state: SimState): string | undefined => patronTable(state)?.rules.hostMethodId;

/** Apply a patron interaction through a broker: a voice person in the seat of the patron that owns the deal. */
export function applyPatronInteraction(state: SimState, personId: string, accept?: string, fulfil?: string): void {
  if (!accept && !fulfil) return;
  const brokered = new Set(patronsBrokeredBy(state, personId).map((p) => p.id));
  const owner = (dealId: string) => findDeal(state, dealId)?.patron.id;
  if (accept && brokered.has(owner(accept) ?? '')) acceptDeal(state, owner(accept)!, accept);
  if (fulfil && brokered.has(owner(fulfil) ?? '')) fulfilDeal(state, fulfil);
}
