/**
 * Civic tiers: hamlet → village → town → city, judged by population and finished buildings
 * (data/civic/zones.json tiers). A tier unlocks building kinds (granary, market, barracks, town hall):
 * an ambition, the council or the player may stake one only from that tier on. A generated district
 * town counts its founding people (sim/map/districts) when the live sim embodies fewer of them.
 *
 * Sites (civic/sites): every site kind has the tier that unlocks it (data/civic/sites.json), so a building
 * that would open as a site of a higher tier's kind cannot be staked before the town reaches it. A town
 * the site registry has never seen keeps the rules from before sites (the zones table's unlocks only), so
 * old saves read as they did.
 *
 * Growth (zones.json growth): buildings are counted by their claims (a plan's site is its claim, so it is
 * never counted twice), plus each road crew's station at part weight, for the NEARER of its road's two
 * towns. The site registry files a crew under the road's first town, and counting it there in full made a
 * hamlet with five crews on its roads a town on day one. Population counts the households' children too:
 * they live on the household plots, though nobody embodies them until they come of age.
 * Pure, deterministic, no Phaser/DOM. Reads state.build, state.civic and the placed facility rows
 * (state.data.facilities) directly: the site registry's and economy/facilities' values both lead back to
 * build-plans, which imports us, so build-plans can import it.
 */
import sitesJson from '../../data/civic/sites.json';
import type { SimState } from '../types/runtime';
import type { Site } from './sites';
import { districtTown, ZONES } from './zoning';

export type Tier = (typeof ZONES.tiers)[number];
export const TIERS = ZONES.tiers;
export const tierIndex = (id: string | undefined): number => Math.max(0, TIERS.findIndex((t) => t.id === id));

type SiteKindRow = { id: string; zone: string; tier: string; fromBuildings: string[]; fromFacilities: string[] };
const SITE_KINDS = (sitesJson as unknown as { kinds: SiteKindRow[] }).kinds;
const GROWTH = ZONES.growth;
const SITE_KIND_BY_BUILDING = new Map(SITE_KINDS.flatMap((k) => k.fromBuildings.map((b) => [b, k] as const)));

/** The town's sites still standing (closed ones linger for the board only), read without the registry's module. */
export function townSites(state: SimState, townId: string): Site[] {
  const all = (state as SimState & { civic?: { sites?: Record<string, Site> } }).civic?.sites;
  if (!all) return [];
  return Object.values(all).filter((s) => s.townId === townId && s.status !== 'closed').sort((a, z) => a.id.localeCompare(z.id));
}
/**
 * Whether the site registry knows this town at all (any site, even a closed one). A road crew it is
 * credited with (crewTownOf) counts: the tier the crew helps it to and the site gate read the same town.
 */
function hasSites(state: SimState, townId: string): boolean {
  const all = (state as SimState & { civic?: { sites?: Record<string, Site> } }).civic?.sites;
  if (!all) return false;
  const places = placesOf(state);
  return Object.values(all).some((s) => s.townId === townId || (s.crewRun && crewTownOf(state, s, places) === townId));
}

/** A town's own folk (visitors and folk on the road or retired are not counted). */
export function residentsOf(state: SimState, townId: string): string[] {
  return Object.keys(state.people ?? {}).sort().filter((id) => {
    const p = state.people[id]!;
    return p.townId === townId && !id.startsWith('vis_') && !p.tags?.some((t) => t === 'on_road' || t === 'retired');
  });
}

/** The town's households' children not yet grown (they are kin records, not people, until they come of age). */
export const childrenOf = (state: SimState, townId: string): number =>
  (state.kin?.children ?? []).filter((c) => c.townId === townId && c.status === 'child').length;

/** Population for the tier: the residents and their households' children, or a district town's founding people if more. */
export function townPopulation(state: SimState, townId: string): number {
  const live = residentsOf(state, townId).length + GROWTH.child * childrenOf(state, townId);
  return Math.max(live, districtTown(state.seed, townId)?.people ?? 0);
}

type Place = { q: number; r: number; townIds: string[] };
/** Placed road facilities by id (economy/facilities facilityPlaces, read without importing it). */
function placesOf(state: SimState): Map<string, Place> {
  const rows = ((state.data as { facilities?: Array<Partial<Place> & { id: string }> } | undefined)?.facilities ?? []);
  return new Map(rows.filter((f): f is Place & { id: string } => typeof f.q === 'number' && typeof f.r === 'number' && Array.isArray(f.townIds)).map((f) => [f.id, f]));
}
/**
 * The town a road crew's work counts for: the nearer of its road's two. The road's first (where the
 * registry files it) on a tie, or while either town has no place on the map to measure from.
 */
export function crewTownOf(state: SimState, site: Site, places = placesOf(state)): string {
  const place = site.source.type === 'facility' ? places.get(site.source.ref) : undefined;
  if (!place) return site.townId;
  const at = place.townIds.map((id) => ({ id, t: state.towns?.[id] }));
  if (!at.length || at.some(({ t }) => t?.q === undefined || t.r === undefined)) return place.townIds[0] ?? site.townId;
  let best = at[0]!.id, bd = Infinity;
  for (const { id, t } of at) {
    const d = (t!.q! - place.q) ** 2 + (t!.r! - place.r) ** 2;
    if (d < bd) { best = id; bd = d; }
  }
  return best;
}
/** The day a crew's station last opened: its founding, or the day it last reopened after closing. */
const openedOn = (s: Site): number => Math.max(s.founded, ...s.history.filter((e) => e.what === 'closed').map((e) => e.day));

/**
 * Finished buildings: the town's built claims (each site on a plot is one of them), plus the road crews'
 * stations nearest it, at part weight. Floored: the tiers' thresholds are whole buildings, so this changes no
 * tier, and the board reads a whole number.
 */
export function builtCount(state: SimState, townId: string): number {
  const claims = (state.build?.claims ?? []).filter((c) => c.townId === townId && c.status === 'built').length;
  const all = (state as SimState & { civic?: { sites?: Record<string, Site> } }).civic?.sites;
  const places = all ? placesOf(state) : new Map<string, Place>();
  let crews = 0;
  for (const s of Object.values(all ?? {})) {
    // A road station between crews still stands (its crew is dealt again within days): counting only the
    // days a crew is at work made a town flicker between tiers, and each regrowth was news again.
    if (!s.crewRun || s.status === 'closed' || crewTownOf(state, s, places) !== townId) continue;
    // A crew's weight grows with its time on the road (its sheds, its trade), so the crews a world starts
    // with do not make a village on day one.
    crews += Math.min(1, Math.max(0, state.day - openedOn(s)) / Math.max(1, GROWTH.crewRampDays));
  }
  // The epsilon keeps a sum like 0.5 * 3 * (12/36) from flooring a hair short of its whole number.
  return Math.floor(claims + GROWTH.crewSite * crews + 1e-9);
}

/** The town's working places that make anything today: sites with a manager (or a crew) at work. */
export const workingSites = (state: SimState, townId: string): number => townSites(state, townId).filter((s) => s.status === 'working').length;

/** The highest tier whose population and buildings the town meets. */
export function tierOf(state: SimState, townId: string, pop = townPopulation(state, townId), built = builtCount(state, townId)): Tier {
  let best = TIERS[0]!;
  for (const t of TIERS) if (pop >= t.pop && built >= t.built) best = t;
  return best;
}
export const nextTier = (t: Tier): Tier | undefined => TIERS[tierIndex(t.id) + 1];

/** The site kind a building opens as once it trades (undefined: a house, a chapel, a civic work). */
export const siteKindOfBuilding = (kind: string): SiteKindRow | undefined => SITE_KIND_BY_BUILDING.get(kind);
/** The tier a site kind needs (sites.json). */
export const siteTierNeeded = (siteKind: string): Tier | undefined => {
  const row = SITE_KINDS.find((k) => k.id === siteKind);
  return row ? TIERS[tierIndex(row.tier)] : undefined;
};
const stricter = (a: Tier | undefined, b: Tier | undefined): Tier | undefined => (!a ? b : !b ? a : tierIndex(a.id) >= tierIndex(b.id) ? a : b);

/**
 * The tier a kind needs (undefined: any town may raise it): the zones table's unlock, or the tier of the
 * site kind it would open as, whichever is higher.
 */
export const tierNeeded = (kind: string): Tier | undefined => {
  const id = ZONES.unlocks[kind];
  const site = siteKindOfBuilding(kind);
  return stricter(id ? TIERS[tierIndex(id)] : undefined, site ? siteTierNeeded(site.id) : undefined);
};
/** Whether a site kind may be founded here: the town's tier has reached the kind's. */
export const siteKindUnlocked = (state: SimState, townId: string, siteKind: string): boolean => {
  const need = siteTierNeeded(siteKind);
  return !need || tierIndex(tierOf(state, townId).id) >= tierIndex(need.id);
};
export const unlockedIn = (state: SimState, townId: string, kind: string): boolean => {
  const id = ZONES.unlocks[kind];
  const have = tierIndex(tierOf(state, townId).id);
  if (id && have < tierIndex(id)) return false;
  // The site gate holds once the registry knows the town (before that, the rules from before sites).
  const site = siteKindOfBuilding(kind);
  return !site || !hasSites(state, townId) || siteKindUnlocked(state, townId, site.id);
};
/** Kinds the tier unlocks, in table order. */
export const unlocksAt = (tierId: string): string[] => Object.entries(ZONES.unlocks).filter(([, t]) => t === tierId).map(([k]) => k);
/** Site kinds the tier unlocks, in table order (above the hamlet: a hamlet's kinds are there from the start). */
export const siteKindsAt = (tierId: string): string[] => SITE_KINDS.filter((k) => k.tier === tierId && tierIndex(tierId) > 0).map((k) => k.id);
