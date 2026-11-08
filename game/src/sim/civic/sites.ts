/**
 * The Site registry (civic slice 1): every working place in the live district, one shape for the four
 * staffing models that grew apart (companies, facility crews, build plans, the player's workshops).
 *
 * This is an adapter, not a new owner. `syncSites` rebuilds the registry from what already runs:
 *   - a build plan for a kind in data/civic/sites.json is a site while it is built ('building'), and
 *     the company it founds (state.companies) is that same site once it trades;
 *   - a road facility's crew (state.facilityStaff) is a crew-run site: its foreman is its manager;
 *   - the player's workshops are company sites with the player as manager.
 * Companies stay the store of workers and coin (village-economy and the company sheet read them), so the
 * write helpers here change the company and the site together. What only a site has (its manager, wage,
 * history, the unfed count, "wanted: manager") lives here in `state.civic`, created lazily.
 * Pure + deterministic: no Phaser/DOM.
 */
import sitesJson from '../../data/civic/sites.json';
import { BUILDING_BY_ID, PLAYER_OWNER, type BuildPlan } from '../economy/build-plans';
import { COMPANY, siteIdForPlan, type Company } from '../economy/companies';

export { siteIdForPlan };
import { facilityPlaces } from '../economy/facilities';
import { DISTRICTS, districtId as districtIdOf } from '../map/districts';
import type { SimState } from '../types/runtime';
import { makeLog, makeStore, type ConservationLog, type Store } from './store';

export type SiteKindDef = {
  id: string; name: string; zone: string; tier: string;
  inputs: string[]; outputs: string[]; roles: string[]; fromBuildings: string[]; fromFacilities: string[];
};
type SitesTable = {
  staffing: {
    sickAfterUnfed: number; leaveAfterUnfed: number; unfedDespair: number; wageRaiseAt: number; rehireCooldown: number;
    rationItem: string; historyKeep: number; logKeep: number; closedKeepDays: number; storeCapacity: number; storeSpoilage: number;
  };
  kinds: SiteKindDef[];
};
const T = sitesJson as unknown as SitesTable;
export const CIVIC = T.staffing;
export const SITE_KINDS = T.kinds;
export const SITE_KIND_BY_ID = new Map(SITE_KINDS.map((k) => [k.id, k]));
const BY_BUILDING = new Map(SITE_KINDS.flatMap((k) => k.fromBuildings.map((b) => [b, k] as const)));
const BY_FACILITY = new Map(SITE_KINDS.flatMap((k) => k.fromFacilities.map((f) => [f, k] as const)));
export const kindForBuilding = (buildingId: string): SiteKindDef | undefined => BY_BUILDING.get(buildingId);
export const kindForFacility = (facilityKind: string): SiteKindDef | undefined => BY_FACILITY.get(facilityKind);

export type SiteStatus = 'building' | 'working' | 'idle' | 'standing' | 'closed';
export type SiteSource = { type: 'plan' | 'company' | 'facility'; ref: string };
export type SitePlot = { dx: number; dy: number; w: number; h: number } | { q: number; r: number } | null;
export type SiteEvent = { day: number; what: 'founded' | 'manager' | 'vacant' | 'hired' | 'quit' | 'unfed' | 'sick' | 'closed' | 'wage'; personId?: string; note?: string };

export type Site = {
  id: string; districtId: string; townId: string; kind: string;
  /** The building (buildings.json) or facility kind it stands in. */
  building: string;
  name: string;
  source: SiteSource;
  plot: SitePlot;
  zone: string;
  ownerId: string;
  /** Required for the site to make anything. Absent: idle, and "wanted: manager" is up. */
  managerId?: string;
  workers: string[];
  haulers: string[];
  wage: number;
  coin: number;
  store: Store;
  status: SiteStatus;
  founded: number;
  history: SiteEvent[];
  /** Dawns running each worker went without their ration. */
  unfed?: Record<string, number>;
  /** The day "wanted: manager" went up (the post is filled from the next dawn on). */
  wantedSince?: number;
  /** Who left the post and why (for the wanted line). */
  vacated?: { personId: string; name: string; why: 'died' | 'retired' | 'gone' | 'hungry' | 'unpaid' };
  /** Crew-run sites (road facilities) are kept by facilities.ts; staffing leaves them be. */
  crewRun?: boolean;
  closedDay?: number;
};

export type CivicNews = { day: number; siteId: string; townId: string; kind: 'wanted' | 'promoted' | 'unfed-left' | 'unpaid-left' | 'sick'; personId?: string };
export type CivicState = {
  sites: Record<string, Site>;
  /** Coin moved by the civic loop (wages, rations, draws): every move is between two named places. */
  log: ConservationLog;
  /** `${siteId}|${personId}` -> the day they left (no rehire before rehireCooldown). */
  left: Record<string, number>;
  /** People fallen sick from hunger, and since when. */
  sick: Record<string, number>;
  news: CivicNews[];
};

type WithCivic = SimState & { civic?: CivicState; realm?: { active?: { col: number; row: number } } };
export const civicIfAny = (state: SimState | undefined): CivicState | undefined => (state as WithCivic | undefined)?.civic;
export const civicOf = (state: SimState): CivicState =>
  ((state as WithCivic).civic ??= { sites: {}, log: makeLog(CIVIC.logKeep), left: {}, sick: {}, news: [] });

export const siteIdForFacility = (facilityId: string): string => `site_${facilityId}`;
export const sitesIn = (state: SimState, townId?: string): Site[] =>
  Object.values(civicIfAny(state)?.sites ?? {}).filter((s) => s.status !== 'closed' && (!townId || s.townId === townId)).sort((a, z) => a.id.localeCompare(z.id));
export const siteById = (state: SimState, id: string): Site | undefined => civicIfAny(state)?.sites[id];
export const siteOfCompany = (state: SimState, c: Company): Site | undefined => civicIfAny(state)?.sites[siteIdForPlan(c.planId)];
export const companyOfSite = (state: SimState, s: Site): Company | undefined =>
  s.source.type === 'company' ? state.companies?.list.find((c) => c.id === s.source.ref) : undefined;
export const managedBy = (state: SimState, personId: string): Site[] => sitesIn(state).filter((s) => s.managerId === personId);

const UNFIT = new Set(['retired', 'sick', 'child', 'on_road']);
export const isSick = (state: SimState, id: string): boolean => !!state.people[id]?.tags?.includes('sick');
/**
 * Fit to take a post or be hired: alive, grown, living here, not retired, not sick. The player always is.
 * `holding`: fit to keep one already held, where sickness alone does not cost the post (hunger does,
 * when the unfed leave; see staffing), so one lean week does not empty every post in town.
 */
export function canWork(state: SimState, id: string | undefined, holding = false): id is string {
  if (!id) return false;
  if (id === PLAYER_OWNER) return true;
  const p = state.people[id];
  // Visitors pass through and children are not hired; a post needs someone who lives here.
  return !!p && !!p.townId && (p.age ?? 18) >= 18 && !(p.tags ?? []).some((t) => (UNFIT.has(t) && !(holding && t === 'sick')) || t.startsWith('visitor'));
}

export function remember(site: Site, e: SiteEvent): void {
  site.history.push(e);
  if (site.history.length > CIVIC.historyKeep) site.history.splice(0, site.history.length - CIVIC.historyKeep);
}

const firstName = (state: SimState, id: string): string => {
  if (id === PLAYER_OWNER) return 'Your';
  const n = state.people[id]?.name ?? id.split(/[_-]/)[0] ?? id;
  return (n.split(' ')[0] ?? n).replace(/^./, (ch) => ch.toUpperCase());
};

function activeDistrictId(state: SimState): string {
  const a = (state as WithCivic).realm?.active;
  return a ? districtIdOf(a.col, a.row) : districtIdOf(DISTRICTS.grid.homeCol, DISTRICTS.grid.homeRow);
}

function blank(state: SimState, id: string, kind: SiteKindDef, building: string, source: SiteSource, townId: string, ownerId: string, founded: number): Site {
  return {
    id, districtId: activeDistrictId(state), townId, kind: kind.id, building, name: kind.name, source, plot: null, zone: kind.zone,
    ownerId, workers: [], haulers: [], wage: COMPANY.wage, coin: 0, store: makeStore(CIVIC.storeCapacity, CIVIC.storeSpoilage),
    status: 'building', founded, history: [{ day: founded, what: 'founded', personId: ownerId }],
  };
}

/** Take the manager off a post: the site idles and "wanted: manager" goes up at once. */
export function vacate(state: SimState, site: Site, why: NonNullable<Site['vacated']>['why']): void {
  const id = site.managerId;
  if (!id) return;
  site.managerId = undefined;
  site.vacated = { personId: id, name: state.people[id]?.name ?? id, why };
  site.wantedSince = state.day;
  if (site.status === 'working') site.status = 'idle';
  remember(site, { day: state.day, what: 'vacant', personId: id, note: why });
  const news = civicOf(state).news;
  news.push({ day: state.day, siteId: site.id, townId: site.townId, kind: 'wanted', personId: id });
  if (news.length > 40) news.splice(0, news.length - 40);
}

/** A plan's site (and its company's, once founded). */
function syncPlan(state: SimState, plan: BuildPlan, seen: Set<string>): void {
  const kind = kindForBuilding(plan.kind);
  if (!kind || plan.stage === 'abandoned') return;
  const cv = civicOf(state);
  const id = siteIdForPlan(plan.id);
  const company = state.companies?.list.find((c) => c.planId === plan.id);
  const ownerId = company?.ownerId ?? plan.ownerId;
  const site = (cv.sites[id] ??= blank(state, id, kind, plan.kind, { type: 'plan', ref: plan.id }, plan.townId, ownerId, plan.startDay));
  // A new site starts with its owner running it; after that the post changes hands only by vacancy and promotion.
  if (site.history.length === 1 && !site.managerId && !site.wantedSince && canWork(state, ownerId)) site.managerId = ownerId;
  // Someone who ran another's site and now has their own trading gives the other post up.
  if (company && site.managerId === ownerId && ownerId !== PLAYER_OWNER) {
    for (const other of Object.values(cv.sites)) {
      if (other.id !== id && other.managerId === ownerId && !other.crewRun && other.source.type === 'company' && other.status !== 'closed') vacate(state, other, 'gone');
    }
  }
  site.ownerId = ownerId;
  site.townId = plan.townId;
  const claim = state.build?.claims.find((c) => c.id === plan.claimId);
  if (claim) {
    site.plot = { dx: claim.dx, dy: claim.dy, w: claim.w, h: claim.h };
    // Zoning (a later slice) may tag a claim with its zone; until then the kind's zone stands.
    site.zone = (claim as { zone?: string }).zone ?? kind.zone;
  }
  const def = BUILDING_BY_ID.get(plan.kind);
  if (company) {
    site.source = { type: 'company', ref: company.id };
    site.name = company.name;
    site.workers = [...company.workers];
    site.coin = company.coin;
  } else {
    site.name = `${firstName(state, ownerId)}${ownerId === PLAYER_OWNER ? '' : "'s"} ${def?.name ?? kind.name}`;
    site.workers = [];
  }
  // While it goes up, whoever builds it runs it (the heir, once the land has changed hands).
  // A built house nobody trades from is the owner's to keep likewise.
  if (plan.stage !== 'done' || !company) site.managerId = canWork(state, ownerId, true) ? ownerId : undefined;
  else if (site.managerId && site.managerId !== PLAYER_OWNER && (!canWork(state, site.managerId, true) || state.people[site.managerId]!.townId !== site.townId)) {
    vacate(state, site, state.people[site.managerId]?.tags?.includes('retired') ? 'retired' : 'gone');
  }
  site.status = plan.stage !== 'done' ? 'building' : !company ? 'standing' : site.managerId ? 'working' : 'idle';
  delete site.closedDay;
  seen.add(id);
}

/** A road facility's crew as a crew-run site (facilities.ts deals and restaffs the crew). */
function syncFacilities(state: SimState, seen: Set<string>): void {
  const staff = state.facilityStaff;
  if (!staff) return;
  const places = new Map(facilityPlaces(state).map((p) => [p.id, p]));
  const cv = civicOf(state);
  for (const fid of Object.keys(staff).sort()) {
    const id = siteIdForFacility(fid);
    const place = places.get(fid);
    const kind = place ? kindForFacility(place.kind) : cv.sites[id] ? SITE_KIND_BY_ID.get(cv.sites[id]!.kind) : undefined;
    if (!kind) continue;
    const s = staff[fid]!;
    const crew = s.crew.filter((c): c is string => !!c && !!state.people[c]);
    const townId = place?.townIds[0] ?? cv.sites[id]?.townId ?? state.people[crew[0] ?? '']?.townId;
    if (!townId) continue;
    const site = (cv.sites[id] ??= blank(state, id, kind, place?.kind ?? kind.id, { type: 'facility', ref: fid }, townId, '', state.day));
    site.crewRun = true;
    site.wage = 0;
    site.name = place?.name ?? site.name;
    if (place) site.plot = { q: place.q, r: place.r };
    site.managerId = crew[0];
    site.ownerId = crew[0] ?? '';
    site.workers = crew.slice(1);
    site.status = s.idle || !site.managerId ? 'idle' : 'working';
    delete site.closedDay;
    seen.add(id);
  }
}

/** Rebuild the registry from companies, plans and crews. Idempotent within a day; closed sites linger a while for the board. */
export function syncSites(state: SimState): CivicState {
  const cv = civicOf(state);
  const seen = new Set<string>();
  for (const plan of [...(state.build?.plans ?? [])].sort((a, z) => a.id.localeCompare(z.id))) syncPlan(state, plan, seen);
  syncFacilities(state, seen);
  for (const id of Object.keys(cv.sites).sort()) {
    const s = cv.sites[id]!;
    if (seen.has(id)) continue;
    if (s.status !== 'closed') {
      s.status = 'closed';
      s.closedDay = state.day;
      s.managerId = undefined;
      s.workers = [];
      remember(s, { day: state.day, what: 'closed' });
    } else if (state.day - (s.closedDay ?? state.day) > CIVIC.closedKeepDays) delete cv.sites[id];
  }
  return cv;
}

// ---- Write adapter: a company site's workers and coin live on the company; change both together. ----

export function setWorkers(state: SimState, site: Site, workers: string[]): void {
  site.workers = [...workers];
  const c = companyOfSite(state, site);
  if (c) c.workers = [...workers];
}

/** Move coin between named places and log it. `from`/`to`: `site:<id>` or `purse:<personId>`. Never below zero at the source. */
export function moveCoin(state: SimState, from: string, to: string, qty: number, why: string): number {
  const have = coinAt(state, from);
  const n = Math.min(Math.max(0, qty), Math.max(0, have));
  if (n <= 1e-9) return 0;
  addCoinAt(state, from, -n);
  addCoinAt(state, to, n);
  const log = civicOf(state).log;
  log.entries.push({ day: state.day, from, to, item: 'coin', qty: n, why });
  if (log.entries.length > log.keep) log.entries.splice(0, log.entries.length - log.keep);
  return n;
}

export function coinAt(state: SimState, place: string): number {
  const [kind, id] = [place.slice(0, place.indexOf(':')), place.slice(place.indexOf(':') + 1)];
  if (kind === 'purse') return state.companies?.purse[id] ?? 0;
  const site = siteById(state, id);
  const c = site && companyOfSite(state, site);
  return c ? c.coin : (site?.coin ?? 0);
}

function addCoinAt(state: SimState, place: string, delta: number): void {
  const [kind, id] = [place.slice(0, place.indexOf(':')), place.slice(place.indexOf(':') + 1)];
  if (kind === 'purse') {
    const co = (state.companies ??= { list: [], next: 1, purse: {} });
    co.purse[id] = (co.purse[id] ?? 0) + delta;
    return;
  }
  const site = siteById(state, id);
  if (!site) return;
  const c = companyOfSite(state, site);
  if (c) c.coin += delta;
  site.coin = c ? c.coin : site.coin + delta;
}
