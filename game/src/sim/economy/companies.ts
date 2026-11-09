/**
 * Companies. A finished building with a trade becomes a company: the owner, a coin balance and
 * hired workers. Members work the company's trade at the workshop boost; sales bring in coin;
 * wages go to workers' purses; the owner draws profit. Unpaid workers quit. Idle villagers (no
 * trade of their own to make goods) or ones in the same trade take work.
 *
 * Civic sites (sim/civic) wrap companies: an NPC company's manager, wages, rations, quitting and hiring
 * run in civic/staffing.ts at the people slot. This file founds companies, credits sales and pays the
 * player's own workshop hands. A company whose site has no manager makes nothing: its hands go back to
 * their own trade and it earns no sales until the post is filled. Pure + deterministic.
 */

import { ITEM_BY_ID, addItem, inventoryOf } from '../goods/inventory';
import { jobOf } from '../goods/jobs';
import type { SimState } from '../types/runtime';
import { BUILDING_BY_ID, PLAYER_OWNER } from './build-plans';
import { firstNameOf } from '../names';

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

export type Company = {
  id: string; planId: string; name: string; ownerId: string; townId: string; kind: string; workers: string[]; coin: number; founded: number; revenue: number; unpaid: Record<string, number>;
  /** Player-owned only: takings at the last dawn, revenue counted then, and what workers said about wages (told at dawn). */
  yesterday?: number; revenueSeen?: number; news?: WageNews[];
};
export type WageNews = { day: number; personId: string; kind: 'unpaid' | 'quit'; days: number };
export type Companies = { list: Company[]; next: number; purse: Record<string, number> };

const cs = (state: SimState): Companies => (state.companies ??= { list: [], next: 1, purse: {} });

export const companiesIn = (state: SimState, townId?: string): Company[] => (state.companies?.list ?? []).filter((c) => !townId || c.townId === townId);
/** Id of the civic site for a build plan and the company it founds (the one place this key is spelled). */
export const siteIdForPlan = (planId: string): string => `site_${planId}`;
/** The civic site wrapping a company (sim/civic/sites; read inline so the economy does not import the civic layer). */
const siteOf = (state: SimState, c: Company): { managerId?: string } | undefined =>
  (state as { civic?: { sites: Record<string, { managerId?: string }> } }).civic?.sites[siteIdForPlan(c.planId)];
/** A company makes and sells only while someone runs it. Saves from before sites (no registry yet) always do. */
export const companyManaged = (state: SimState, c: Company): boolean => { const s = siteOf(state, c); return !s || !!s.managerId; };
export const companyOf = (state: SimState, personId: string): Company | undefined =>
  (state.companies?.list ?? []).find((c) => c.ownerId === personId || c.workers.includes(personId) || siteOf(state, c)?.managerId === personId);
export const purseOf = (state: SimState, personId: string): number => state.companies?.purse[personId] ?? 0;
/** The trade a company's building is for (only buildings with worker slots found companies). */
const tradeOf = (c: Company): string => BUILDING_BY_ID.get(c.kind)!.jobs[0]!;

/** What a person actually makes goods as: their company's trade if they work for one, else their own job. */
export function workJobId(state: SimState, personId: string): string {
  const c = companyOf(state, personId);
  return c && companyManaged(state, c) ? tradeOf(c) : jobOf(state, personId).id;
}

/** Sales: the company earns a share of what its member just made. */
export function creditCompany(state: SimState, personId: string, out: Record<string, number>, mul: number): void {
  const c = companyOf(state, personId);
  if (!c || !companyManaged(state, c)) return;
  const v = Object.entries(out).reduce((n, [item, q]) => n + q * mul * (ITEM_BY_ID.get(item)?.price ?? 0), 0) * COMPANY.revenueShare;
  c.coin += v;
  c.revenue += v;
}

const first = (id: string, state: SimState): string => {
  const n = state.people[id]?.name ?? id.split(/[_-]/)[0] ?? id;
  return (firstNameOf(n) ?? n).replace(/^./, (ch) => ch.toUpperCase());
};

export function tickCompanies(state: SimState): void {
  const b = state.build;
  if (!b) return;
  const co = cs(state);

  // Found a company when a building with a trade is finished.
  for (const plan of b.plans) {
    if (plan.stage !== 'done' || co.list.some((c) => c.planId === plan.id)) continue;
    const def = BUILDING_BY_ID.get(plan.kind)!;
    const mine = plan.ownerId === PLAYER_OWNER;
    // One company per NPC owner or hand. Running someone else's site does not stop a person founding their own
    // (they give that post up once theirs opens; civic/sites).
    if (!def.slots || (!mine && co.list.some((c) => c.ownerId === plan.ownerId || c.workers.includes(plan.ownerId)))) continue;
    co.list.push({ id: `co${co.next++}`, planId: plan.id, name: mine ? `Your ${def.name}` : `${first(plan.ownerId, state)}'s ${def.name.replace(/^./, (ch) => ch.toUpperCase())}`, ownerId: plan.ownerId, townId: plan.townId, kind: plan.kind, workers: [], coin: COMPANY.startCoin, founded: state.day, revenue: 0, unpaid: {} });
  }

  // Player workshops pay here; every NPC company is paid, fed and staffed by civic/staffing.ts.
  for (const c of [...co.list].sort((a, z) => a.id.localeCompare(z.id))) if (c.ownerId === PLAYER_OWNER) payPlayerWages(state, c);
}

/**
 * The player's workshop at dawn: wages come out of the till, then out of the player's own coin. A worker
 * who goes unpaid says so; unpaid `quitAfterUnpaid` dawns running, they leave and say that too. The player
 * hires and lets go by hand (economy/workshops) and takes the takings from the till themselves.
 */
function payPlayerWages(state: SimState, c: Company): void {
  c.yesterday = Math.max(0, c.revenue - (c.revenueSeen ?? c.revenue));
  c.revenueSeen = c.revenue;
  const news = (c.news ?? []).filter((n) => state.day - n.day < 7);
  for (const w of [...c.workers]) {
    if (!state.people[w]) { c.workers = c.workers.filter((x) => x !== w); delete c.unpaid[w]; continue; }
    const purse = Math.max(0, inventoryOf(state).coin ?? 0);
    if (Math.max(0, c.coin) + purse >= COMPANY.wage) {
      const fromTill = Math.min(COMPANY.wage, Math.max(0, c.coin));
      c.coin -= fromTill;
      if (COMPANY.wage - fromTill > 0) addItem(state, 'coin', -(COMPANY.wage - fromTill));
      const co = state.companies!;
      co.purse[w] = (co.purse[w] ?? 0) + COMPANY.wage;
      delete c.unpaid[w];
      continue;
    }
    const days = (c.unpaid[w] = (c.unpaid[w] ?? 0) + 1);
    if (days >= COMPANY.quitAfterUnpaid) {
      c.workers = c.workers.filter((x) => x !== w);
      delete c.unpaid[w];
      news.push({ day: state.day, personId: w, kind: 'quit', days });
    } else news.push({ day: state.day, personId: w, kind: 'unpaid', days });
  }
  c.news = news.slice(-12);
}
