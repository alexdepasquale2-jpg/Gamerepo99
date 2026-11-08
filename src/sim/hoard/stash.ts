/** Stash sites: hide / guard / withdraw acts, dawn decay and theft. Goods reuse economy-resources ids. */

import { enqueueLetter } from '../letters-scale';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { fireNotorietyEvent, noteCoinSpend, raidBonus } from './events';
import { addNotoriety, despairMul } from './notoriety';
import { addItem, inventoryOf, ITEM_BY_ID } from '../goods/inventory';
import {
  actDefs, ensureHoard, ensureStash, notePeakCoin, notorietyTable, shiftCarriedCoin, siteDefs, siteInTown, totalGoods,
  type HoardNews, type StashActDef, type StashSiteDef,
} from './state';

export const unguarded = (guards: number, slots: number): number => Math.max(0, 1 - guards / Math.max(1, slots));
export const decayLoss = (goods: number, decay: number, ung: number): number => Math.floor(goods * decay * ung);

/** Spec §4 theftP, clamped. */
export function theftP(d: StashSiteDef, notoriety: number, guards: number): number {
  const p = d.theftRiskBase + 0.35 * notoriety - 0.4 * d.hideDifficulty - 0.15 * (guards / Math.max(1, d.guardSlots));
  return Math.min(0.85, Math.max(0.02, p));
}

/** Carried items stash_store would tuck away (tag match; coin is never a good). Sorted by id. */
export function storableGoods(state: SimState, act: StashActDef | undefined): [string, number][] {
  const tags = act?.goodsTagsAny ?? [];
  if (!tags.length || !state.inventory) return [];
  return Object.entries(state.inventory)
    .filter(([id, n]) => id !== 'coin' && n > 0 && (ITEM_BY_ID.get(id)?.tags ?? []).some((t) => tags.includes(t)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Room left in a stash (coin and goods share the hollow). */
export const stashRoom = (d: StashSiteDef, coin: number, goods: number): number => Math.max(0, d.capacity - coin - goods);

/**
 * Interaction-driven stash act at the site in the player's town (no-op elsewhere).
 * `personId` is whoever helped (their line surfaces as juice); the chest click passes none.
 */
export function applyStashAct(state: SimState, actId: string, personId?: string): boolean {
  const act = actDefs(state).find((a) => a.id === actId);
  const def = siteInTown(state, state.player.townId);
  if (!act || !def) return false;
  const s = ensureStash(state, def.id);
  const h = ensureHoard(state);
  const carried = state.player.coin ?? 0;
  const said = { personId, siteId: def.id, townId: def.townId };
  if (actId === 'stash_hide') {
    const put = Math.min(carried, act.amount ?? 0, stashRoom(def, s.coin, totalGoods(s)));
    if (put <= 0) return false;
    shiftCarriedCoin(state, -put);
    s.coin += put;
    pushJuice(state, 'stash.hidden', { ...said, coin: put });
    if (put > Number(notorietyTable(state)?.gains.find((g) => g.id === 'gain_large_deposit')?.when?.stashDepositAbove ?? 20)) addNotoriety(state, 'gain_large_deposit');
  } else if (actId === 'stash_store') {
    let room = stashRoom(def, s.coin, totalGoods(s));
    let moved = 0;
    for (const [id, n] of storableGoods(state, act)) {
      const take = Math.min(n, room);
      if (take <= 0) break;
      addItem(state, id, -take);
      s.goods[id] = (s.goods[id] ?? 0) + take;
      room -= take;
      moved += take;
    }
    if (moved <= 0) return false;
    pushJuice(state, 'stash.stored', { ...said, goods: moved });
  } else if (actId === 'stash_guard_hire') {
    if (s.guardsHired >= def.guardSlots || carried < (act.coinCost ?? 0)) return false;
    shiftCarriedCoin(state, -(act.coinCost ?? 0));
    s.guardsHired += 1;
    pushJuice(state, 'stash.guard_hired', { ...said, guards: s.guardsHired });
    noteCoinSpend(state, act.coinCost ?? 0);
  } else if (actId === 'stash_withdraw') {
    const goods = totalGoods(s);
    if (s.coin + goods <= 0) return false;
    const coin = s.coin;
    shiftCarriedCoin(state, coin);
    s.coin = 0;
    if (goods > 0) inventoryOf(state);
    for (const g of Object.keys(s.goods).sort()) if (s.goods[g]! > 0) addItem(state, g, s.goods[g]!);
    s.goods = {};
    pushJuice(state, 'stash.withdrawn', { ...said, coin, goods });
  } else return false;
  h.lastStashActDay = state.day;
  notePeakCoin(state);
  return true;
}

/** Someone in the stash's town to carry its news (deterministic: first by id), or the raider who did it. */
function witnessIn(state: SimState, townId: string): string | undefined {
  return Object.keys(state.people).sort().find((id) => state.people[id]!.townId === townId);
}

function note(state: SimState, n: Omit<HoardNews, 'day'>): void {
  (ensureHoard(state).news ??= []).push({ day: state.day, ...n });
}

/** One dawn: decay unguarded goods, then roll theft per site (deriveRng seed|stash|day|site). */
export function tickStashDawn(state: SimState): { lost: string[]; stolen: string[] } {
  const out = { lost: [] as string[], stolen: [] as string[] };
  const h = ensureHoard(state);
  for (const d of siteDefs(state)) {
    const s = h.stash[d.id];
    if (!s) continue;
    // Rot accrues fractionally so a small pile still spoils (decayLoss is the same rate, floored per dawn).
    const goodsBefore = totalGoods(s);
    const owed = goodsBefore * d.decayPerDawn * unguarded(s.guardsHired, d.guardSlots) + (s.decayCarry ?? 0);
    const loss = Math.min(goodsBefore, Math.floor(owed + 1e-9));
    if (goodsBefore > 0) s.decayCarry = Math.max(0, owed - loss);
    else delete s.decayCarry;
    if (loss > 0) {
      let left = loss;
      for (const g of Object.keys(s.goods).sort()) {
        const take = Math.min(left, s.goods[g]!);
        s.goods[g]! -= take;
        left -= take;
        if (s.goods[g]! <= 0) delete s.goods[g];
      }
      out.lost.push(d.id);
      const personId = witnessIn(state, d.townId);
      pushJuice(state, 'stash.decay', { siteId: d.id, townId: d.townId, personId, goods: loss });
      note(state, { kind: 'decay', siteId: d.id, townId: d.townId, personId, goods: loss });
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
    const witness = raider ?? witnessIn(state, d.townId);
    if (witness) enqueueLetter(state, { kind: 'rumor', fromPersonId: witness, outcomeId: 'stash_theft' });
    // The raider is not the one who tells you; a neighbour does.
    const teller = witnessIn(state, d.townId);
    pushJuice(state, 'stash.theft', { siteId: d.id, townId: d.townId, coin: taken, personId: teller });
    note(state, { kind: 'theft', siteId: d.id, townId: d.townId, personId: teller, coin: taken });
    fireNotorietyEvent(state, 'stash_theft', { guards: s.guardsHired, townId: d.townId });
  }
  return out;
}
