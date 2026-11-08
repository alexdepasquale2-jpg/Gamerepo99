/**
 * Village economy: per-town goods ledger. Each dawn villagers produce and process by job,
 * households eat and wear things out, and unmet demand is recorded as shortage (drives price,
 * and build plans). The food pool here is the town's one food stock (food-stock.ts): despair's starve
 * check reads it at the next dawn. Nothing here touches despair or spark directly.
 *
 * Since civic slice 3 the goods sit in stores (civic/town-stores): a hand at a site makes onto its
 * shelves and works inputs from them and the town depots; everyone else makes into the depots; households
 * eat from anywhere in town. `goods` is the view summed from those stores, kept current by every write.
 * Pure + deterministic (seed + day + person id).
 */

import { JOBS } from '../goods/jobs';
import { companyManaged, companyOf, creditCompany, siteIdForPlan, workJobId } from './companies';
import { drawStores, openTown, produce, reachable, supplyStores, useInput } from '../civic/town-stores';
import type { Site } from '../civic/sites';
import { workshopMul } from './build-plans';
import { polityMul } from './polity';
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

/** Add goods to a town (player gifts and sales, deliveries): into its granary or storehouse; the ledger shows them. */
export function supplyTown(state: SimState, townId: string, itemId: string, qty: number): void {
  if (!townId || qty <= 0) return;
  ledgerOf(state, townId);
  supplyStores(state, townId, itemId, qty);
}

/** The site whose shelves a person makes onto: their company's, while someone runs it and it trades in this town. */
function workSite(state: SimState, personId: string, townId: string): Site | undefined {
  const c = companyOf(state, personId);
  if (!c || c.townId !== townId || !companyManaged(state, c)) return undefined;
  const s = (state as { civic?: { sites: Record<string, Site> } }).civic?.sites[siteIdForPlan(c.planId)];
  return s && s.townId === townId && s.status !== 'closed' ? s : undefined;
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
    openTown(state, townId);
    // Produce and process: JOBS order puts raw jobs before the processors that use their output.
    const rolls = new Map(ids.map((id) => [id, deriveRng(state.seed, 'prod', state.day, id)]));
    const sites = new Map(ids.map((id) => [id, workSite(state, id, townId)]));
    for (const job of JOBS) {
      for (const id of ids) {
        if (workJobId(state, id) !== job.id) continue;
        const rng = rolls.get(id)!;
        const site = sites.get(id);
        const mul = workshopMul(state, townId, job.id) * polityMul(state, townId, job.id);
        for (const r of job.recipes) {
          if (r.chance !== undefined && rng.next() >= r.chance) continue;
          const inputs = Object.entries(r.in ?? {});
          // A hand works what is on their own shelves or in the town's stores, not another site's.
          if (inputs.some(([item, q]) => reachable(state, townId, site, item) < q - 1e-9)) continue;
          for (const [item, q] of inputs) useInput(state, townId, site, item, q);
          for (const [item, q] of Object.entries(r.out)) produce(state, townId, site, item, q * mul);
          creditCompany(state, id, r.out, mul);
        }
      }
    }
    // Consume: households eat, then wear things out. Shortage is what was wanted and not there.
    l.need = {}; l.short = {};
    // Children eat and wear things out too, at half an adult's rate.
    const pop = ids.length + 0.5 * (state.kin?.children ?? []).filter((c) => c.status === 'child' && c.townId === townId).length;
    let food = pop * HOUSEHOLD.food.perPerson;
    l.need.food = food;
    // Households buy anywhere in town: the granary, or at the farm gate off a site's shelves.
    for (const item of HOUSEHOLD.food.eats) food -= drawStores(state, townId, item, food, 'sink:eaten');
    if (food > 1e-9) l.short.food = food;
    for (const [item, per] of Object.entries(HOUSEHOLD.goods)) {
      const want = pop * per;
      const take = drawStores(state, townId, item, want, 'sink:worn');
      l.need[item] = want;
      if (want - take > 1e-9) l.short[item] = want - take;
    }
  }
}
