/**
 * Companies. A finished building with a trade becomes a company: the owner, a coin balance and
 * hired workers. Members work the company's trade at the workshop boost; sales bring in coin;
 * wages go to workers' purses; the owner draws profit. Unpaid workers quit. Idle villagers (no
 * trade of their own to make goods) or ones in the same trade take work. Pure + deterministic.
 */

import { ITEM_BY_ID } from '../goods/inventory';
import { JOBS, jobOf } from '../goods/jobs';
import type { SimState } from '../types/runtime';
import { BUILDING_BY_ID, activePlans } from './build-plans';

export const COMPANY = {
  startCoin: 10,
  wage: 1,
  /** Coin the company must hold per worker-day of wages before it will hire. */
  hireBufferDays: 7,
  /** Share of an output's list price the company earns. */
  revenueShare: 0.4,
  /** Dawns unpaid before a worker leaves. */
  quitAfterUnpaid: 3,
  /** Owner takes this share of coin above the reserve each dawn. */
  ownerDraw: 0.2,
  reserve: 20,
};

export type Company = { id: string; planId: string; name: string; ownerId: string; townId: string; kind: string; workers: string[]; coin: number; founded: number; revenue: number; unpaid: Record<string, number> };
export type Companies = { list: Company[]; next: number; purse: Record<string, number> };

const cs = (state: SimState): Companies => (state.companies ??= { list: [], next: 1, purse: {} });

export const companiesIn = (state: SimState, townId?: string): Company[] => (state.companies?.list ?? []).filter((c) => !townId || c.townId === townId);
export const companyOf = (state: SimState, personId: string): Company | undefined => (state.companies?.list ?? []).find((c) => c.ownerId === personId || c.workers.includes(personId));
export const purseOf = (state: SimState, personId: string): number => state.companies?.purse[personId] ?? 0;
/** The trade a company's building is for (only buildings with worker slots found companies). */
const tradeOf = (c: Company): string => BUILDING_BY_ID.get(c.kind)!.jobs[0]!;

/** What a person actually makes goods as: their company's trade if they work for one, else their own job. */
export function workJobId(state: SimState, personId: string): string {
  const c = companyOf(state, personId);
  return c ? tradeOf(c) : jobOf(state, personId).id;
}

/** Sales: the company earns a share of what its member just made. */
export function creditCompany(state: SimState, personId: string, out: Record<string, number>, mul: number): void {
  const c = companyOf(state, personId);
  if (!c) return;
  const v = Object.entries(out).reduce((n, [item, q]) => n + q * mul * (ITEM_BY_ID.get(item)?.price ?? 0), 0) * COMPANY.revenueShare;
  c.coin += v;
  c.revenue += v;
}

const first = (id: string, state: SimState): string => {
  const n = state.people[id]?.name ?? id.split(/[_-]/)[0] ?? id;
  return (n.split(' ')[0] ?? n).replace(/^./, (ch) => ch.toUpperCase());
};

export function tickCompanies(state: SimState): void {
  const b = state.build;
  if (!b) return;
  const co = cs(state);

  // Found a company when a building with a trade is finished.
  for (const plan of b.plans) {
    if (plan.stage !== 'done' || co.list.some((c) => c.planId === plan.id)) continue;
    const def = BUILDING_BY_ID.get(plan.kind)!;
    if (!def.slots || companyOf(state, plan.ownerId)) continue;
    co.list.push({ id: `co${co.next++}`, planId: plan.id, name: `${first(plan.ownerId, state)}'s ${def.name.replace(/^./, (ch) => ch.toUpperCase())}`, ownerId: plan.ownerId, townId: plan.townId, kind: plan.kind, workers: [], coin: COMPANY.startCoin, founded: state.day, revenue: 0, unpaid: {} });
  }

  const residents = new Map<string, string[]>();
  for (const [id, p] of Object.entries(state.people ?? {})) if (p.townId) (residents.get(p.townId) ?? residents.set(p.townId, []).get(p.townId)!).push(id);
  const hasRecipes = (id: string): boolean => jobOf(state, id).recipes.length > 0;
  const builders = new Set(activePlans(state).map((p) => p.ownerId));

  for (const c of [...co.list].sort((a, z) => a.id.localeCompare(z.id))) {
    const def = BUILDING_BY_ID.get(c.kind)!;
    // Wages: paid in order; workers who go unpaid long enough quit.
    for (const w of [...c.workers]) {
      if (c.coin >= COMPANY.wage) {
        c.coin -= COMPANY.wage;
        co.purse[w] = (co.purse[w] ?? 0) + COMPANY.wage;
        delete c.unpaid[w];
      } else if ((c.unpaid[w] = (c.unpaid[w] ?? 0) + 1) >= COMPANY.quitAfterUnpaid) {
        c.workers = c.workers.filter((x) => x !== w);
        delete c.unpaid[w];
      }
    }
    // Owner draws profit above the reserve.
    if (c.coin > COMPANY.reserve) {
      const draw = Math.floor((c.coin - COMPANY.reserve) * COMPANY.ownerDraw);
      c.coin -= draw;
      co.purse[c.ownerId] = (co.purse[c.ownerId] ?? 0) + draw;
    }
    // Hire one idle or same-trade villager per dawn while there is room and money for a week of wages.
    if (1 + c.workers.length >= def.slots! || c.coin < COMPANY.wage * COMPANY.hireBufferDays * (c.workers.length + 1)) continue;
    const pick = [...(residents.get(c.townId) ?? [])].sort().find((id) =>
      !companyOf(state, id) && !builders.has(id) && (!hasRecipes(id) || def.jobs.includes(jobOf(state, id).id)));
    if (pick) c.workers.push(pick);
  }
}
