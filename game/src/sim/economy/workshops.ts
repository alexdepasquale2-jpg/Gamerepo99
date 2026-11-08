/**
 * Player workshops (F20). The player stakes a plot for a building with a trade, brings or buys its goods,
 * lends a hand with the building work, and owns the finished building's company (ownerId PLAYER_OWNER).
 * The player hires and lets go workers by hand; wages (COMPANY.wage a dawn each) come out of the till,
 * then out of the player's coin (companies.ts payPlayerWages). Workers unpaid long enough walk out and
 * say so at dawn. Shared by the ring verbs (contrib/workshops) and the company sheet (panels/company).
 * Pure + deterministic.
 */

import { priceAt } from '../goods/deed-goods';
import { addItem, hasItem, inventoryOf, itemName } from '../goods/inventory';
import { jobOf } from '../goods/jobs';
import type { SimState } from '../types/runtime';
import { BUILDINGS, BUILDING_BY_ID, PLAYER_OWNER, activePlans, findPlot, type BuildPlan, type BuildingDef } from './build-plans';
import { COMPANY, companyOf, type Company } from './companies';

export const WORKSHOPS = {
  /** Plans the player may have under way in one town at once. */
  plansPerTown: 1,
  /** Building work one helping hand adds (once a day). */
  lendLabor: 2,
  /** Coin a "put coin in the till" adds. */
  payInStep: 5,
};

export type Result = { ok: boolean; line: string };
const no = (line: string): Result => ({ ok: false, line });
const lc = (s: string): string => s.toLowerCase();
const firstName = (state: SimState, id: string): string => (state.people[id]?.name ?? id).split(' ')[0]!;

/** Buildings the player can found a workshop in: those with a trade and worker room. */
export const workshopKinds = (): BuildingDef[] => BUILDINGS.filter((b) => (b.slots ?? 0) > 0);

export const playerPlans = (state: SimState, townId?: string): BuildPlan[] => activePlans(state, townId).filter((p) => p.ownerId === PLAYER_OWNER);
export const playerCompanies = (state: SimState, townId?: string): Company[] =>
  (state.companies?.list ?? []).filter((c) => c.ownerId === PLAYER_OWNER && (!townId || c.townId === townId));
export const companyById = (state: SimState, id: string): Company | undefined => state.companies?.list.find((c) => c.id === id);

/** The player's plan on a plot (a claim id), if it is still under way. */
export function planOnClaim(state: SimState, claimId: string): BuildPlan | undefined {
  return playerPlans(state).find((p) => p.claimId === claimId);
}
/** The player's company in the building on a plot. */
export function companyOnClaim(state: SimState, claimId: string): Company | undefined {
  const claim = state.build?.claims.find((c) => c.id === claimId);
  return claim?.ownerId === PLAYER_OWNER ? playerCompanies(state).find((c) => c.planId === claim.planId) : undefined;
}

/** Hired workers the company has room for (the player owns it but does not work in it). */
export const roomIn = (c: Company): number => Math.max(0, (BUILDING_BY_ID.get(c.kind)?.slots ?? 0) - c.workers.length);

/** Stake a plot near the town centre and start a plan for this kind of building. */
export function stakeWorkshop(state: SimState, townId: string, kind: string): Result & { claimId?: string } {
  const def = BUILDING_BY_ID.get(kind);
  if (!def?.slots) return no('Nobody could work in that.');
  if (!state.towns?.[townId]) return no('There is no town here to build in.');
  if (playerPlans(state, townId).length >= WORKSHOPS.plansPerTown) return no('Finish the build you have going here first.');
  const plot = findPlot(state, townId, def.w, def.h);
  if (!plot) return no('There is no free plot left near the town.');
  const b = (state.build ??= { plans: [], claims: [], next: 1 });
  const planId = `plan${b.next++}`, claimId = `claim${b.next++}`;
  b.claims.push({ id: claimId, planId, ownerId: PLAYER_OWNER, townId, dx: plot.dx, dy: plot.dy, w: def.w, h: def.h, kind, status: 'claimed' });
  b.plans.push({ id: planId, ownerId: PLAYER_OWNER, townId, kind, claimId, stage: 'gathering', have: {}, laborDone: 0, startDay: state.day, stalledDays: 0 });
  return { ok: true, claimId, line: `You stake a plot for a ${def.name}. It needs ${costText(def.cost)}.` };
}

const costText = (cost: Record<string, number>): string => Object.entries(cost).map(([i, q]) => `${q} ${lc(itemName(i))}`).join(', ');

/** What a plan still lacks. */
export function missingFor(plan: BuildPlan): { itemId: string; qty: number }[] {
  const def = BUILDING_BY_ID.get(plan.kind);
  if (!def || plan.stage !== 'gathering') return [];
  return Object.entries(def.cost).map(([itemId, q]) => ({ itemId, qty: Math.max(0, q - (plan.have[itemId] ?? 0)) })).filter((m) => m.qty > 0);
}

/** What the town can sell toward a plan right now, at its prices. */
export function materialsOffer(state: SimState, plan: BuildPlan): { itemId: string; qty: number; price: number }[] {
  const g = state.villageEconomy?.towns[plan.townId]?.goods ?? {};
  return missingFor(plan).flatMap((m) => {
    const qty = Math.min(m.qty, Math.floor(g[m.itemId] ?? 0));
    return qty > 0 ? [{ itemId: m.itemId, qty, price: priceAt(state, plan.townId, m.itemId) }] : [];
  });
}

/** Bring what the player carries that the plan needs. */
export function bringGoods(state: SimState, claimId: string): Result {
  const plan = planOnClaim(state, claimId);
  if (!plan || plan.stage !== 'gathering') return no('Nothing more is needed on this plot.');
  const got: string[] = [];
  for (const m of missingFor(plan)) {
    const n = Math.min(m.qty, Math.max(0, inventoryOf(state)[m.itemId] ?? 0));
    if (n <= 0) continue;
    addItem(state, m.itemId, -n);
    plan.have[m.itemId] = (plan.have[m.itemId] ?? 0) + n;
    got.push(`${n} ${lc(itemName(m.itemId))}`);
  }
  if (!got.length) return no(`You carry nothing it needs. It wants ${costText(Object.fromEntries(missingFor(plan).map((m) => [m.itemId, m.qty])))}.`);
  const ready = settle(plan);
  return { ok: true, line: `You stack ${got.join(', ')} on the plot.${ready ? ' Everything is here: the building can go up.' : ''}` };
}

/** Buy what the town has of the missing goods, one unit at a time while the coin lasts. */
export function buyMaterials(state: SimState, claimId: string): Result {
  const plan = planOnClaim(state, claimId);
  if (!plan || plan.stage !== 'gathering') return no('Nothing more is needed on this plot.');
  const offer = materialsOffer(state, plan);
  if (!offer.length) return no('The town has none of what the plot still needs.');
  const g = state.villageEconomy!.towns[plan.townId]!.goods;
  let spent = 0;
  const got: string[] = [];
  for (const o of offer) {
    let n = 0;
    while (n < o.qty && hasItem(state, 'coin', o.price)) { addItem(state, 'coin', -o.price); spent += o.price; n++; }
    if (!n) continue;
    g[o.itemId] = (g[o.itemId] ?? 0) - n;
    plan.have[o.itemId] = (plan.have[o.itemId] ?? 0) + n;
    got.push(`${n} ${lc(itemName(o.itemId))}`);
  }
  if (!got.length) return no(`You need ${offer[0]!.price} coin for even one ${lc(itemName(offer[0]!.itemId))}.`);
  const ready = settle(plan);
  return { ok: true, line: `You buy ${got.join(', ')} for ${spent} coin.${ready ? ' Everything is here: the building can go up.' : ''}` };
}

/** Lend a hand with the building work (once a day). */
export function lendHand(state: SimState, claimId: string): Result {
  const plan = planOnClaim(state, claimId);
  if (!plan || plan.stage !== 'building') return no('There is no building work to do here yet.');
  const flags = state.flags as { workshopHandDay?: number };
  if (flags.workshopHandDay === state.day) return no('You have done your share today.');
  flags.workshopHandDay = state.day;
  const def = BUILDING_BY_ID.get(plan.kind)!;
  plan.laborDone += WORKSHOPS.lendLabor;
  const left = Math.max(0, def.labor - plan.laborDone);
  return { ok: true, line: left > 0 ? `You raise posts and carry beams. About ${left} more days of work.` : 'The last beam goes up. It will stand by morning.' };
}

/** Give up a plot still gathering goods: what was stacked comes back to the satchel. */
export function abandonPlot(state: SimState, claimId: string): Result {
  const plan = planOnClaim(state, claimId);
  if (!plan || plan.stage !== 'gathering') return no('This build is past giving up.');
  for (const [i, q] of Object.entries(plan.have)) if (q > 0) addItem(state, i, q);
  plan.stage = 'abandoned';
  const b = state.build!;
  b.claims = b.claims.filter((c) => c.id !== plan.claimId);
  return { ok: true, line: 'You pull up the stakes and take back what you stacked.' };
}

/** All goods in: the plan moves on to building. True when it did. */
function settle(plan: BuildPlan): boolean {
  if (missingFor(plan).length) return false;
  plan.stage = 'building';
  return true;
}

// ---- Workers ----

/** Can this person take work in the player's company? */
export function canHire(state: SimState, c: Company, personId: string): boolean {
  const p = state.people[personId];
  if (!p || p.townId !== c.townId || roomIn(c) <= 0) return false;
  if (companyOf(state, personId)) return false;
  return !activePlans(state).some((x) => x.ownerId === personId);
}

/** Residents who could take the work, the trade's own people and the idle first. */
export function hireCandidates(state: SimState, c: Company): string[] {
  const def = BUILDING_BY_ID.get(c.kind)!;
  const score = (id: string): number => (def.jobs.includes(jobOf(state, id).id) ? 0 : jobOf(state, id).recipes.length ? 2 : 1);
  return Object.keys(state.people).filter((id) => canHire(state, c, id)).sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

/** The player company in this person's town with room for them (for the person verb). */
export function companyHiring(state: SimState, personId: string): Company | undefined {
  return playerCompanies(state, state.people[personId]?.townId).find((c) => canHire(state, c, personId));
}
/** The player company this person works in. */
export function employerOf(state: SimState, personId: string): Company | undefined {
  return playerCompanies(state).find((c) => c.workers.includes(personId));
}

export function hire(state: SimState, companyId: string, personId: string): Result {
  const c = companyById(state, companyId);
  if (!c || c.ownerId !== PLAYER_OWNER) return no('That is not your workshop.');
  if (!canHire(state, c, personId)) return no(roomIn(c) <= 0 ? 'There is no room for another worker.' : `${firstName(state, personId)} cannot take the work.`);
  c.workers.push(personId);
  delete c.unpaid[personId];
  return { ok: true, line: `"A wage of ${COMPANY.wage} a day? I'll be at the ${BUILDING_BY_ID.get(c.kind)!.name} at first light."` };
}

export function letGo(state: SimState, companyId: string, personId: string): Result {
  const c = companyById(state, companyId);
  if (!c || !c.workers.includes(personId)) return no(`${firstName(state, personId)} does not work for you.`);
  c.workers = c.workers.filter((w) => w !== personId);
  const owed = c.unpaid[personId] ?? 0;
  delete c.unpaid[personId];
  return { ok: true, line: owed > 0 ? `"And the ${owed} day${owed === 1 ? '' : 's'} you owe me? Never mind. I'll manage."` : '"Fair enough. I\'ll find other work."' };
}

/** Move the till's coin into the player's satchel. */
export function takeTakings(state: SimState, companyId: string): Result {
  const c = companyById(state, companyId);
  if (!c || c.ownerId !== PLAYER_OWNER) return no('That is not your workshop.');
  const n = Math.floor(Math.max(0, c.coin));
  if (n <= 0) return no('The till is empty.');
  c.coin -= n;
  addItem(state, 'coin', n);
  return { ok: true, line: `You take ${n} coin from the till.` };
}

/** Put coin from the satchel into the till, for wages. */
export function payIn(state: SimState, companyId: string, n = WORKSHOPS.payInStep): Result {
  const c = companyById(state, companyId);
  if (!c || c.ownerId !== PLAYER_OWNER) return no('That is not your workshop.');
  const amt = Math.min(n, Math.floor(Math.max(0, inventoryOf(state).coin ?? 0)));
  if (amt <= 0) return no('You have no coin to put in.');
  addItem(state, 'coin', -amt);
  c.coin += amt;
  return { ok: true, line: `You put ${amt} coin in the till.` };
}

/** Wages the company owes each dawn, and how many dawns the till and the player's coin cover. */
export function wageCover(state: SimState, c: Company): { perDawn: number; dawns: number } {
  const perDawn = c.workers.length * COMPANY.wage;
  const funds = Math.max(0, c.coin) + Math.max(0, inventoryOf(state).coin ?? 0);
  return { perDawn, dawns: perDawn > 0 ? Math.floor(funds / perDawn) : Infinity };
}
