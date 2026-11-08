/**
 * Roads wear and get mended (G6). Each dawn (the 'roads' slot, after logistics) every road loses a little
 * condition to weather and more to the carts and wagons on it. Waystation crews mend their own road while
 * they are at work; when a road falls low a hand from its towns turns out with a barrow. NPC crews only keep
 * a road up to `crewCeiling`: the last stretch is the player's, with stone and timber on the road itself.
 * Below `breakBelow` a road breaks (carts double their days and risk, caravans freeze, flow stops: the
 * existing EconomyRouteState.broken rules); it opens again at `reopenAt`.
 *
 * Every change is kept as road news, told at dawn by someone in the player's town (dawn lines) and at the
 * inns (sim/economy/waystations). Watches hired at a waystation guard the carts on their road (`escortedBy`).
 * Pure + deterministic: no Phaser/DOM/Math.random.
 */
import { registerDawnTick } from '../dawn-ticks';
import { happeningTownName } from '../happenings';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import type { EconomyRouteState } from './economy-lod-types';
import { FACILITY_WORKERS, facilityPlaces } from './facilities';
import { cartPosition } from './logistics';

export const ROADS = {
  baseWear: 0.002,
  wearPerVehicle: 0.003,
  /** A waystation hand at work mends this much of their road a dawn (holds a road of three carts). */
  crewMend: 0.012,
  /** Below this a hand from the road's towns turns out to mend it, and keeps at it up to `townCrewUntil`. */
  townCrewBelow: 0.4,
  townCrewUntil: 0.6,
  townCrewMend: 0.015,
  /** NPC crews keep a road up to here; better than that is yours to make. */
  crewCeiling: 0.85,
  breakBelow: 0.25,
  reopenAt: 0.45,
  wornBelow: 0.6,
  floor: 0.05,
  newsKeepDays: 8,
  newsCap: 40,
};

export type RoadNewsKind = 'broke' | 'reopened' | 'worn' | 'crew' | 'mended' | 'escort';
/** `by`: who did it (a person id, or 'player'); `townId`: where it lands (an escort's destination). */
export type RoadNews = { day: number; routeId: string; kind: RoadNewsKind; by?: string; townId?: string };
/** Help hired at a waystation, waiting for your next journey on its road. */
export type RoadHelp = { tradeId: string; name: string; routeId: string; day: number; facilityId: string };

/** Saved road state (SimState.roadway; optional, created lazily). */
export type Roadway = {
  news: RoadNews[];
  help?: RoadHelp[];
  /** A watch guarding the carts on a road until (not including) `until`. */
  watches?: Record<string, { name: string; until: number }>;
  /** facilityId -> the day you last heard the talk there, and how often you have. */
  heard?: Record<string, { day: number; n: number }>;
  rested?: { day: number; facilityId: string };
  /** The town hand out mending a road: routeId -> person id. */
  crews?: Record<string, string>;
};

export const roadwayOf = (state: SimState): Roadway => (state.roadway ??= { news: [] });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const firstName = (state: SimState, id: string | undefined): string | undefined => (id ? state.people[id]?.name?.split(' ')[0] : undefined);

export function noteRoadNews(state: SimState, n: Omit<RoadNews, 'day'> & { day?: number }): void {
  const rw = roadwayOf(state);
  rw.news.push({ day: state.day, ...n });
  if (rw.news.length > ROADS.newsCap) rw.news.splice(0, rw.news.length - ROADS.newsCap);
}

export const routeById = (state: SimState, routeId: string): EconomyRouteState | undefined =>
  state.economyRoutes?.find((r) => r.id === routeId);

/** How the road is, in a word people use. */
export function roadWord(r: Pick<EconomyRouteState, 'condition' | 'broken'>): string {
  if (r.broken) return 'broken';
  if (r.condition < ROADS.townCrewBelow) return 'failing';
  if (r.condition < ROADS.wornBelow) return 'worn';
  if (r.condition < 0.85) return 'fair';
  return 'good';
}

/** Carts and wagons on each road right now. */
function trafficByRoute(state: SimState): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: string | undefined) => { if (id) out.set(id, (out.get(id) ?? 0) + 1); };
  for (const c of state.logistics?.carts ?? []) add(cartPosition(c)?.routeId);
  for (const m of state.caravans ?? []) add(m.routeId);
  return out;
}

/** Hands at work at each road's waystations (and the first of them, for the news). */
function innHands(state: SimState): Map<string, { hands: number; by?: string }> {
  const out = new Map<string, { hands: number; by?: string }>();
  for (const p of facilityPlaces(state)) {
    if (p.kind !== 'waystation') continue;
    const s = state.facilityStaff?.[p.id];
    const hands = s && !s.idle ? s.staffed : 0;
    const cur = out.get(p.routeId) ?? { hands: 0 };
    out.set(p.routeId, { hands: cur.hands + hands, by: cur.by ?? (hands ? s?.crew.find((c) => !!c) ?? undefined : undefined) });
  }
  return out;
}

/** Someone from the road's towns fit to go out with a barrow (keeps the same hand while they can). */
function townCrew(state: SimState, r: EconomyRouteState, current: string | undefined): string | undefined {
  const { ableFlame } = FACILITY_WORKERS.staffing;
  const fit = (id: string | undefined) => {
    const p = id ? state.people[id] : undefined;
    return !!p && p.flame >= ableFlame && (p.townId === r.fromTownId || p.townId === r.toTownId);
  };
  if (fit(current)) return current;
  const busy = new Set(Object.values(state.facilityStaff ?? {}).flatMap((s) => s.crew.filter((c): c is string => !!c)));
  let best: string | undefined, bk = Infinity;
  for (const p of Object.values(state.people)) {
    if (busy.has(p.id) || !fit(p.id)) continue;
    const k = deriveRng(state.seed, 'road-crew', r.id, p.id).next();
    if (k < bk) { bk = k; best = p.id; }
  }
  return best;
}

/** One dawn of the roads: wear, crews, breaks and reopenings, watches on the carts. */
export function tickRoads(state: SimState): void {
  const routes = state.economyRoutes;
  if (!routes?.length) return;
  const rw = roadwayOf(state);
  const crews = (rw.crews ??= {});
  const traffic = trafficByRoute(state);
  const inns = innHands(state);
  for (const r of [...routes].sort((a, b) => a.id.localeCompare(b.id))) {
    const before = r.condition;
    r.condition -= ROADS.baseWear + ROADS.wearPerVehicle * (traffic.get(r.id) ?? 0);
    let mend = 0;
    let by: string | undefined;
    const inn = inns.get(r.id);
    if (inn?.hands) { mend += ROADS.crewMend * inn.hands; by = inn.by; }
    const out = crews[r.id] !== undefined;
    if (r.broken || r.condition < ROADS.townCrewBelow || (out && r.condition < ROADS.townCrewUntil)) {
      const hand = townCrew(state, r, crews[r.id]);
      if (hand) {
        mend += ROADS.townCrewMend;
        by ??= hand;
        if (crews[r.id] !== hand) noteRoadNews(state, { routeId: r.id, kind: 'crew', by: hand });
        crews[r.id] = hand;
      } else delete crews[r.id];
    } else delete crews[r.id];
    if (mend > 0 && r.condition < ROADS.crewCeiling) r.condition = Math.min(ROADS.crewCeiling, r.condition + mend);
    r.condition = clamp(r.condition, ROADS.floor, 1);
    if (!r.broken && r.condition < ROADS.breakBelow) {
      r.broken = true;
      noteRoadNews(state, { routeId: r.id, kind: 'broke' });
    } else if (r.broken && r.condition >= ROADS.reopenAt) {
      r.broken = false;
      noteRoadNews(state, { routeId: r.id, kind: 'reopened', by });
    } else if (before >= ROADS.wornBelow && r.condition < ROADS.wornBelow) {
      noteRoadNews(state, { routeId: r.id, kind: 'worn' });
    }
  }
  guardCarts(state);
  rw.news = rw.news.filter((n) => state.day - n.day <= ROADS.newsKeepDays);
  if (rw.help) rw.help = rw.help.filter((h) => state.day - h.day <= 3);
}

/** Carts on a watched road go guarded; a watch that has ended leaves them. The player's own escort stays. */
export function guardCarts(state: SimState): void {
  const rw = roadwayOf(state);
  const watches = rw.watches ?? {};
  for (const [id, w] of Object.entries(watches)) if (w.until <= state.day) delete watches[id];
  for (const c of state.logistics?.carts ?? []) {
    if (c.escortedBy === 'player') continue;
    const at = cartPosition(c)?.routeId;
    const w = at ? watches[at] : undefined;
    if (w) c.escortedBy = `watch:${w.name}`;
    else if (c.escortedBy?.startsWith('watch:')) delete c.escortedBy;
  }
}

// ---- Road news through people ----

const otherEnd = (r: EconomyRouteState, townId: string): string => (r.fromTownId === townId ? r.toTownId : r.fromTownId);

/** Someone in town to carry a line (stable for the day). */
function teller(state: SimState, townId: string, salt: number): string | undefined {
  const folk = Object.values(state.people).filter((p) => p.townId === townId && p.name).sort((a, b) => a.id.localeCompare(b.id));
  return folk.length ? firstName(state, folk[(state.day + salt) % folk.length]!.id) : undefined;
}

function newsLine(state: SimState, n: RoadNews, here: string, salt: number): string | null {
  const r = routeById(state, n.routeId);
  if (!r) return null;
  const to = happeningTownName(otherEnd(r, here));
  const who = teller(state, here, salt) ?? 'A carter';
  const doer = firstName(state, n.by);
  switch (n.kind) {
    case 'broke': return `${who} says the road to ${to} has gone. The ruts are axle-deep and the carts won't chance it.`;
    case 'reopened': return doer
      ? `${who} says the road to ${to} is open again. ${doer} and the others saw to it.`
      : `${who} says the road to ${to} will carry a cart again.`;
    case 'worn': return `${who} says the road to ${to} is all ruts now. It will go, if nobody mends it.`;
    case 'crew': return doer ? `${doer} has gone out with a barrow to mend the road to ${to}.` : null;
    case 'mended': return n.by === 'player' ? `${who} says someone has been setting stone in the road to ${to}. Carters noticed.` : null;
    case 'escort': return n.townId === here ? `${who} says the cart from ${to} came in whole, with you walking beside it.` : null;
  }
}

/**
 * Dawn: road news for the roads out of the player's town (at most two lines). Ticked news is dated today;
 * what the player did on the road is dated yesterday, and heard about this morning.
 */
export function roadDawnLines(state: SimState): string[] {
  const here = state.player.townId;
  const news = state.roadway?.news;
  if (!here || !news?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const order: RoadNewsKind[] = ['broke', 'reopened', 'escort', 'mended', 'crew', 'worn'];
  const fresh = news
    .filter((n) => (n.kind === 'mended' || n.kind === 'escort' ? n.day === state.day - 1 : n.day === state.day))
    .filter((n) => { const r = routeById(state, n.routeId); return !!r && (r.fromTownId === here || r.toTownId === here || n.townId === here); })
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.routeId.localeCompare(b.routeId));
  for (const n of fresh) {
    if (out.length >= 2) break;
    const key = `${n.routeId}:${n.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = newsLine(state, n, here, out.length);
    if (line) out.push(line);
  }
  return out;
}

registerDawnTick('roads', 'roads', tickRoads);
