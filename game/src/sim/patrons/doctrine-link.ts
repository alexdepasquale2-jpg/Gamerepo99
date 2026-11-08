/** Patron <-> doctrine meters. Only nudges meters; legitimacy is recomputed by tickDoctrines. */
import type { DataTables } from '../load-data';
import { ensureDoctrines, nudgeDoctrine } from '../doctrine-tick';
import type { SimState } from '../types/runtime';
import type { DealDef, ObligationEffect, PatronDef, PatronLines, PatronRules } from './types';

type Table = { patrons: PatronDef[]; rules: PatronRules; obligationEffects: Record<string, ObligationEffect>; lines?: PatronLines };
export const patronTable = (state: SimState): Table | undefined => (state.data as Partial<DataTables> | undefined)?.patrons as Table | undefined;

export function findDeal(state: SimState, dealId: string): { patron: PatronDef; deal: DealDef } | undefined {
  for (const patron of patronTable(state)?.patrons ?? []) {
    const deal = patron.deals.find((d) => d.id === dealId);
    if (deal) return { patron, deal };
  }
  return undefined;
}

/**
 * The town a patron does business from. Its authored home town when a voice lives there to broker;
 * otherwise (generated worlds hold only some of the authored towns) wherever its doctrine's leader lives.
 */
export function patronSeat(state: SimState, patron: PatronDef): string {
  const people = state.people ?? {};
  const voices = patronTable(state)?.rules.voiceTagsAny ?? [];
  if (Object.values(people).some((p) => p.townId === patron.homeTownId && p.tags?.some((g) => voices.includes(g)))) return patron.homeTownId;
  const rows = ((state.data as Partial<DataTables> | undefined)?.doctrines as { doctrines?: { id: string; leaderPersonId?: string | null }[] } | undefined)?.doctrines;
  const leader = rows?.find((d) => d.id === patron.doctrineId)?.leaderPersonId;
  return (leader && people[leader]?.townId) || patron.homeTownId;
}

/** Patrons a person can broker: they carry a voice tag and live in that patron's seat. */
export function patronsBrokeredBy(state: SimState, personId: string): PatronDef[] {
  const t = patronTable(state);
  const person = state.people?.[personId];
  if (!t || !person?.townId || !person.tags?.some((g) => t.rules.voiceTagsAny.includes(g))) return [];
  return t.patrons.filter((p) => patronSeat(state, p) === person.townId);
}

export function applyObligationEffect(state: SimState, patron: PatronDef, deal: DealDef, on: 'accept' | 'fulfil'): void {
  const e = patronTable(state)?.obligationEffects[deal.obligation.kind];
  if (e && e.on === on) nudgeDoctrine(state, patron.doctrineId, e.meter, e.add);
}

export const doctrineOf = (state: SimState, patron: PatronDef) => ensureDoctrines(state)[patron.doctrineId];
