/**
 * Goods that belong to someone else: what a person lends you when you ask a favor, and the cargo
 * they handed you to carry. "Return what's theirs" hands either back. Pure over SimState.
 */

import type { SimState } from '../types/runtime';
import { jobOf } from './jobs';
import { ITEM_BY_ID, addItem, giftAffinity, hasItem, itemName, removeItem } from './inventory';
import { mintInstance } from './instances';

export type TheirGoods = { kind: 'loan' | 'cargo'; itemId: string; qty: number };

/** The first thing the player still holds that is this person's: a loan first, then undelivered cargo. */
export function theirGoods(state: SimState, personId: string): TheirGoods | null {
  for (const l of state.loans ?? []) {
    if (l.fromPersonId === personId && hasItem(state, l.itemId, l.qty)) return { kind: 'loan', itemId: l.itemId, qty: l.qty };
  }
  for (const c of state.cargo ?? []) {
    if (c.fromPersonId === personId && hasItem(state, c.itemId, c.qty)) return { kind: 'cargo', itemId: c.itemId, qty: c.qty };
  }
  return null;
}

/** Hand their goods back. Returns what moved, or null when there is nothing of theirs to return. */
export function returnTheirGoods(state: SimState, personId: string): TheirGoods | null {
  const g = theirGoods(state, personId);
  if (!g) return null;
  const list = g.kind === 'loan' ? state.loans! : state.cargo!;
  const k = list.findIndex((x) => x.fromPersonId === personId && x.itemId === g.itemId && x.qty === g.qty);
  list.splice(k, 1);
  removeItem(state, g.itemId, g.qty);
  // A lent thing goes back to the hands that made it; anonymous cargo just leaves the satchel.
  let left = g.kind === 'loan' ? g.qty : 0;
  for (const inst of [...(state.itemInstances ?? [])].reverse()) {
    if (left <= 0) break;
    if (inst.itemId === g.itemId && inst.heldBy === 'player' && inst.madeBy === personId) { inst.heldBy = personId; left -= 1; }
  }
  return g;
}

/** What this person would lend if asked a favor: one of their work goods carrying a lendable tag. */
export function lendCandidate(state: SimState, personId: string, itemTagsAny: readonly string[]): string | null {
  if ((state.loans ?? []).some((l) => l.fromPersonId === personId)) return null; // one thing out at a time
  const y = jobOf(state, personId).yield.find((r) => r.itemId !== 'coin' && ITEM_BY_ID.get(r.itemId)?.tags.some((t) => itemTagsAny.includes(t)));
  return y?.itemId ?? null;
}

/** They lend you one of their goods; it is theirs until you return it. */
export function lendFrom(state: SimState, personId: string, itemId: string): void {
  addItem(state, itemId, 1);
  mintInstance(state, itemId, personId, state.people[personId]?.townId ?? state.player.townId ?? '');
  (state.loans ??= []).push({ itemId, qty: 1, fromPersonId: personId, day: state.day });
}

/** How they take it back, by how much the thing means to them (gift-affinity rules). */
export function returnLine(state: SimState, personId: string, g: TheirGoods, name: string): string {
  const a = giftAffinity(state, personId, g.itemId);
  const what = g.qty > 1 ? `${g.qty} ${itemName(g.itemId)}` : itemName(g.itemId);
  const feel = a >= 2 ? 'holds it close' : a > 0 ? 'smiles' : 'takes it back';
  const why = g.kind === 'loan' ? '"You brought it back."' : '"You could have kept it."';
  return `${name} ${feel} (${what}). ${why}`;
}
