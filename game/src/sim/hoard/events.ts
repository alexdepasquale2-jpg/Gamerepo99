/** Event-driven hoarder effects: notoriety triggers (data: notoriety.json triggers), guard upkeep, raid goals. */

import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { addNotoriety } from './notoriety';
import { actDefs, ensureHoard, notorietyTable, shiftCarriedCoin, siteDefs, totalGoods } from './state';

/** Fire every notoriety.json trigger row for `event` whose conditions hold. */
export function fireNotorietyEvent(state: SimState, event: string, ctx: { guards?: number; townId?: string } = {}): void {
  const h = ensureHoard(state);
  for (const row of notorietyTable(state)?.triggers ?? []) {
    if (row.event !== event) continue;
    if (row.attractorId && !(h.attractorsToday?.day === state.day && h.attractorsToday.ids.includes(row.attractorId))) continue;
    if (row.minGuards !== undefined && (ctx.guards ?? 0) < row.minGuards) continue;
    if (row.playerInTown && ctx.townId !== state.player.townId) continue;
    addNotoriety(state, row.gainId);
  }
}

/** Track coin spent today; crossing gain_flash_spend's coinSpendAbove fires the coin_spend event once. */
export function noteCoinSpend(state: SimState, amount: number): void {
  if (amount <= 0) return;
  const h = ensureHoard(state);
  if (h.spend?.day !== state.day) h.spend = { day: state.day, coin: 0 };
  const before = h.spend.coin;
  h.spend.coin += amount;
  const thr = Number(notorietyTable(state)?.gains.find((g) => g.id === 'gain_flash_spend')?.when?.coinSpendAbove ?? Infinity);
  if (before <= thr && h.spend.coin > thr) fireNotorietyEvent(state, 'coin_spend');
}

/** Dawn: each hired guard costs upkeepPerDay (carried coin, then that site's stash); unpaid guards leave (juice only). */
export function tickGuardUpkeep(state: SimState): void {
  const per = actDefs(state).find((a) => a.id === 'stash_guard_hire')?.upkeepPerDay ?? 0;
  const h = ensureHoard(state);
  if (per <= 0) return;
  for (const d of siteDefs(state)) {
    const s = h.stash[d.id];
    if (!s) continue;
    for (let g = s.guardsHired; g > 0; g--) {
      if ((state.player.coin ?? 0) >= per) shiftCarriedCoin(state, -per);
      else if (s.coin >= per) s.coin -= per;
      else {
        s.guardsHired -= 1;
        const personId = Object.keys(state.people).sort().find((id) => state.people[id]!.townId === d.townId);
        pushJuice(state, 'stash.guard_left', { siteId: d.id, townId: d.townId, personId });
        (h.news ??= []).push({ day: state.day, kind: 'guard_left', siteId: d.id, townId: d.townId, personId });
        continue;
      }
      noteCoinSpend(state, per);
    }
  }
}

/**
 * att_rival_hoarder (raidBonus): a deterministic NPC in a stashed town takes a raid goal on that site.
 * The goal is a plain map entry read by the theft roll; it clears on theft or when notoriety falls below the row's minimum.
 */
export function syncRaiders(state: SimState, firedIds: string[]): void {
  const t = notorietyTable(state);
  const h = ensureHoard(state);
  h.attractorsToday = { day: state.day, ids: firedIds };
  const raiders = (h.raiders ??= {});
  const row = t?.attractors.find((a) => a.raidBonus !== undefined);
  if (!row) return;
  for (const siteId of Object.keys(raiders)) if (h.notoriety < row.minNotoriety) delete raiders[siteId];
  if (!firedIds.includes(row.id)) return;
  for (const d of siteDefs(state)) {
    const s = h.stash[d.id];
    if (raiders[d.id] || !s || s.coin + totalGoods(s) <= 0) continue;
    const pool = Object.keys(state.people).sort().filter((id) => state.people[id]!.townId === d.townId);
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(deriveRng(state.seed, 'raider', state.day, d.id).next() * pool.length)]!;
    raiders[d.id] = pick;
    pushJuice(state, 'notoriety.attractor', { attractorId: row.id, siteId: d.id, personId: pick });
    return;
  }
}

/** Extra theft probability from a live raid goal on this site (0 when none). */
export function raidBonus(state: SimState, siteId: string): number {
  const h = ensureHoard(state);
  if (!h.raiders?.[siteId]) return 0;
  return notorietyTable(state)?.attractors.find((a) => a.raidBonus !== undefined)?.raidBonus ?? 0;
}
