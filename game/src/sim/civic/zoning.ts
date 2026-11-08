/**
 * Zoning: every town's plot cells (economy/build-plans findPlot, rings around the centre) fall into 16
 * lots, 8 compass sectors times an inner and an outer band. Each lot has a zone (farm, craft, market,
 * civic, housing): by default from the town's kind, turned so the market sits on the town plan's main
 * street, with one seeded swap so no two towns read alike. The council can re-zone a lot (an override
 * kept on the town's civic record); claims already standing keep their ground, new ones must fit.
 * Also the civic record itself (tax, treasury, news) and the council's two pure choices: which lot to
 * give a wanted zone, and where to set the tax. Who the council is lives with the caller (contrib).
 * Pure, deterministic (deriveRng), no Phaser/DOM; imports no build-plans values (it imports us).
 */
import zonesJson from '../../data/civic/zones.json';
import { districtOfTown, realm, DISTRICTS } from '../map/districts';
import { townPlan } from '../map/town-plan';
import { settlementKind, type SettlementKind } from '../map/world-layout';
import type { DistrictTown } from '../map/districts';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

export type ZoneId = 'farm' | 'craft' | 'market' | 'civic' | 'housing';
type Layout = { inner: ZoneId[]; outer: ZoneId[] };
type BuildingRow = { id: string; name: string; jobs: string[]; cost: Record<string, number>; labor: number; w: number; h: number; slots?: number };
type Council = {
  chance: number; minGap: number; raiseChance: number; crowd: number; maxLaborPerDawn: number; leaderRaises: string[];
  taxStart: number; taxMin: number; taxMax: number; taxStep: number; despairHigh: number; wagePerLabor: number;
  petitionGap: number; petitionHours: number; petitionBase: number; petitionStanding: number; newsKeep: number;
};
type Table = {
  zones: { id: ZoneId; name: string }[];
  innerMaxRing: number; sectorNames: string[]; axisTurn: Record<string, number>;
  layouts: Record<SettlementKind, Layout>;
  buildingZone: Record<string, ZoneId>;
  tiers: { id: string; name: string; pop: number; built: number }[];
  unlocks: Record<string, string>;
  civicBuildings: BuildingRow[];
  council: Council;
  preAged: Record<string, string[]>;
  yearsPerBuilding: number; yearDays: number; years: string[];
  lines: Record<string, string[]>;
};
export const ZONES = zonesJson as unknown as Table;
export const COUNCIL = ZONES.council;
/** 8 sectors x 2 bands. Lot index = band * 8 + sector. */
export const LOTS = 16;

export type CivicNews = {
  day: number; kind: 'rezone' | 'tax' | 'tier' | 'raise' | 'petition';
  by?: string; lot?: number; zone?: ZoneId; tax?: number; prevTax?: number; tier?: string; buildingKind?: string; ok?: boolean;
};
/** One town's civic record (on state.build.civic, so saves carry it; created lazily). */
export type TownCivic = {
  /** Lots the council re-zoned (lot index → zone); the rest keep the town's default layout. */
  lots?: Record<string, ZoneId>;
  /** Share of each company's new takings the council levies at dawn. */
  tax: number;
  /** Levy not yet spent (it pays builders on the council's own works). */
  treasury: number;
  /** Company revenue already levied, by company id (revenue only grows). */
  taxSeen: Record<string, number>;
  /** Tier last heard (a change is news). */
  tier?: string;
  /** Ambitions turned away for want of ground in a zone since the council last sat. */
  wanted: Record<string, number>;
  news: CivicNews[];
  /** Generated district towns: pre-aged buildings placed once, at founding. */
  founded?: boolean;
  lastCouncil?: number;
  petitioned?: number;
};

export const zoneName = (z: string): string => ZONES.zones.find((x) => x.id === z)?.name ?? z;
export const sectorName = (lot: number): string => ZONES.sectorNames[lot % 8] ?? 'far';
export const bandName = (lot: number): string => (lot < 8 ? 'near' : 'far');
/** The zone a building kind's claim must sit in (unknown kinds count as houses). */
export const zoneFor = (kind: string): ZoneId => ZONES.buildingZone[kind] ?? 'housing';

/** Compass sector of a cell offset from the centre, integer only (tan 22.5° ≈ 2/5). Screen y runs south. */
export function sectorOf(dx: number, dy: number): number {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ay * 5 <= ax * 2) return dx >= 0 ? 0 : 4;
  if (ax * 5 <= ay * 2) return dy >= 0 ? 2 : 6;
  if (dx > 0) return dy > 0 ? 1 : 7;
  return dy > 0 ? 3 : 5;
}
export const lotOf = (dx: number, dy: number): number => (Math.max(Math.abs(dx), Math.abs(dy)) <= ZONES.innerMaxRing ? 0 : 8) + sectorOf(dx, dy);

/** A generated district town as the realm (cached per seed) describes it. */
export function districtTown(seed: number, townId: string): DistrictTown | undefined {
  const d = districtOfTown(townId);
  return d ? realm(seed)[d.row * DISTRICTS.grid.cols + d.col]?.towns.find((t) => t.id === townId) : undefined;
}

/** A town's settlement kind: a district town's own, else the authored row's gap axis, else a village. */
export function townKind(state: SimState, townId: string): SettlementKind {
  const d = districtOfTown(townId);
  if (d) return districtTown(state.seed, townId)?.kind ?? 'village';
  const row = ((state.data as { towns?: { id: string; gapAxis?: number }[] } | undefined)?.towns ?? []).find((t) => t.id === townId);
  return row?.gapAxis !== undefined ? settlementKind({ gap01: row.gapAxis }) : 'village';
}

const defaults = new Map<string, ZoneId[]>();
/** The town's lots before any council: its kind's layout, turned to its main street, one seeded swap. */
export function defaultLots(state: SimState, townId: string): ZoneId[] {
  const o = state.towns?.[townId];
  // Keyed on the centre too: before the map binds a town it has no street to turn to.
  const key = `${state.seed}|${townId}|${o?.q}|${o?.r}`;
  const hit = defaults.get(key);
  if (hit) return hit;
  const kind = townKind(state, townId);
  const layout = ZONES.layouts[kind] ?? ZONES.layouts.village;
  const turn = o?.q !== undefined && o.r !== undefined ? ZONES.axisTurn[townPlan({ id: townId, kind, q: o.q, r: o.r }).axis] ?? 0 : 0;
  const lots: ZoneId[] = [];
  for (const band of [layout.inner, layout.outer]) for (let s = 0; s < 8; s++) lots.push(band[(s - turn + 8) % 8]!);
  // One seeded swap in the outer band (the town grew its own way).
  const rng = deriveRng(state.seed, 'zones', townId);
  const a = 8 + rng.int(0, 8), b = 8 + rng.int(0, 8);
  [lots[a], lots[b]] = [lots[b]!, lots[a]!];
  if (defaults.size > 256) defaults.clear();
  defaults.set(key, lots);
  return lots;
}

/** The town's civic record, created on first touch. */
export function civicOf(state: SimState, townId: string): TownCivic {
  const b = (state.build ??= { plans: [], claims: [], next: 1 });
  const all = (b.civic ??= {});
  return (all[townId] ??= { tax: COUNCIL.taxStart, treasury: 0, taxSeen: {}, wanted: {}, news: [] });
}

export const zoneOfLot = (state: SimState, townId: string, lot: number): ZoneId =>
  state.build?.civic?.[townId]?.lots?.[String(lot)] ?? defaultLots(state, townId)[lot]!;
export const zoneAt = (state: SimState, townId: string, dx: number, dy: number): ZoneId => zoneOfLot(state, townId, lotOf(dx, dy));
/** Whether a w x h claim for this kind, corner on cell (dx, dy), lies wholly in that kind's zone. */
export function fitsZone(state: SimState, townId: string, kind: string, dx: number, dy: number, w = 1, h = 1): boolean {
  const z = zoneFor(kind);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (zoneAt(state, townId, dx + i, dy + j) !== z) return false;
  return true;
}

/** What the old folk call the year a day fell in (every year has one name, so tales agree). */
export const yearName = (seed: number, day: number): string =>
  ZONES.years[deriveRng(seed, 'year-name', Math.floor(day / ZONES.yearDays)).int(0, ZONES.years.length)]!;

export const lotsOf = (state: SimState, townId: string): ZoneId[] => Array.from({ length: LOTS }, (_, i) => zoneOfLot(state, townId, i));

/** Keep a town's news short (newest last). */
export function addNews(state: SimState, townId: string, n: CivicNews): void {
  const c = civicOf(state, townId);
  c.news.push(n);
  if (c.news.length > COUNCIL.newsKeep) c.news.splice(0, c.news.length - COUNCIL.newsKeep);
}

/**
 * Give one lot over to a zone: never the last lot of any zone, the lot with fewest claims standing on it
 * first (the band that suits the zone breaks ties: fields and houses outside, trade and commons inside).
 * Returns the lot, or null when no lot can be spared.
 */
export function rezoneFor(state: SimState, townId: string, zone: ZoneId, anchors: { dx: number; dy: number }[], salt: string): number | null {
  const lots = lotsOf(state, townId);
  const count = (z: ZoneId): number => lots.filter((x) => x === z).length;
  const used = new Map<number, number>();
  for (const a of anchors) { const l = lotOf(a.dx, a.dy); used.set(l, (used.get(l) ?? 0) + 1); }
  const outside = zone === 'farm' || zone === 'housing';
  const spin = deriveRng(state.seed, 'rezone', townId, salt).int(0, LOTS);
  const pick = lots
    .map((z, lot) => ({ z, lot }))
    .filter(({ z }) => z !== zone && count(z) > 1)
    .map(({ lot }) => ({ lot, score: (used.get(lot) ?? 0) * 10 + ((lot >= 8) === outside ? 0 : 1), tie: (lot + spin) % LOTS }))
    .sort((x, y) => x.score - y.score || x.tie - y.tie)[0];
  if (!pick) return null;
  (civicOf(state, townId).lots ??= {})[String(pick.lot)] = zone;
  return pick.lot;
}

/** The zone with most claims per lot, when it has reached the council's crowding mark (else null). */
export function crowdedZone(state: SimState, townId: string, anchors: { dx: number; dy: number }[]): ZoneId | null {
  const lots = lotsOf(state, townId);
  const per = new Map<ZoneId, number>();
  for (const a of anchors) { const z = lots[lotOf(a.dx, a.dy)]!; per.set(z, (per.get(z) ?? 0) + 1); }
  const ranked = ZONES.zones
    .map((z) => ({ z: z.id, p: (per.get(z.id) ?? 0) / Math.max(1, lots.filter((x) => x === z.id).length) }))
    .sort((a, b) => b.p - a.p || a.z.localeCompare(b.z));
  return ranked[0] && ranked[0].p >= COUNCIL.crowd ? ranked[0].z : null;
}

/** Where the council sets the levy: up while it has works to pay for, down when the town is low. */
export function nextTax(cur: number, despair: number, works: boolean): number {
  let t = cur;
  if (despair >= COUNCIL.despairHigh) t -= COUNCIL.taxStep;
  else if (works) t += COUNCIL.taxStep;
  else if (t > COUNCIL.taxStart) t -= COUNCIL.taxStep;
  return Math.round(Math.min(COUNCIL.taxMax, Math.max(COUNCIL.taxMin, t)) * 100) / 100;
}
