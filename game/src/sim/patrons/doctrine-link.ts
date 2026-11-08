/** Patron <-> doctrine meters. Only nudges meters; legitimacy is recomputed by tickDoctrines. */
import type { DataTables } from '../load-data';
import { doctrineRow, ensureDoctrines, nudgeDoctrine, worldSeat, type DoctrineState } from '../doctrine-tick';
import type { SimState } from '../types/runtime';
import type { DealDef, ObligationEffect, PatronDeal, PatronDef, PatronLines, PatronRules } from './types';

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
 * The doctrine a patron backs in this world, a role: its authored doctrine when this world holds it; otherwise
 * (a generated district, or a home world without that town) the strongest unclaimed doctrine, the world's seat
 * first, strongest at the start. The claim is written on the doctrine (patronId) so it holds steady once made; patrons claim in table
 * order, all at once, so who asks first never changes the outcome. Undefined when none is left to take.
 */
export function patronDoctrineId(state: SimState, patron: PatronDef): string | undefined {
  const all = ensureDoctrines(state);
  if (all[patron.doctrineId]) return patron.doctrineId;
  const mine = (id: string) => Object.values(all).find((d) => d.patronId === id)?.id;
  if (mine(patron.id)) return mine(patron.id);
  const patrons = patronTable(state)?.patrons ?? [];
  const authored = new Set(patrons.map((p) => p.doctrineId));
  const free = Object.values(all).filter((d) => !d.collapsed && !d.patronId && !authored.has(d.id));
  if (!free.length) return undefined;
  // Strongest by how it started (not today's meters), so the claim does not depend on the day it is made.
  const seat = worldSeat(state);
  const strength = (id: string) => doctrineRow(state, id)?.start.legitimacy ?? 0;
  free.sort((a, b) => Number(b.townId === seat) - Number(a.townId === seat) || strength(b.id) - strength(a.id) || a.id.localeCompare(b.id));
  for (const p of patrons) {
    if (all[p.doctrineId] || mine(p.id)) continue;
    const d = free.shift();
    if (!d) break;
    d.patronId = p.id;
  }
  return mine(patron.id);
}

/**
 * The town a patron does business from, by role: its authored home town when a voice lives there to broker;
 * else the town of the doctrine it backs in this world, when a voice lives there; else where its authored
 * doctrine's leader lives (home worlds that lack the authored town still seed that leader); else the backed
 * doctrine's town. A patron with nothing here keeps its authored town id, where no one lives: no offers.
 */
export function patronSeat(state: SimState, patron: PatronDef): string {
  const people = state.people ?? {};
  const voices = patronTable(state)?.rules.voiceTagsAny ?? [];
  const voiced = (townId: string | undefined) => !!townId && Object.values(people).some((p) => p.townId === townId && p.tags?.some((g) => voices.includes(g)));
  if (voiced(patron.homeTownId)) return patron.homeTownId;
  const id = patronDoctrineId(state, patron);
  const backed = id ? ensureDoctrines(state)[id]?.townId : undefined;
  if (backed && voiced(backed)) return backed;
  const leader = doctrineRow(state, patron.doctrineId)?.leaderPersonId;
  return (leader && people[leader]?.townId) || backed || patron.homeTownId;
}

/** Patrons a person can broker: they carry a voice tag and live in that patron's seat. */
export function patronsBrokeredBy(state: SimState, personId: string): PatronDef[] {
  const t = patronTable(state);
  const person = state.people?.[personId];
  if (!t || !person?.townId || !person.tags?.some((g) => t.rules.voiceTagsAny.includes(g))) return [];
  return t.patrons.filter((p) => patronSeat(state, p) === person.townId);
}

export function applyObligationEffect(state: SimState, patron: PatronDef, deal: DealDef, on: 'accept' | 'fulfil', doctrineId?: string): void {
  const e = patronTable(state)?.obligationEffects[deal.obligation.kind];
  const id = doctrineId ?? patronDoctrineId(state, patron);
  if (e && e.on === on && id) nudgeDoctrine(state, id, e.meter, e.add);
}

/** The doctrine a deal answers to here: the one it was made with, else (older saves) the patron's in this world. */
export function dealDoctrine(state: SimState, patron: PatronDef, deal: PatronDeal): { id?: string; doc?: DoctrineState } {
  const id = deal.doctrineId ?? patronDoctrineId(state, patron);
  return { id, doc: id ? ensureDoctrines(state)[id] : undefined };
}

/** The doctrine a patron backs in this world (see patronDoctrineId). */
export const doctrineOf = (state: SimState, patron: PatronDef) => {
  const id = patronDoctrineId(state, patron);
  return id ? ensureDoctrines(state)[id] : undefined;
};
