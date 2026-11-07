/** Patron <-> doctrine meters. Only nudges meters; legitimacy is recomputed by tickDoctrines. */
import type { DataTables } from '../load-data';
import { ensureDoctrines, nudgeDoctrine } from '../doctrine-tick';
import type { SimState } from '../types/runtime';
import type { DealDef, ObligationEffect, PatronDef, PatronRules } from './types';

type Table = { patrons: PatronDef[]; rules: PatronRules; obligationEffects: Record<string, ObligationEffect> };
export const patronTable = (state: SimState): Table | undefined => (state.data as Partial<DataTables> | undefined)?.patrons as Table | undefined;

export function findDeal(state: SimState, dealId: string): { patron: PatronDef; deal: DealDef } | undefined {
  for (const patron of patronTable(state)?.patrons ?? []) {
    const deal = patron.deals.find((d) => d.id === dealId);
    if (deal) return { patron, deal };
  }
  return undefined;
}

export function applyObligationEffect(state: SimState, patron: PatronDef, deal: DealDef, on: 'accept' | 'fulfil'): void {
  const e = patronTable(state)?.obligationEffects[deal.obligation.kind];
  if (e && e.on === on) nudgeDoctrine(state, patron.doctrineId, e.meter, e.add);
}

export const doctrineOf = (state: SimState, patron: PatronDef) => ensureDoctrines(state)[patron.doctrineId];
