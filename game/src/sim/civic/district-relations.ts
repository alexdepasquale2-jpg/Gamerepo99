/**
 * Districts as polities. Every pair of neighbouring districts is at peace, under a trade pact, or at war,
 * with trust and feud meters that follow economy/polity.ts at district scale: feud grows from despair (hard
 * times look for someone to blame), rival doctrine styles and the wound a land carries, and trust soothes
 * it; trust grows from leaders' letters (civic/district-letters) and from a pact. A feud past the line
 * breaks into war; a war runs its days and ends in truce.
 *
 * The tick is abstract and cheap: O(neighbour pairs) per dawn, reading only each district's seed profile
 * and its known despair (live towns, else the realm summary, else the seed). What war does to the live
 * district's people and stores is civic/district-war. State lives on RealmState.polity, which travels
 * with the player (realm is a carried key). Pure + deterministic (deriveRng, sorted pairs).
 */
import polityJson from '../../data/civic/district-polity.json';
import { ensureDoctrines, worldSeat } from '../doctrine-tick';
import { DISTRICTS, districtAt, districtId, isHome, neighbours, prettyTownId } from '../map/districts';
import { namePool } from '../names';
import { activeDistrict, districtDays, realmOf, refId, type DistrictRef } from '../realm';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { noteUse } from '../data-use-civic';
import { leaderOf } from '../contrib/power-page';
import { bakedDistrict, bakedPair } from '../realm-bake';

type Broker = { spark: number; base: number; perTrust: number; minTrust?: number; feudAfter?: number; trustAfter: number; failTrust: number };
export type PolityTuning = {
  startFeud: [number, number]; rivalStartFeud: number; homePeople: number; warFoodLineEvery: number; letterEvery: [number, number]; letterTrust: number; grievanceFeudEase: number;
  pactTrustPerDay: number; trustDrift: number; trustDriftPerTrust: number; feudDecay: number; trustSoothe: number;
  rivalStyleFeud: number; despairFeud: number; despairCalm: number; despairFeudMul: number;
  pactTrust: number; pactFeud: number; breakFeud: number; breakTrust: number; grievanceAt: number;
  warFeud: number; warCooldown: number; warMin: number; warSpread: number; truceFeud: number; truceTrust: number;
  pactRelief: number; warDespairPerDay: number; warLoseDespair: number;
  levyShare: number; levyMax: number; levyDespair: number; levyFallChance: number; warFoodPerDay: number;
  broker: { peace: Broker; pact: Broker }; inboxKeepPerSender: number; linesPerDawn: number;
};
const J = polityJson as unknown as { tuning: PolityTuning; rivalStyles: [string, string][]; woundFeud: Record<string, number> };
/** Every knob; data/civic/district-polity.json is the one source. */
export const DPOL: PolityTuning = J.tuning;
/** The rivalStyles row a style pair matches, as written in the data (either order). */
const rivalRow = (a: string, b: string): string => {
  const hit = J.rivalStyles.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? `${hit[0]}|${hit[1]}` : `${a}|${b}`;
};
const RIVALS = new Set(J.rivalStyles.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));

export type PairState = 'peace' | 'pact' | 'war';
export type LetterKind = 'greeting' | 'trade' | 'grievance' | 'truce';
/** A leader's letter on the trunk roads between the pair (at most one at a time per pair). */
export type Courier = { from: string; sent: number; due: number; kind: LetterKind };
/** `since`: the day the state last changed (a war's start day names that war). */
export type DistrictRelation = {
  a: string; b: string; trust: number; feud: number; state: PairState; since: number; lastWar: number;
  warEnds?: number; nextLetter: number; lastFrom?: string; courier?: Courier;
  /** Who held the field in the last war. */
  winner?: string;
  /** Last day the player brokered between this pair (once a day). */
  brokered?: number;
};
/** A district's leader as last known: the live seat's doctrine leader, else a name derived from the seed. */
export type DistrictLeader = { name: string; personId?: string; seat?: string };
/** Today's news for the live district's dawn lines (key into district-letters.json `dawn`). */
export type PolityNews = { day: number; key: string; vars: Record<string, string> };
/** An adult of district `district` away with the levy for the war `pair` began on `since`. */
export type Levy = { personId: string; townId: string; district: string; pair: string; since: number };
export type DistrictPolity = {
  relations: Record<string, DistrictRelation>; leaders: Record<string, DistrictLeader>;
  news: PolityNews[]; levies: Levy[]; lastTick: number;
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const pairOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const refOf = (id: string): DistrictRef => {
  const m = /^d(\d+)_(\d+)$/.exec(id);
  return { col: Number(m?.[1] ?? 0), row: Number(m?.[2] ?? 0) };
};

// ---------- seed profiles (memoized: districtAt also places towns) ----------

type Profile = { id: string; name: string; style: string; wound: string; despair: number; population: number; seat?: string };
const PROFILES = new Map<string, Profile>();
export function profileOf(seed: number, id: string): Profile {
  const key = `${seed}:${id}`;
  let p = PROFILES.get(key);
  if (!p) {
    const r = refOf(id), d = districtAt(seed, r.col, r.row);
    p = { id, name: d.name, style: d.character.doctrine.style, wound: d.character.wound, despair: d.despair, population: d.population, seat: d.towns.find((t) => t.seat)?.id };
    PROFILES.set(key, p);
  }
  return p;
}

let PAIRS: string[] | undefined;
/** Every neighbouring pair of districts on the grid, sorted (the grid is fixed, so once). */
export function allPairs(): string[] {
  if (PAIRS) return PAIRS;
  const out = new Set<string>();
  for (let col = 0; col < DISTRICTS.grid.cols; col++) for (let row = 0; row < DISTRICTS.grid.rows; row++) {
    for (const n of neighbours(col, row)) out.add(pairOf(districtId(col, row), districtId(n.col, n.row)));
  }
  return (PAIRS = [...out].sort());
}

// ---------- state ----------

export function ensurePolity(state: SimState): DistrictPolity {
  return (realmOf(state).polity ??= { relations: {}, leaders: {}, news: [], levies: [], lastTick: -1 });
}
export const polityIfAny = (state: SimState | undefined): DistrictPolity | undefined =>
  (state as (SimState & { realm?: { polity?: DistrictPolity } }) | undefined)?.realm?.polity;

export function relationOf(state: SimState, a: string, b: string): DistrictRelation {
  const p = ensurePolity(state), key = pairOf(a, b);
  let r = p.relations[key];
  if (!r) {
    const [x, y] = key.split('|') as [string, string];
    const rng = deriveRng(state.seed, 'district-relation', key);
    const rival = RIVALS.has(`${profileOf(state.seed, x).style}|${profileOf(state.seed, y).style}`);
    // A baked realm hands over how the pair stood when its past ended (sim/realm-bake); a young one starts from the seed.
    const baked = bakedPair(state, x, y);
    r = p.relations[key] = baked ? {
      a: x, b: y, trust: baked.trust, feud: baked.feud, state: baked.state, since: baked.since, lastWar: baked.lastWar,
      ...(baked.warEnds !== undefined ? { warEnds: baked.warEnds } : {}), ...(baked.winner ? { winner: baked.winner } : {}),
      nextLetter: state.day + rng.int(1, DPOL.letterEvery[1] + 1),
    } : {
      a: x, b: y, trust: 0, feud: rng.int(DPOL.startFeud[0], DPOL.startFeud[1] + 1) + (rival ? DPOL.rivalStartFeud : 0), state: 'peace',
      since: state.day, lastWar: -999, nextLetter: state.day + rng.int(1, DPOL.letterEvery[1] + 1),
    };
  }
  return r;
}

/** Every neighbouring pair as it stands (a baked realm's pacts and wars are on the map from day 1). */
export function primeRelations(state: SimState): void {
  for (const key of allPairs()) { const [a, b] = key.split('|') as [string, string]; relationOf(state, a, b); }
}

export const liveId = (state: SimState): string => refId(activeDistrict(state));
export const otherOf = (r: DistrictRelation, id: string): string => (r.a === id ? r.b : r.a);

/** A district's despair as the realm knows it: live towns where you stand, the summary where you have been, else the seed. */
export function despairOf(state: SimState, id: string): number {
  if (id === liveId(state)) {
    const ts = Object.values(state.towns ?? {}) as { despair?: number }[];
    return ts.length ? ts.reduce((a, t) => a + (t.despair ?? 0), 0) / ts.length : 0.3;
  }
  return realmOf(state).summaries[id]?.despair ?? bakedDistrict(state, id)?.despair ?? profileOf(state.seed, id).despair;
}

/** Nudge a district's despair: its live towns, else its summary (a never-seen district keeps its seed). */
export function bumpDespair(state: SimState, id: string, by: number): void {
  if (id === liveId(state)) {
    for (const t of Object.values(state.towns ?? {}) as { despair: number }[]) t.despair = clamp((t.despair ?? 0) + by, 0, 1);
    return;
  }
  const s = realmOf(state).summaries[id];
  if (s) s.despair = clamp(s.despair + by, 0, 1);
}

/**
 * Weight in a war: head count as known (the live sim's folk, levies included; a summary; else the seed's,
 * which counts on the same scale as a live district), steadied or sapped by despair.
 */
function strength(state: SimState, id: string): number {
  const folk = id === liveId(state)
    ? Object.values(state.people).filter((p) => !p.tags?.includes('retired')).length
    : realmOf(state).summaries[id]?.people ?? (profileOf(state.seed, id).population || DPOL.homePeople) * (bakedDistrict(state, id)?.people ?? 1);
  return folk * (1.2 - despairOf(state, id));
}

// ---------- leaders ----------

/** The live district's leader: the doctrine at the world's seat, through power-page leaderOf. */
export function liveLeader(state: SimState): DistrictLeader {
  const seat = worldSeat(state);
  const docs = Object.values(ensureDoctrines(state)).filter((d) => d.townId === seat).sort((a, b) => Number(!!a.collapsed) - Number(!!b.collapsed) || a.id.localeCompare(b.id));
  // After a doctrine swap the new compact may have no voice at the seat; whoever still leads there speaks for it.
  const atSeat = (tag: string): string | undefined => Object.keys(state.people).sort().find((id) => state.people[id]!.townId === seat && state.people[id]!.tags?.includes(tag));
  const pid = (docs[0] ? leaderOf(state, docs[0]) : undefined) ?? atSeat('leader') ?? atSeat('doctrine_voice');
  const name = pid ? state.people[pid]?.name : undefined;
  return pid && name ? { name, personId: pid, seat } : { ...derivedLeader(state.seed, liveId(state)), seat };
}

/** A leader for a district never seen: a name in its own culture, fixed by the seed. */
function derivedLeader(seed: number, id: string): DistrictLeader {
  const r = refOf(id);
  const pool = namePool(seed, isHome(r.col, r.row) ? undefined : `${id}_t0`);
  const rng = deriveRng(seed, 'district-leader', id);
  return { name: `${pool.given[rng.int(0, pool.given.length)]} ${pool.family[rng.int(0, pool.family.length)]}`, seat: profileOf(seed, id).seat };
}

export function leaderOfDistrict(state: SimState, id: string): DistrictLeader {
  return polityIfAny(state)?.leaders[id] ?? derivedLeader(state.seed, id);
}

/** The live leader's person id, cheaply: the one this dawn recorded while they still stand at the seat, else worked out. */
export function liveLeaderId(state: SimState): string | undefined {
  const rec = polityIfAny(state)?.leaders[liveId(state)];
  if (rec?.personId && rec.seat && state.people[rec.personId]?.townId === rec.seat) return rec.personId;
  return liveLeader(state).personId;
}
export const districtName = (state: SimState, id: string): string => profileOf(state.seed, id).name;
/** The seat a letter to this district is addressed to (home's is known once you have stood there). */
export const seatOf = (state: SimState, id: string): string | undefined => leaderOfDistrict(state, id).seat ?? profileOf(state.seed, id).seat;
export const seatName = (state: SimState, id: string): string => { const s = seatOf(state, id); return s ? prettyTownId(s) : districtName(state, id); };

// ---------- the tick ----------

export type PolityHooks = {
  /** A leader's letter sets out; `days` on the trunk roads. */
  onLetter?: (state: SimState, r: DistrictRelation, c: Courier) => void;
  /** A leader's letter lands at `to`. */
  onLanded?: (state: SimState, r: DistrictRelation, c: Courier, to: string) => void;
};

/** Today's news for the live district's dawn lines. */
export function news(state: SimState, key: string, vars: Record<string, string>): void {
  ensurePolity(state).news.push({ day: state.day, key, vars });
}

let HOOKS: PolityHooks = {};
/** The letters module gives letters their bodies; registered once from the contrib module. */
export function registerPolityHooks(h: PolityHooks): void {
  HOOKS = h;
}

/** Partners in the news: the live district always speaks as "leader"; the far one as "other". */
function partyVars(state: SimState, live: string, other: string): Record<string, string> {
  return { leader: leaderOfDistrict(state, live).name, other: districtName(state, other), otherLeader: leaderOfDistrict(state, other).name };
}

function landLetter(state: SimState, r: DistrictRelation, c: Courier): void {
  const t = DPOL.letterTrust;
  if (c.kind === 'grievance') { r.feud = clamp(r.feud - DPOL.grievanceFeudEase, 0, 100); r.trust = clamp(r.trust + t * 0.25, -100, 100); }
  else r.trust = clamp(r.trust + t * (c.kind === 'truce' ? 1 : 1 - r.feud / 100), -100, 100);
  HOOKS.onLanded?.(state, r, c, otherOf(r, c.from));
}

/** A war begins: the pact (if any) is gone, letters stop, and it runs its seeded length. */
function startWar(state: SimState, r: DistrictRelation, live: string): void {
  r.state = 'war';
  r.since = state.day;
  r.lastWar = state.day;
  r.warEnds = state.day + DPOL.warMin + deriveRng(state.seed, 'district-war-len', r.a, r.b, state.day).int(0, DPOL.warSpread + 1);
  delete r.courier;
  delete r.winner;
  if (r.a === live || r.b === live) news(state, 'war', partyVars(state, live, otherOf(r, live)));
  else if (nearLive(state, r, live)) news(state, 'far_war', { a: districtName(state, r.a), b: districtName(state, r.b) });
}

/** Truce: the stronger side holds the field, the loser despairs, feud settles and the loser sues for terms. */
export function endWar(state: SimState, r: DistrictRelation, live: string, brokered = false): void {
  const winner = brokered ? undefined : strength(state, r.a) >= strength(state, r.b) ? r.a : r.b;
  if (winner) bumpDespair(state, otherOf(r, winner), DPOL.warLoseDespair);
  r.state = 'peace';
  r.since = state.day;
  r.lastWar = state.day;
  r.feud = brokered ? DPOL.broker.peace.feudAfter ?? DPOL.truceFeud : DPOL.truceFeud;
  r.trust = brokered ? Math.max(r.trust, DPOL.broker.peace.trustAfter) : Math.min(r.trust, DPOL.truceTrust);
  delete r.warEnds;
  if (winner) r.winner = winner; else delete r.winner;
  // The loser writes first: terms on the road the day the fighting stops.
  const from = winner ? otherOf(r, winner) : r.a;
  r.courier = { from, sent: state.day, due: state.day + districtDays(state.seed, refOf(r.a), refOf(r.b)), kind: 'truce' };
  HOOKS.onLetter?.(state, r, r.courier);
  if (r.a === live || r.b === live) {
    const v = partyVars(state, live, otherOf(r, live));
    news(state, 'truce', { ...v, held: brokered ? 'brokered' : winner === live ? 'won' : 'lost' });
  } else if (nearLive(state, r, live)) news(state, 'far_truce', { a: districtName(state, r.a), b: districtName(state, r.b) });
}

/** A pair one of whose districts borders the live one (their wars are talked of here). */
function nearLive(state: SimState, r: DistrictRelation, live: string): boolean {
  const l = refOf(live);
  return [r.a, r.b].some((id) => { const d = refOf(id); return Math.abs(d.col - l.col) + Math.abs(d.row - l.row) === 1; });
}

/** One day of a pair, or `days` of them at once: the per-day drifts scale by the step, thresholds are read once. */
function stepPair(state: SimState, r: DistrictRelation, live: string, days = 1): void {
  const day = state.day;
  if (r.courier && r.courier.due <= day) { const c = r.courier; delete r.courier; landLetter(state, r, c); }
  if (r.state === 'war') {
    if (day >= (r.warEnds ?? day)) endWar(state, r, live);
    else for (const id of [r.a, r.b]) bumpDespair(state, id, DPOL.warDespairPerDay * days);
    return;
  }
  const D = Math.max(despairOf(state, r.a), despairOf(state, r.b));
  const pa = profileOf(state.seed, r.a), pb = profileOf(state.seed, r.b);
  const drift = Math.min(Math.abs(r.trust), (DPOL.trustDrift + DPOL.trustDriftPerTrust * Math.abs(r.trust)) * days) * Math.sign(r.trust);
  r.trust = clamp(r.trust - drift + (r.state === 'pact' ? DPOL.pactTrustPerDay * days : 0), -100, 100);
  const rival = RIVALS.has(`${pa.style}|${pb.style}`);
  if (rival) noteUse('civic/district-polity', `rival:${rivalRow(pa.style, pb.style)}`);
  for (const w of [pa.wound, pb.wound]) if (w in J.woundFeud) noteUse('civic/district-polity', `wound:${w}`);
  const grown = (rival ? DPOL.rivalStyleFeud : 0)
    + ((J.woundFeud[pa.wound] ?? 0) + (J.woundFeud[pb.wound] ?? 0)) / 2
    + DPOL.despairFeud * Math.max(0, D - DPOL.despairCalm);
  const sharp = 1 + DPOL.despairFeudMul * D;
  // Each term times the step (not their sum), so a one-day step adds exactly what the dawn always has.
  r.feud = clamp(r.feud + grown * sharp * days - DPOL.feudDecay * days - DPOL.trustSoothe * Math.max(0, r.trust) / 100 * days, 0, 100);

  const party = r.a === live || r.b === live;
  if (r.state === 'pact' && (r.feud >= DPOL.breakFeud || r.trust < DPOL.breakTrust)) {
    r.state = 'peace'; r.since = day;
    if (party) news(state, 'pact_broken', partyVars(state, live, otherOf(r, live)));
  } else if (r.state === 'peace' && r.trust >= DPOL.pactTrust && r.feud < DPOL.pactFeud) {
    r.state = 'pact'; r.since = day;
    if (party) news(state, 'pact', partyVars(state, live, otherOf(r, live)));
  } else if (r.state === 'peace' && r.feud >= DPOL.warFeud && day - r.lastWar >= DPOL.warCooldown) {
    startWar(state, r, live);
    return;
  }
  if (r.state === 'pact') for (const id of [r.a, r.b]) bumpDespair(state, id, -DPOL.pactRelief * days);

  if (!r.courier && day >= r.nextLetter) {
    const from = r.lastFrom === r.a ? r.b : r.a;
    const days = districtDays(state.seed, refOf(r.a), refOf(r.b));
    const kind: LetterKind = r.feud >= DPOL.grievanceAt ? 'grievance' : r.state === 'pact' ? 'trade' : 'greeting';
    r.courier = { from, sent: day, due: day + days, kind };
    r.lastFrom = from;
    r.nextLetter = day + days + deriveRng(state.seed, 'district-letter-gap', r.a, r.b, day).int(DPOL.letterEvery[0], DPOL.letterEvery[1] + 1);
    HOOKS.onLetter?.(state, r, r.courier);
  }
}

/**
 * One dawn for every neighbouring pair in the realm (once per day). `liveOnly`: just the live district's
 * own pairs (a long wait's in-between days, civic/lod: far pairs step on fewer days while nobody watches).
 * `days`: how many days the live district's own pairs make up this step (civic/lod steps them every few
 * days with their drifts scaled); far pairs keep one day a step, as they always have on a long wait.
 */
export function tickDistrictRelations(state: SimState, liveOnly = false, days = 1): void {
  const p = ensurePolity(state);
  if (p.lastTick >= state.day) return;
  p.lastTick = state.day;
  p.news = [];
  const live = liveId(state);
  // Who leads is read again at every full step; on a long wait's in-between days the record stands.
  if (!liveOnly || !p.leaders[live]) p.leaders[live] = liveLeader(state);
  if (liveOnly) {
    for (const r of liveRelations(state)) stepPair(state, r, live, days);
    return;
  }
  for (const key of allPairs()) {
    const [a, b] = key.split('|') as [string, string];
    stepPair(state, relationOf(state, a, b), live, a === live || b === live ? days : 1);
  }
}

/** The live district's neighbours with how each stands (sorted by district id). */
export function liveRelations(state: SimState): DistrictRelation[] {
  const live = liveId(state), l = refOf(live);
  return neighbours(l.col, l.row).map((n) => relationOf(state, live, districtId(n.col, n.row)));
}

// ---------- the player brokers ----------

export type BrokerResult = { kind: 'peace' | 'pact'; ok: boolean; other: string; cost: number; refused?: 'poor' | 'done' };

/** What the live leader could be asked to broker now: peace in a war first, else a pact with the warmest neighbour. */
export function brokerOffer(state: SimState): { kind: 'peace' | 'pact'; r: DistrictRelation } | undefined {
  const rs = liveRelations(state);
  const war = rs.filter((r) => r.state === 'war').sort((x, y) => y.trust - x.trust)[0];
  if (war) return { kind: 'peace', r: war };
  const pact = rs.filter((r) => r.state === 'peace' && r.trust >= (DPOL.broker.pact.minTrust ?? 0)).sort((x, y) => y.trust - x.trust || x.a.localeCompare(y.a))[0];
  return pact ? { kind: 'pact', r: pact } : undefined;
}

/** Spend spark for the live leader to write on your word. Trust decides whether the far leader agrees. */
export function broker(state: SimState): BrokerResult | undefined {
  const offer = brokerOffer(state);
  if (!offer) return undefined;
  const live = liveId(state), { kind, r } = offer, other = otherOf(r, live);
  const cfg = DPOL.broker[kind];
  if (r.brokered === state.day) return { kind, ok: false, other, cost: cfg.spark, refused: 'done' };
  if (state.player.spark < cfg.spark) return { kind, ok: false, other, cost: cfg.spark, refused: 'poor' };
  state.player.spark -= cfg.spark;
  r.brokered = state.day;
  noteUse('civic/district-polity', `broker:${kind}`);
  const chance = clamp(cfg.base + cfg.perTrust * r.trust, 0.05, 0.95);
  const ok = deriveRng(state.seed, 'district-broker', r.a, r.b, state.day).next() < chance;
  if (ok && kind === 'peace') endWar(state, r, live, true);
  else if (ok) { r.state = 'pact'; r.since = state.day; r.trust = clamp(r.trust + cfg.trustAfter, -100, 100); r.feud = Math.min(r.feud, DPOL.pactFeud - 1); }
  else r.trust = clamp(r.trust - DPOL.broker[kind].failTrust, -100, 100);
  return { kind, ok, other, cost: cfg.spark };
}
