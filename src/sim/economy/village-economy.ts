/**
 * Village economy: per-town goods ledger. Each dawn villagers produce and process by job,
 * households eat and wear things out, and unmet demand is recorded as shortage (drives price,
 * and later build plans). Phase 2 only records shortage; it does not touch despair or spark.
 * Pure + deterministic (seed + day + person id).
 */

import { JOBS, jobOf } from '../goods/jobs';
import { workshopMul } from './build-plans';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

export type TownLedger = {
  goods: Record<string, number>;
  /** Units wanted per dawn, set at dawn. */
  need: Record<string, number>;
  /** Units wanted but missing at the last dawn. */
  short: Record<string, number>;
};
export type VillageEconomy = { towns: Record<string, TownLedger> };

/** Per-person demand per dawn. Food is a pool (any food item fills it); the rest are single goods. */
export const HOUSEHOLD = {
  food: { perPerson: 0.25, eats: ['bread', 'fish', 'berries', 'grain'] },
  goods: { wood: 0.1, tools: 0.02, cloth: 0.03, pots: 0.02, rope: 0.01, nails: 0.02 } as Record<string, number>,
};
/** Days of cover below which price starts to rise. */
export const COVER_DAYS = 3;

const ledgerOf = (state: SimState, townId: string): TownLedger => {
  const ve = (state.villageEconomy ??= { towns: {} });
  return (ve.towns[townId] ??= { goods: {}, need: {}, short: {} });
};

/** Add goods to a town's ledger (player gifts and sales, deliveries). */
export function supplyTown(state: SimState, townId: string, itemId: string, qty: number): void {
  if (!townId || qty <= 0) return;
  const g = ledgerOf(state, townId).goods;
  g[itemId] = (g[itemId] ?? 0) + qty;
}

/** 0..1: how short a town is of an item, from days of cover. 0 when the town does not need it. */
export function scarcity(state: SimState, townId: string, itemId: string): number {
  const l = state.villageEconomy?.towns[townId];
  const food = HOUSEHOLD.food.eats.includes(itemId);
  const need = (food ? l?.need.food : l?.need[itemId]) ?? 0;
  if (!l || need <= 0) return 0;
  const have = food ? HOUSEHOLD.food.eats.reduce((n, i) => n + (l.goods[i] ?? 0), 0) : (l.goods[itemId] ?? 0);
  return Math.min(1, Math.max(0, (COVER_DAYS - have / need) / COVER_DAYS));
}

/** What a town is short of, biggest gap first. For planning and the needs board. */
export function townNeeds(state: SimState, townId: string): { itemId: string; short: number }[] {
  const s = state.villageEconomy?.towns[townId]?.short ?? {};
  return Object.entries(s).filter(([, q]) => q > 0).map(([itemId, short]) => ({ itemId, short })).sort((a, b) => b.short - a.short || a.itemId.localeCompare(b.itemId));
}

export function tickVillageEconomy(state: SimState): void {
  const byTown = new Map<string, string[]>();
  for (const [id, p] of Object.entries(state.people ?? {})) {
    if (!p.townId) continue;
    (byTown.get(p.townId) ?? byTown.set(p.townId, []).get(p.townId)!).push(id);
  }
  for (const [townId, ids] of [...byTown].sort(([a], [b]) => a.localeCompare(b))) {
    ids.sort();
    const l = ledgerOf(state, townId);
    const g = l.goods;
    // Produce and process: JOBS order puts raw jobs before the processors that use their output.
    const rolls = new Map(ids.map((id) => [id, deriveRng(state.seed, 'prod', state.day, id)]));
    for (const job of JOBS) {
      for (const id of ids) {
        if (jobOf(state, id).id !== job.id) continue;
        const rng = rolls.get(id)!;
        const mul = workshopMul(state, townId, job.id);
        for (const r of job.recipes) {
          if (r.chance !== undefined && rng.next() >= r.chance) continue;
          const inputs = Object.entries(r.in ?? {});
          if (inputs.some(([item, q]) => (g[item] ?? 0) < q)) continue;
          for (const [item, q] of inputs) g[item] = (g[item] ?? 0) - q;
          for (const [item, q] of Object.entries(r.out)) g[item] = (g[item] ?? 0) + q * mul;
        }
      }
    }
    // Consume: households eat, then wear things out. Shortage is what was wanted and not there.
    l.need = {}; l.short = {};
    const pop = ids.length;
    let food = pop * HOUSEHOLD.food.perPerson;
    l.need.food = food;
    for (const item of HOUSEHOLD.food.eats) {
      const take = Math.min(food, g[item] ?? 0);
      g[item] = (g[item] ?? 0) - take;
      food -= take;
    }
    if (food > 1e-9) l.short.food = food;
    for (const [item, per] of Object.entries(HOUSEHOLD.goods)) {
      const want = pop * per;
      const take = Math.min(want, g[item] ?? 0);
      g[item] = (g[item] ?? 0) - take;
      l.need[item] = want;
      if (want - take > 1e-9) l.short[item] = want - take;
    }
  }
}
