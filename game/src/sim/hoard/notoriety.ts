/** Dual-edge notoriety: leverage (discounts) AND danger (theft odds, road/dawn attractors). */

import { findCrossTownKin, pushJuice } from '../packets';
import { deriveRng } from '../rng';
import { noteUse } from '../data-use-civic';
import type { SimState } from '../types/runtime';
import { clamp01, ensureHoard, notorietyTable, visibleWealth } from './state';

/** Dying towns are quieter (theft, copycats lower) until collapse, where bandits return. */
export function despairMul(state: SimState, townId: string | undefined): number {
  const cfg = notorietyTable(state)?.despair;
  const d = townId ? (state.towns?.[townId]?.despair ?? 0) : 0;
  return cfg && d > cfg.dampenAbove && d < cfg.collapseAbove ? cfg.mul : 1;
}

function mirror(state: SimState): void {
  state.flags.notoriety = ensureHoard(state).notoriety;
}

/** Apply a gain/loss row from notoriety.json; a rise spikes heat (ripple tag + diluted kin rumor). */
export function addNotoriety(state: SimState, gainId: string): void {
  const t = notorietyTable(state);
  const row = [...(t?.gains ?? []), ...(t?.losses ?? [])].find((r) => r.id === gainId);
  if (!t || !row) return;
  noteUse('economy/notoriety', row.id);
  const h = ensureHoard(state);
  h.notoriety = clamp01(h.notoriety + row.add);
  mirror(state);
  if (row.add < 0) pushJuice(state, 'notoriety.fall', { gainId, notoriety: h.notoriety });
  if (row.add <= 0) return;
  pushJuice(state, 'notoriety.rise', { gainId, notoriety: h.notoriety, rippleTag: t.spread.rippleTag });
  const from = Object.keys(state.people).sort().filter((p) => state.people[p]!.townId === state.player.townId);
  for (const p of from) {
    const hit = findCrossTownKin(state, p);
    if (!hit) continue;
    state.packets.push({
      id: `pkt_noto_${state.day}_${gainId}`,
      days: 2,
      kind: t.spread.emitPacketType,
      fromTownId: state.people[p]!.townId,
      toTownId: hit.other.townId,
      heat: row.add * t.spread.kinDilution,
    });
    break;
  }
}

/** Dawn: slow fade, lie-low loss, heat = n * (0.5 + 0.5 * visibleWealth). */
export function tickNotorietyDawn(state: SimState): { heat: number } {
  const t = notorietyTable(state);
  const h = ensureHoard(state);
  if (!t) return { heat: 0 };
  h.notoriety = clamp01(h.notoriety * (1 - t.fade));
  if (state.day - h.lastStashActDay > Number(t.losses.find((l) => l.id === 'loss_lie_low')?.when?.daysWithoutStashActAbove ?? Infinity)) addNotoriety(state, 'loss_lie_low');
  mirror(state);
  return { heat: h.notoriety * (0.5 + 0.5 * visibleWealth(state)) };
}

/** Attractor ids that fire now. 'road' = rows with an encounter channel; 'dawn' = the rest. */
export function rollAttractors(state: SimState, ctx: 'dawn' | 'road'): string[] {
  const t = notorietyTable(state);
  const n = ensureHoard(state).notoriety;
  if (!t) return [];
  const out: string[] = [];
  for (const a of t.attractors) {
    const road = a.channels.includes('encounter');
    if (n < a.minNotoriety || (ctx === 'road') !== road) continue;
    const mul = a.id === 'att_copycat' ? despairMul(state, state.player.townId) : 1;
    const rng = deriveRng(state.seed, 'attractor', ctx, state.day, a.id);
    if (rng.next() < Math.min(1, a.weight * n * t.attractorRollScale * mul)) { out.push(a.id); noteUse('economy/notoriety', a.id); }
  }
  return out;
}

/** Extra encounter-table weight for an entry tied to an attractor (0 below its minNotoriety). */
export function attractorRoadBonus(state: SimState, attractorId: string): number {
  const t = notorietyTable(state);
  const a = t?.attractors.find((x) => x.id === attractorId);
  const n = ensureHoard(state).notoriety;
  if (!t || !a || n < a.minNotoriety) return 0;
  noteUse('economy/notoriety', a.id);
  return a.weight * n * t.roadWeightScale;
}

/** Leverage edge: fraction of spark strain forgiven on hard/defiant interactions. */
export function leverageDiscount(state: SimState, tags: readonly string[] | undefined): number {
  const t = notorietyTable(state);
  if (!t || !tags?.some((g) => t.leverage.tagsAny.includes(g))) return 0;
  return t.leverage.discount * ensureHoard(state).notoriety;
}
