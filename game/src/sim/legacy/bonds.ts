/** Bond ledger: counts succession.bondAccumulators events per person during a life. Data-driven map. */

import type { SimState } from '../types/runtime';
import { ensureLegacy, legacyTable, pushDelta } from './state';

export type ActBond = {
  personId: string;
  methodId: string;
  interactionId?: string;
  flameBefore: number;
  reignited: boolean;
  marksChanged?: boolean;
};

const marksOf = (state: SimState, personId: string): string[] =>
  (state.people[personId]?.marks ?? []).filter((m) => m.stacks > 0).map((m) => `${m.markId}:${m.stacks}`).sort();

/** Call after an interaction resolves and person state is synced. Records bond events + delta + tendencies. */
export function recordActBond(state: SimState, a: ActBond): void {
  const person = state.people[a.personId];
  if (!person) return;
  const lg = ensureLegacy(state);
  const flameUp = person.flame > a.flameBefore;
  const flameDown = person.flame < a.flameBefore;
  const ledger = (lg.bonds[a.personId] ??= { events: {}, resentment: 0 });
  ledger.lastMethod = a.methodId;
  if (a.interactionId) ledger.lastInteractionId = a.interactionId;
  lg.methodCounts[a.methodId] = (lg.methodCounts[a.methodId] ?? 0) + 1;
  lg.lastMethodDay[a.methodId] = state.day;
  const prior = lg.methodCounts[a.methodId]! - 1;
  for (const row of legacyTable().bondEventMap as Array<{ when: string; event: string; methodIds?: string[]; repeatAfter?: number }>) {
    const hit = row.when === 'reignited' ? a.reignited : row.when === 'flameUp' ? flameUp : false;
    if (!hit || (row.methodIds && !row.methodIds.includes(a.methodId))) continue;
    if (row.repeatAfter !== undefined && prior < row.repeatAfter) continue;
    ledger.events[row.event] = (ledger.events[row.event] ?? 0) + 1;
  }
  if (flameDown) ledger.resentment += 1;
  if (person.townId && !lg.touchedTowns.includes(person.townId)) lg.touchedTowns.push(person.townId);
  if (a.reignited) {
    lg.growthSinceSuccession += 1;
    if (person.townId && !lg.growthTowns.includes(person.townId)) lg.growthTowns.push(person.townId);
    lg.choices.push({ day: state.day, kind: 'reignite', summary: `${a.methodId}@${a.personId}` });
  }
  if (flameUp || flameDown || a.reignited || a.marksChanged) {
    pushDelta(state, { t: 'reignite', personId: a.personId, methodId: a.methodId, marks: marksOf(state, a.personId), flame: person.flame, day: state.day });
  }
}
