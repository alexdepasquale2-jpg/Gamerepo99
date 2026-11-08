/**
 * Proofs (data/people/proofs.json): small true things a rekindled person leaves in your hands (Marta's
 * warm loaf, Elias's fresh nail). When their source person reignites they give it to you (juice
 * proof.gained, in their voice); a life whose archetype carved its own (sourceArchetypeId) starts with it.
 * Speaking gently (the inspire method) to someone whose wound the proof answers (affinityWounds) shows it:
 * the act lands harder by inspireBonusMul and they say so (juice proof.shown). Lines come from the
 * proof_gained / proof_shown keys of surface-fallbacks.json. Pure; held proofs live on state.proofs.
 */
import { noteUse } from './data-use-people';
import { fallbackLine } from './fallback-lines';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import type { SimState } from './types/runtime';

export type ProofRow = {
  id: string;
  name: string;
  description?: string;
  sourcePersonId?: string | null;
  sourceArchetypeId?: string;
  affinityWounds?: string[];
  inspireBonusMul?: number;
};

const rows = (state: SimState): ProofRow[] => ((state.data as DataTables | undefined)?.proofs ?? []) as ProofRow[];

/** Proofs in hand: those given so far, plus the life's own carving. */
export function heldProofs(state: SimState): ProofRow[] {
  const given = state.proofs ?? [];
  return rows(state).filter((r) => given.includes(r.id) || (!!r.sourceArchetypeId && r.sourceArchetypeId === state.player.archetypeId));
}

/** The proof that answers this person's wound for this method, if you hold one (strongest first, then by id). */
export function proofFor(state: SimState, personId: string, methodId: string): ProofRow | undefined {
  if (methodId !== 'inspire') return undefined;
  const wound = state.people[personId]?.woundId;
  if (!wound) return undefined;
  return heldProofs(state)
    .filter((r) => r.affinityWounds?.includes(wound) && r.sourcePersonId !== personId)
    .sort((a, b) => (b.inspireBonusMul ?? 1) - (a.inspireBonusMul ?? 1) || a.id.localeCompare(b.id))[0];
}

/** The shown proof did its work: they say what it meant. */
export function showProof(state: SimState, personId: string, proof: ProofRow): void {
  noteUse('people/proofs', proof.id);
  const from = proof.sourcePersonId ? state.people[proof.sourcePersonId]?.name?.split(' ')[0] : undefined;
  const line = fallbackLine('proof_shown', `${state.seed}|${state.day}|${personId}|${proof.id}`, { proof: proof.name.toLowerCase(), from });
  pushJuice(state, 'proof.shown', { personId, proofId: proof.id, line });
}

/** Someone reignited: anything they made that proves it is pressed into your hands. */
export function giveProofs(state: SimState, personId: string): void {
  for (const r of rows(state)) {
    if (r.sourcePersonId !== personId || state.proofs?.includes(r.id)) continue;
    (state.proofs ??= []).push(r.id);
    noteUse('people/proofs', r.id);
    const line = fallbackLine('proof_gained', `${state.seed}|${state.day}|${r.id}`, { proof: r.name.toLowerCase() });
    pushJuice(state, 'proof.gained', { personId, proofId: r.id, line });
  }
}
