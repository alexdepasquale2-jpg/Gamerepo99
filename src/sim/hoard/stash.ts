/** Stash sites: hide / guard / withdraw acts, dawn decay and theft. Goods reuse economy-resources ids. */

import { enqueueLetter } from '../letters-scale';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { fireNotorietyEvent, noteCoinSpend, raidBonus } from './events';
import { addNotoriety, despairMul } from './notoriety';
import {
  actDefs, ensureHoard, ensureStash, notePeakCoin, notorietyTable, siteDefs, totalGoods,
  type StashSiteDef,
} from './state';

export const unguarded = (guards: number, slots: number): number => Math.max(0, 1 - guards / Math.max(1, slots));
export const decayLoss = (goods: number, decay: number, ung: number): number => Math.floor(goods * decay * ung);

/** Spec §4 theftP, clamped. */
export function theftP(d: StashSiteDef, notoriety: number, guards: number): number {
  const p = d.theftRiskBase + 0.35 * notoriety - 0.4 * d.hideDifficulty - 0.15 * (guards / Math.max(1, d.guardSlots));
  return Math.min(0.85, Math.max(0.02, p));
}

/** Interaction-driven stash act at the site in the player's town (no-op elsewhere). */
export function applyStashAct(state: SimState, actId: string): boolean {
  const act = actDefs(state).find((a) => a.id === actId);
  const def = siteDefs(state).find((d) => d.townId === state.player.townId);
  if (!act || !def) return false;
  const s = ensureStash(state, def.id);
  const h = ensureHoard(state);
  const carried = state.player.coin ?? 0;
  if (actId === 'stash_hide') {
    const put = Math.min(carried, act.amount ?? 0, def.capacity - s.coin);
    if (put <= 0) return false;
    state.player.coin = carried - put;
    s.coin += put;
    if (put > Number(notorietyTable(state)?.gains.find((g) => g.id === 'gain_large_deposit')?.when?.stashDepositAbove ?? 20)) addNotoriety(state, 'gain_large_deposit');
  } else if (actId === 'stash_guard_hire') {
    if (s.guardsHired >= def.guardSlots || carried < (act.coinCost ?? 0)) return false;
    state.player.coin = carried - (act.coinCost ?? 0);
    s.guardsHired += 1;
    noteCoinSpend(state, act.coinCost ?? 0);
  } else if (actId === 'stash_withdraw') {
    if (s.coin <= 0) return false;
    state.player.coin = carried + s.coin;
    s.coin = 0;
  }
  h.lastStashActDay = state.day;
  notePeakCoin(state);
  return true;
}

/** One dawn: decay unguarded goods, then roll theft per site (deriveRng seed|stash|day|site). */
export function tickStashDawn(state: SimState): { lost: string[]; stolen: string[] } {
  const out = { lost: [] as string[], stolen: [] as string[] };
  const h = ensureHoard(state);
  for (const d of siteDefs(state)) {
    const s = h.stash[d.id];
    if (!s) continue;
    const loss = decayLoss(totalGoods(s), d.decayPerDawn, unguarded(s.guardsHired, d.guardSlots));
    if (loss > 0) {
      let left = loss;
      for (const g of Object.keys(s.goods).sort()) {
        const take = Math.min(left, s.goods[g]!);
        s.goods[g]! -= take;
        left -= take;
      }
      out.lost.push(d.id);
    }
    if (s.coin + totalGoods(s) <= 0) continue;
    const rng = deriveRng(state.seed, 'stash', state.day, d.id);
    const p = (theftP(d, h.notoriety, s.guardsHired) + raidBonus(state, d.id)) * despairMul(state, d.townId);
    if (rng.next() >= p) continue;
    const frac = (0.1 + 0.3 * rng.next()) * (1 - d.hideDifficulty * 0.5);
    const taken = Math.floor(s.coin * frac);
    s.coin -= taken;
    for (const g of Object.keys(s.goods)) s.goods[g] = s.goods[g]! - Math.floor(s.goods[g]! * frac);
    s.lastTheftDay = state.day;
    out.stolen.push(d.id);
    const raider = h.raiders?.[d.id];
    if (raider && h.raiders) delete h.raiders[d.id];
    const witness = raider ?? Object.keys(state.people).sort().find((id) => state.people[id]!.townId === d.townId);
    if (witness) enqueueLetter(state, { kind: 'rumor', fromPersonId: witness, outcomeId: 'stash_theft' });
    pushJuice(state, 'stash.theft', { siteId: d.id, townId: d.townId, coin: taken });
    fireNotorietyEvent(state, 'stash_theft', { guards: s.guardsHired, townId: d.townId });
  }
  return out;
}
