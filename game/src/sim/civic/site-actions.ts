/**
 * The player at a site's ledger (civic slice 5): take an empty manager's post, hire and let go hands,
 * set the wage, stock the shelves from the satchel and sell off them at the town's price.
 *
 * Every act here conserves: coin moves between tills, purses and the satchel (each move logged in the
 * civic log), goods between the satchel, the site's store and the town market. The one named source is
 * the market paying for what you sell (`source:market`), the one named sink the market taking the goods.
 * A player's own workshop keeps its rules in economy/workshops (hire / let go go through it); a site the
 * player runs for someone else is paid and fed by civic/staffing like any other, and `afterStaffing`
 * (a dawn tick in contrib/site-verbs) makes the dawn honour what the player chose there.
 * Pure + deterministic: no Phaser/DOM.
 */
import deskJson from '../../data/civic/site-desk.json';
import { BUILDING_BY_ID, PLAYER_OWNER, activePlans } from '../economy/build-plans';
import { COMPANY, companyOf } from '../economy/companies';
import { supplyTown } from '../economy/village-economy';
import { priceAt } from '../goods/deed-goods';
import { addItem, inventoryOf, itemName, removeItem } from '../goods/inventory';
import { consumeInstance } from '../goods/instances';
import { jobOf } from '../goods/jobs';
import { hire as hireInWorkshop, letGo as letGoInWorkshop, roomIn } from '../economy/workshops';
import { deriveRng } from '../rng';
import type { TargetRef } from '../play-session/targets';
import type { SimState } from '../types/runtime';
import {
  CIVIC, canWork, civicIfAny, civicOf, companyOfSite, managedBy, moveCoin, remember, setWorkers, siteById, siteIdForFacility, siteIdForPlan, sitesIn, vacate,
  type Site,
} from './sites';
import { managerFit } from './staffing';
import { put, room, take, total } from './store';

/** The one ring verb at a site (contrib/site-verbs lists it; panels open the ledger sheet on it). */
export const LEDGER_VERB = 'site.ledger';

export const DESK = deskJson as unknown as {
  maxPosts: number; wageMin: number; wageMax: number; underpaidLeave: number; hireList: number; sellStep: number; newsKeep: number;
};

export type DeskResult = { ok: boolean; line: string; /** Who answers in their own voice (a bubble), when someone does. */ speaker?: string };
export type DeskNews = { day: number; siteId: string; townId: string; kind: 'post' | 'resign' | 'underpaid-left' | 'hired' | 'let-go'; personId?: string };
/** What only the player's ledger keeps: the wage they chose per site, and its news. Lazily created. */
export type DeskState = { wage: Record<string, number>; news: DeskNews[] };

type WithDesk = SimState & { siteDesk?: DeskState };
export const deskIfAny = (state: SimState | undefined): DeskState | undefined => (state as WithDesk | undefined)?.siteDesk;
const deskOf = (state: SimState): DeskState => ((state as WithDesk).siteDesk ??= { wage: {}, news: [] });

const no = (line: string): DeskResult => ({ ok: false, line });
const first = (state: SimState, id: string): string => (state.people[id]?.name ?? id).split(' ')[0]!;
const tillOf = (s: Site): string => `site:${s.id}`;

function deskNews(state: SimState, n: Omit<DeskNews, 'day'>): void {
  const d = deskOf(state);
  d.news.push({ day: state.day, ...n });
  if (d.news.length > DESK.newsKeep) d.news.splice(0, d.news.length - DESK.newsKeep);
}

// ---- Reading ----

/** The site a world thing stands for: a plot's plan, a road facility's crew. */
export function siteForTarget(state: SimState, t: TargetRef): Site | undefined {
  if (t.kind === 'plot') {
    const claim = state.build?.claims.find((c) => c.id === t.id);
    return claim ? siteById(state, siteIdForPlan(claim.planId)) : undefined;
  }
  if (t.kind === 'facility') return siteById(state, siteIdForFacility(t.id));
  return undefined;
}

/** The world thing a site's ledger hangs at (the inverse of siteForTarget). */
export function siteTarget(state: SimState, site: Site): TargetRef | null {
  if (site.source.type === 'facility') return { kind: 'facility', id: site.source.ref };
  const planId = site.id.replace(/^site_/, '');
  const claim = state.build?.claims.find((c) => c.planId === planId);
  return claim ? { kind: 'plot', id: claim.id } : null;
}

export const playerRuns = (site: Site): boolean => site.managerId === PLAYER_OWNER;
export const playerOwns = (site: Site): boolean => site.ownerId === PLAYER_OWNER;
/** "Wanted: manager": a trading site with nobody running it. */
export const isWanted = (site: Site): boolean => !site.crewRun && site.source.type === 'company' && !site.managerId && site.status === 'idle';

/** Posts at other folk's sites the player holds now. */
const heldPosts = (state: SimState): Site[] => managedBy(state, PLAYER_OWNER).filter((s) => !playerOwns(s) && !s.crewRun);

/** Why the player cannot take this post, or null when they can. */
export function postRefusal(state: SimState, site: Site): string | null {
  if (site.crewRun) return 'A road crew keeps its own foreman.';
  if (site.managerId) return site.managerId === PLAYER_OWNER ? 'You run it already.' : `${first(state, site.managerId)} runs it.`;
  if (!isWanted(site)) return 'There is no post here to fill.';
  if (state.player.townId !== site.townId) return 'You would have to be in town to run it.';
  if (heldPosts(state).length >= DESK.maxPosts) return `You run ${DESK.maxPosts} places for others already.`;
  return null;
}

/** Room for another hand: a workshop's free slots; at another's site the manager holds one slot too. */
export function roomAt(state: SimState, site: Site): number {
  const c = companyOfSite(state, site);
  if (!c) return 0;
  if (playerOwns(site)) return roomIn(c);
  return Math.max(0, (BUILDING_BY_ID.get(site.building)?.slots ?? 0) - 1 - site.workers.length);
}

export type HireCandidate = { personId: string; fit: number; knowsTrade: boolean };

/**
 * Idle folk in town who could take the work, best fit first (civic/staffing's managerFit: their trade, their
 * flame). Not someone who runs or builds a place, works for any company, or walked out of this one lately.
 */
export function hireCandidatesFor(state: SimState, site: Site, n = DESK.hireList): HireCandidate[] {
  const busy = new Set([...activePlans(state).map((p) => p.ownerId), ...sitesIn(state).flatMap((s) => (s.managerId ? [s.managerId] : []))]);
  const left = civicOf(state).left;
  const jobs = BUILDING_BY_ID.get(site.building)?.jobs ?? [];
  const out: HireCandidate[] = [];
  for (const id of Object.keys(state.people).sort()) {
    const p = state.people[id]!;
    if (p.townId !== site.townId || !canWork(state, id) || busy.has(id) || companyOf(state, id)) continue;
    if (state.day - (left[`${site.id}|${id}`] ?? -Infinity) < CIVIC.rehireCooldown) continue;
    const fit = managerFit(state, site, id);
    out.push({ personId: id, fit, knowsTrade: jobs.includes(jobOf(state, id).id) });
  }
  return out.sort((a, z) => z.fit - a.fit || a.personId.localeCompare(z.personId)).slice(0, n);
}

/** The wage the player set here, else what the site pays now. */
export const wageAt = (state: SimState, site: Site): number => deskIfAny(state)?.wage[site.id] ?? (playerOwns(site) ? COMPANY.wage : site.wage);

// ---- Acting (all through session.act; see contrib/site-verbs) ----

const mustRun = (state: SimState, siteId: string): Site | string => {
  const site = siteById(state, siteId);
  if (!site || site.status === 'closed') return 'That place is gone.';
  if (!playerRuns(site)) return 'Only whoever runs the place can do that.';
  if (site.crewRun) return 'A road crew keeps its own books.';
  return site;
};

export function takePost(state: SimState, siteId: string): DeskResult {
  const site = siteById(state, siteId);
  if (!site) return no('That place is gone.');
  const why = postRefusal(state, site);
  if (why) return no(why);
  site.managerId = PLAYER_OWNER;
  delete site.wantedSince;
  delete site.vacated;
  site.status = 'working';
  remember(site, { day: state.day, what: 'manager', personId: PLAYER_OWNER, note: 'you' });
  deskNews(state, { siteId, townId: site.townId, kind: 'post' });
  const hand = site.workers.find((w) => state.people[w]);
  return { ok: true, line: hand ? `"About time someone did. We'll be at it at first light."` : `You take the post at ${site.name}. The board's notice comes down.`, ...(hand ? { speaker: hand } : {}) };
}

/** Give a post at another's site back: it goes vacant and "wanted: manager" goes up again. */
export function resignPost(state: SimState, siteId: string): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  if (playerOwns(site)) return no('It is your own place; there is nobody to hand it to.');
  vacate(state, site, 'gone');
  delete deskOf(state).wage[siteId];
  deskNews(state, { siteId, townId: site.townId, kind: 'resign' });
  return { ok: true, line: `You give up the post at ${site.name}. The notice goes back on the board.` };
}

export function hireHand(state: SimState, siteId: string, personId: string): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  const c = companyOfSite(state, site);
  if (!c) return no('Nobody trades from here yet.');
  if (playerOwns(site)) {
    const r = hireInWorkshop(state, c.id, personId);
    if (r.ok) {
      site.workers = [...c.workers];
      remember(site, { day: state.day, what: 'hired', personId, note: 'you' });
      deskNews(state, { siteId, townId: site.townId, kind: 'hired', personId });
    }
    return { ...r, ...(r.ok ? { speaker: personId } : {}) };
  }
  if (roomAt(state, site) <= 0) return no('There is no room for another hand.');
  if (!hireCandidatesFor(state, site, Infinity).some((h) => h.personId === personId)) return no(`${first(state, personId)} cannot take the work.`);
  setWorkers(state, site, [...site.workers, personId]);
  delete c.unpaid[personId];
  remember(site, { day: state.day, what: 'hired', personId, note: 'you' });
  deskNews(state, { siteId, townId: site.townId, kind: 'hired', personId });
  return { ok: true, speaker: personId, line: `"${wageAt(state, site)} a day at ${site.name}? I'll be there at first light."` };
}

export function letGoHand(state: SimState, siteId: string, personId: string): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  const c = companyOfSite(state, site);
  if (!c || !site.workers.includes(personId)) return no(`${first(state, personId)} does not work here.`);
  if (playerOwns(site)) {
    const r = letGoInWorkshop(state, c.id, personId);
    if (r.ok) site.workers = [...c.workers];
    if (r.ok) deskNews(state, { siteId, townId: site.townId, kind: 'let-go', personId });
    return { ...r, ...(r.ok ? { speaker: personId } : {}) };
  }
  setWorkers(state, site, site.workers.filter((w) => w !== personId));
  delete c.unpaid[personId];
  delete site.unfed?.[personId];
  // The manager would not take them straight back either (staffing's rehire cooldown reads this).
  civicOf(state).left[`${site.id}|${personId}`] = state.day;
  remember(site, { day: state.day, what: 'quit', personId, note: 'let go' });
  deskNews(state, { siteId, townId: site.townId, kind: 'let-go', personId });
  return { ok: true, speaker: personId, line: '"Fair enough. I\'ll find other work."' };
}

export function setWage(state: SimState, siteId: string, wage: number): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  const w = Math.max(DESK.wageMin, Math.min(DESK.wageMax, Math.round(wage)));
  deskOf(state).wage[siteId] = w;
  site.wage = w;
  remember(site, { day: state.day, what: 'wage', note: String(w) });
  const under = w < COMPANY.wage ? ` Under the going ${COMPANY.wage}, some may walk.` : '';
  return { ok: true, line: `The wage at ${site.name} is ${w} coin a day from the next dawn.${under}` };
}

/** Move what you carry of one good onto the site's shelves (as much as there is room for). */
export function stockSite(state: SimState, siteId: string, itemId: string, qty = Infinity): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  if (itemId === 'coin') return no('Coin goes in the till, not on the shelves.');
  const have = Math.floor(inventoryOf(state)[itemId] ?? 0);
  const n = Math.min(have, Math.floor(room(site.store)), Math.max(0, Math.floor(qty)));
  if (have <= 0) return no(`You carry no ${itemName(itemId).toLowerCase()}.`);
  if (n <= 0) return no('The shelves are full.');
  removeItem(state, itemId, n);
  for (let i = 0; i < n; i++) consumeInstance(state, itemId);
  put(site.store, itemId, n, 'satchel:player', { day: state.day, log: civicOf(state).log, label: `store:${site.id}` });
  return { ok: true, line: `You stock ${n} ${itemName(itemId).toLowerCase()} at ${site.name}.` };
}

/** Sell up to DESK.sellStep of a good off the shelves to the town, each at the town's price as it falls. */
export function sellFromStore(state: SimState, siteId: string, itemId: string, qty = DESK.sellStep): DeskResult {
  const site = mustRun(state, siteId);
  if (typeof site === 'string') return no(site);
  const n = Math.min(Math.floor(total(site.store, itemId)), Math.max(0, Math.floor(qty)));
  if (n <= 0) return no(`There is no ${itemName(itemId).toLowerCase()} on the shelves.`);
  const log = civicOf(state).log;
  let coin = 0;
  for (let i = 0; i < n; i++) {
    const price = priceAt(state, site.townId, itemId);
    take(site.store, itemId, 1, 'sink:market', { day: state.day, log, label: `store:${site.id}` });
    supplyTown(state, site.townId, itemId, 1);
    coin += price;
  }
  creditTill(state, site, coin);
  return { ok: true, line: `Sold ${n} ${itemName(itemId).toLowerCase()} for ${coin} coin, into the till.` };
}

/** The market pays into the till (a named source; the company's takings count it). */
function creditTill(state: SimState, site: Site, coin: number): void {
  if (coin <= 0) return;
  const c = companyOfSite(state, site);
  if (c) { c.coin += coin; c.revenue += coin; site.coin = c.coin; } else site.coin += coin;
  const log = civicOf(state).log;
  log.entries.push({ day: state.day, from: 'source:market', to: tillOf(site), item: 'coin', qty: coin, why: 'sale' });
  if (log.entries.length > log.keep) log.entries.splice(0, log.entries.length - log.keep);
}

// ---- The dawn, after staffing ----

/**
 * Runs after civic/staffing each dawn, for every site the player runs:
 *   - staffing's own manager would have hired a hand this dawn; the player picks their own, so that hire is undone;
 *   - each paid hand gets the wage the player set (the difference moves between till and purse, logged);
 *   - under the going wage, a hand may walk out (seeded per day and hand);
 *   - the player's wage for running another's place, paid to their purse, goes into the satchel;
 *   - the player's own hunger is the satchel's business, not the site's ration count.
 */
export function afterStaffing(state: SimState): void {
  if (!civicIfAny(state)) return;
  const desk = deskIfAny(state);
  for (const site of managedBy(state, PLAYER_OWNER)) {
    if (site.crewRun || site.status === 'closed') continue;
    const c = companyOfSite(state, site);
    if (!c) continue;
    if (!playerOwns(site)) {
      const auto = site.history.filter((e) => e.what === 'hired' && e.day === state.day && e.note !== 'you').map((e) => e.personId);
      if (auto.length) {
        setWorkers(state, site, site.workers.filter((w) => !auto.includes(w)));
        site.history = site.history.filter((e) => !(e.what === 'hired' && e.day === state.day && e.note !== 'you'));
      }
    }
    const chosen = desk?.wage[site.id];
    if (chosen !== undefined) {
      const paidAt = playerOwns(site) ? COMPANY.wage : site.wage;
      const diff = chosen - paidAt;
      for (const id of [...site.workers]) {
        if (c.unpaid[id]) continue;
        if (diff > 0) moveCoin(state, tillOf(site), `purse:${id}`, diff, 'wage');
        else if (diff < 0) moveCoin(state, `purse:${id}`, tillOf(site), -diff, 'wage-set');
      }
      site.wage = chosen;
      if (chosen < COMPANY.wage) underpaidWalk(state, site, COMPANY.wage - chosen);
    }
    delete site.unfed?.[PLAYER_OWNER];
    site.coin = c.coin;
  }
  sweepPlayerPurse(state);
}

function underpaidWalk(state: SimState, site: Site, short: number): void {
  for (const id of [...site.workers]) {
    if (deriveRng(state.seed, 'site-underpaid', state.day, site.id, id).next() >= DESK.underpaidLeave * short) continue;
    const c = companyOfSite(state, site)!;
    setWorkers(state, site, site.workers.filter((w) => w !== id));
    delete c.unpaid[id];
    civicOf(state).left[`${site.id}|${id}`] = state.day;
    remember(site, { day: state.day, what: 'quit', personId: id, note: 'underpaid' });
    deskNews(state, { siteId: site.id, townId: site.townId, kind: 'underpaid-left', personId: id });
  }
}

/** Staffing pays a manager's wage to a purse; the player's purse is their satchel. Whole coins move; a fraction waits. */
function sweepPlayerPurse(state: SimState): void {
  const co = state.companies;
  const n = Math.floor(co?.purse[PLAYER_OWNER] ?? 0);
  if (!co || n <= 0) return;
  co.purse[PLAYER_OWNER] = (co.purse[PLAYER_OWNER] ?? 0) - n;
  addItem(state, 'coin', n);
  const log = civicOf(state).log;
  log.entries.push({ day: state.day, from: `purse:${PLAYER_OWNER}`, to: 'satchel:player', item: 'coin', qty: n, why: 'wage' });
  if (log.entries.length > log.keep) log.entries.splice(0, log.entries.length - log.keep);
}
