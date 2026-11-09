/**
 * The small effects a use can have, shared by item, node, fauna verbs (data-driven bundles). Each one
 * reuses an existing sim path: spark on the player, items into the satchel, goods into a town's ledger
 * (deliverToTown eases a shortage), town despair, a resident's Blessing (encodeUnspokenForState), node
 * charges and regrowth. Pure over SimState; lines are seeded by seed/day, never rng.
 */
import { deriveRng } from '../rng';
import { deliverToTown } from '../goods/deed-goods';
import { addItem, itemName } from '../goods/inventory';
import { nodeCharges, nodeKind, type WorldNode } from '../goods/nodes';
import { encodeUnspokenForState } from '../social/unspoken';
import { supplyTown } from '../economy/village-economy';
import type { SimState } from '../types/runtime';
import { firstNameOf } from '../names';

export type Bundle = {
  /** Player spark gained (capped at sparkMax). */
  spark?: number;
  /** Items into the player's satchel. */
  gain?: Record<string, number>;
  /** Goods into the town's ledger (deliverToTown: eases a shortage). */
  town?: Record<string, number>;
  /** Town despair change (negative eases it). */
  despair?: number;
  /** A resident takes it to heart: a Blessing with these tags; `{name}` in `done` is them. */
  thanks?: string[];
  /** Node kinds near the thing (or the town's depleted nodes) recover a dawn sooner. */
  regrow?: string[];
  /** Charges back on this node (or a dawn off its regrow). */
  tend?: number;
  /** Charges this use spends on the node (refused when it has too few). */
  charge?: number;
  /** The line said; `{name}` = the resident who noticed, `{item}` = the item. */
  done?: string;
};
export type BundleCtx = { townId?: string; node?: WorldNode; nearNodes?: WorldNode[]; itemId?: string; key: string };
export type BundleResult = { ok: boolean; line: string; residentId?: string };

const flagMap = (state: SimState, k: string): Record<string, number> => (state.flags[k] ??= {}) as Record<string, number>;
/** Once-per-day uses: key → the day it was last used. */
export const usedToday = (state: SimState, key: string): boolean => (state.flags.useDay as Record<string, number> | undefined)?.[key] === state.day;
export const markUsed = (state: SimState, key: string): void => void (flagMap(state, 'useDay')[key] = state.day);

export const firstName = (state: SimState, id: string): string => {
  const n = state.people[id]?.name ?? id.replace(/_/g, ' ');
  const w = firstNameOf(n) ?? n;
  return w ? w[0]!.toUpperCase() + w.slice(1) : n;
};

/** A resident of the town who notices (seeded by seed/day/key, stable for the same act). */
export function residentOf(state: SimState, townId: string | undefined, key: string): string | undefined {
  if (!townId) return undefined;
  const folk = Object.values(state.people).filter((p) => p.townId === townId).map((p) => p.id).sort();
  return folk.length ? folk[deriveRng(state.seed, 'use-resident', key, state.day).int(0, folk.length)] : undefined;
}

/** Give a node charges back (or take dawns off its regrow). False when it is already full. */
export function tendNode(state: SimState, n: WorldNode, by: number): boolean {
  const k = nodeKind(n.kindId);
  const cur = state.worldNodes?.[n.id];
  if (!k || !cur) return false;
  if (cur.charges <= 0) {
    cur.regrowIn -= by;
    if (cur.regrowIn <= 0) delete state.worldNodes![n.id];
    return true;
  }
  cur.charges = Math.min(k.charges, cur.charges + by);
  if (cur.charges >= k.charges) delete state.worldNodes![n.id];
  return true;
}

function spendCharge(state: SimState, n: WorldNode, by: number): void {
  const k = nodeKind(n.kindId)!;
  const nodes = (state.worldNodes ??= {});
  const cur = nodes[n.id] ?? { charges: k.charges, regrowIn: 0 };
  cur.charges -= by;
  if (cur.charges <= 0) cur.regrowIn = k.regrowDawns;
  nodes[n.id] = cur;
}

/** Depleted nodes nearby (or in the town) of these kinds recover a dawn sooner. How many were helped. */
function regrowNear(state: SimState, kinds: string[], ctx: BundleCtx): number {
  const nodes = state.worldNodes ?? {};
  const ids = ctx.nearNodes?.length
    ? ctx.nearNodes.filter((n) => kinds.includes(n.kindId)).map((n) => n.id)
    : Object.keys(nodes).filter((id) => !!ctx.townId && id.startsWith(`${ctx.townId}#`));
  let helped = 0;
  for (const id of ids.sort()) {
    const s = nodes[id];
    if (!s || s.charges > 0 || helped >= 2) continue;
    s.regrowIn -= 1;
    if (s.regrowIn <= 0) delete nodes[id];
    helped += 1;
  }
  return helped;
}

/** Why the bundle cannot happen right now, or null. */
export function bundleRefusal(state: SimState, b: Bundle, ctx: BundleCtx): string | null {
  if (b.charge && (!ctx.node || nodeCharges(state, ctx.node) < b.charge)) return 'Nothing left here today.';
  const full = !!ctx.node && !state.worldNodes?.[ctx.node.id];
  if (b.tend && full && !b.spark && !b.gain && !b.town && !b.thanks && !b.despair) return 'It is whole already. Come back once it has been worked.';
  const onlySpark = b.spark && !b.gain && !b.town && !b.thanks && !b.despair && !b.tend && !b.regrow;
  if (onlySpark && state.player.spark >= (state.player.sparkMax ?? 100)) return 'You are rested enough. Save it.';
  return null;
}

/** Apply a bundle (call bundleRefusal first). The line names what changed. */
export function applyBundle(state: SimState, b: Bundle, ctx: BundleCtx): BundleResult {
  const parts: string[] = [];
  const residentId = b.thanks || b.town || b.done?.includes('{name}') ? residentOf(state, ctx.townId, ctx.key) : undefined;
  if (b.charge && ctx.node) spendCharge(state, ctx.node, b.charge);
  if (b.tend && ctx.node && tendNode(state, ctx.node, b.tend)) parts.push('It will give again sooner.');
  if (b.regrow && regrowNear(state, b.regrow, ctx) > 0 && !b.done) parts.push('The growth nearby will come back quicker.');
  if (b.spark) {
    const cap = state.player.sparkMax ?? 100;
    const gain = Math.max(0, Math.min(b.spark, cap - state.player.spark));
    state.player.spark += gain;
    if (gain > 0) parts.push(`+${gain.toFixed(0)} spark`);
  }
  for (const [id, n] of Object.entries(b.gain ?? {})) {
    addItem(state, id, n);
    parts.push(`+${n} ${itemName(id)}`);
  }
  let relief = false;
  for (const [id, n] of Object.entries(b.town ?? {})) {
    if (!ctx.townId) continue;
    if (residentId) relief = deliverToTown(state, ctx.townId, id, n, residentId) || relief;
    else supplyTown(state, ctx.townId, id, n);
  }
  if (relief) parts.push('The town needed that.');
  const town = ctx.townId ? state.towns?.[ctx.townId] : undefined;
  if (b.despair && town) town.despair = Math.min(1, Math.max(0, town.despair + b.despair));
  if (b.thanks && residentId) {
    encodeUnspokenForState(state, 'gift_give', residentId, { tags: b.thanks });
    if (ctx.townId) flagMap(state, 'lastTouchDayByTown')[ctx.townId] = state.day;
  }
  const name = residentId ? firstName(state, residentId) : 'A neighbour';
  const said = b.done?.replace(/\{name\}/g, name).replace(/\{item\}/g, ctx.itemId ? itemName(ctx.itemId).toLowerCase() : 'it');
  const extra = parts.filter((p) => !said || p.startsWith('+') || p.startsWith('The town'));
  return { ok: true, line: [said, ...extra].filter(Boolean).join(' '), residentId };
}
