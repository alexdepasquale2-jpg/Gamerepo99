/**
 * Visitors: temporary real people. A visitor is an ordinary PersonState (named, talkable, with ring verbs)
 * plus a record here saying why they came, where they are (on a road between towns, or in a town) and the
 * day they leave by. Systems register a source (G7 road folk, H9 notoriety callers…) that spawns them; this
 * module walks them along their road, lets them arrive, and removes them cleanly when they go.
 * Runs on the 'late' dawn slot. Pure + deterministic (seed + day + ids).
 */
import { namePool } from './names';
import { registerDawnTick } from './dawn-ticks';
import { deriveRng } from './rng';
import { planRoad, positionOnLegs, type RoadLeg, type RoadPosition } from './road-journey';
import type { PersonState, SimState } from './types/runtime';

export type VisitorKind =
  | 'pilgrim' | 'courier' | 'refugee' | 'pedlar'
  | 'thief' | 'tax_collector' | 'patron_man' | 'spy' | 'beggar' | 'petitioner';

export type Visitor = {
  /** Same as the person id (`vis_<n>`). */
  id: string;
  kind: VisitorKind;
  /** The source that spawned them (its hooks run on arrival and departure). */
  source: string;
  /** Why they came, in a few words ("bound for the chapel at Ashford"). */
  reason: string;
  /** Where they come from. */
  homeTownId?: string;
  /** On the road: the legs they walk and the day they set out. Cleared on arrival. */
  legs?: RoadLeg[];
  setOut?: number;
  /** Where the road ends (kept after arrival). */
  toTownId?: string;
  /** In a town (arrived, or came straight there). */
  townId?: string;
  arrivedDay?: number;
  /** Gone at the first dawn after this day. */
  leaveBy: number;
  /** Per-kind details: goods carried, coin asked, the attractor behind them. */
  item?: string;
  qty?: number;
  coin?: number;
  attractorId?: string;
  /** How the player answered them, once they have. */
  answered?: 'paid' | 'refused' | 'helped';
};

/** One line of news for the player's town this dawn; `{speaker}` is filled with a resident's name. */
export type VisitorNews = { day: number; townId: string; text: string; about: string };

export type VisitorsState = { next: number; list: Record<string, Visitor>; news?: VisitorNews[] };

export type VisitorSpec = {
  kind: VisitorKind;
  source: string;
  reason: string;
  homeTownId?: string;
  /** Walk the road from homeTownId to here, then stay `stayDays`. */
  toTownId?: string;
  /** Or appear straight in this town and stay `stayDays`. */
  townId?: string;
  stayDays: number;
  item?: string;
  qty?: number;
  coin?: number;
  attractorId?: string;
  flame?: number;
  tags?: string[];
};

export type VisitorSource = {
  id: string;
  /** Spawn whoever comes this dawn (use spawnVisitor). */
  spawn?(state: SimState): void;
  /** At the end of their road. Return 'settle' to make them a resident for good. */
  arrive?(state: SimState, v: Visitor): 'stay' | 'settle' | void;
  /** Just before they are removed. */
  leave?(state: SimState, v: Visitor): void;
};

export const VISITOR_TAG = 'visitor';
export const ON_ROAD_TAG = 'on_road';
/** At most this many visitors on the roads, and in any one town, at once. */
export const MAX_ON_ROAD = 8;
export const MAX_IN_TOWN = 3;

const sources = new Map<string, VisitorSource>();

/** Register (or replace) a visitor source by id. Sources spawn in registration order. */
export function registerVisitorSource(s: VisitorSource): void {
  sources.set(s.id, s);
}

export const isVisitorId = (id: string): boolean => id.startsWith('vis_');

export function ensureVisitors(state: SimState): VisitorsState {
  return (state.visitors ??= { next: 1, list: {} });
}

export const visitorOf = (state: SimState, id: string): Visitor | undefined => state.visitors?.list[id];

/** Visitors standing in a town (not on the road), by id. */
export function visitorsIn(state: SimState, townId: string | undefined): Visitor[] {
  if (!townId) return [];
  return Object.values(state.visitors?.list ?? {}).filter((v) => !v.legs && v.townId === townId).sort((a, b) => a.id.localeCompare(b.id));
}

export function roadVisitors(state: SimState): Visitor[] {
  return Object.values(state.visitors?.list ?? {}).filter((v) => !!v.legs).sort((a, b) => a.id.localeCompare(b.id));
}

const roadDays = (legs: RoadLeg[]): number => legs.reduce((n, l) => n + l.days, 0);

/**
 * Where a visitor on the road is now; `dayFrac` (0..1, the day clock) lets them walk on through the day.
 * Undefined for anyone not on a road.
 */
export function roadPositionOf(state: SimState, id: string, dayFrac = 0.5): RoadPosition | undefined {
  const v = visitorOf(state, id);
  if (!v?.legs || v.setOut === undefined) return undefined;
  const total = roadDays(v.legs);
  // Never quite at the far gate while still on the road: they arrive at the next dawn.
  const t = Math.min(total - 0.05, state.day - v.setOut + Math.max(0, Math.min(1, dayFrac)));
  return positionOnLegs(v.legs, Math.max(0, t));
}

/** Residents of a town who can carry a line (named grown-ups, not visitors), sorted. */
export function residentsOf(state: SimState, townId: string | undefined, skip: string[] = []): string[] {
  if (!townId) return [];
  return Object.keys(state.people).sort().filter((id) => {
    const p = state.people[id]!;
    return p.townId === townId && !!p.name && !isVisitorId(id) && !skip.includes(id) && !p.tags?.includes('child');
  });
}

/** A seeded resident of the town to carry a line, or undefined when nobody lives there. */
export function carrierIn(state: SimState, townId: string | undefined, key: string, skip: string[] = []): string | undefined {
  const folk = residentsOf(state, townId, skip);
  return folk.length ? folk[deriveRng(state.seed, 'visitor-carrier', state.day, key).int(0, folk.length)] : undefined;
}

/** A visitor carries the names of where they come from (else where they are), so district folk sound local. */
function freshName(state: SimState, id: string, townId: string | undefined): string {
  const NAMES = namePool(state, townId);
  const taken = new Set(Object.values(state.people).map((p) => p.name));
  const rng = deriveRng(state.seed, 'visitor-name', id);
  for (let i = 0; i < 12; i++) {
    const n = `${NAMES.given[rng.int(0, NAMES.given.length)]} ${NAMES.family[rng.int(0, NAMES.family.length)]}`;
    if (!taken.has(n)) return n;
  }
  return `${NAMES.given[rng.int(0, NAMES.given.length)]} of the Road`;
}

/** Spawn a visitor as a real person. Returns their id, or undefined when they cannot come (no road, full). */
export function spawnVisitor(state: SimState, spec: VisitorSpec): string | undefined {
  const vs = ensureVisitors(state);
  let legs: RoadLeg[] | undefined;
  let leaveBy: number;
  if (spec.toTownId && spec.homeTownId) {
    if (roadVisitors(state).length >= MAX_ON_ROAD) return undefined;
    const plan = planRoad(state, spec.homeTownId, spec.toTownId);
    if (!plan?.legs.length) return undefined;
    legs = plan.legs;
    leaveBy = state.day + plan.days + spec.stayDays;
  } else if (spec.townId) {
    if (visitorsIn(state, spec.townId).length >= MAX_IN_TOWN) return undefined;
    leaveBy = state.day + spec.stayDays;
  } else return undefined;
  const id = `vis_${vs.next++}`;
  const rng = deriveRng(state.seed, 'visitor', id);
  const person: PersonState = {
    id,
    name: freshName(state, id, spec.homeTownId ?? spec.townId ?? spec.toTownId),
    flame: spec.flame ?? 30 + rng.int(0, 20),
    age: 18 + rng.int(0, 45),
    ...(legs ? {} : { townId: spec.townId }),
    tags: [VISITOR_TAG, `visitor_${spec.kind}`, ...(legs ? [ON_ROAD_TAG] : []), ...(spec.tags ?? [])],
  };
  person.flameStart = person.flame;
  state.people[id] = person;
  vs.list[id] = {
    id, kind: spec.kind, source: spec.source, reason: spec.reason, homeTownId: spec.homeTownId, leaveBy,
    ...(legs ? { legs, setOut: state.day, toTownId: spec.toTownId } : { townId: spec.townId, arrivedDay: state.day }),
    ...(spec.item ? { item: spec.item } : {}),
    ...(spec.qty !== undefined ? { qty: spec.qty } : {}),
    ...(spec.coin !== undefined ? { coin: spec.coin } : {}),
    ...(spec.attractorId ? { attractorId: spec.attractorId } : {}),
  };
  return id;
}

/** Remove a visitor and every trace that points at them. True when they were here. */
export function removeVisitor(state: SimState, id: string): boolean {
  const vs = state.visitors;
  const v = vs?.list[id];
  if (!vs || !v) return false;
  sources.get(v.source)?.leave?.(state, v);
  delete vs.list[id];
  delete state.people[id];
  const raiders = state.hoard?.raiders;
  if (raiders) for (const site of Object.keys(raiders)) if (raiders[site] === id) delete raiders[site];
  if (state.flags.lastTouchedPersonId === id) delete state.flags.lastTouchedPersonId;
  if (state.kinEdges?.some((e) => e.from === id || e.to === id)) state.kinEdges = state.kinEdges.filter((e) => e.from !== id && e.to !== id);
  return true;
}

/** A visitor stops visiting: they live here now (no record, no visitor tags). */
export function settleVisitor(state: SimState, id: string, townId: string): void {
  const p = state.people[id];
  if (!p) return;
  p.townId = townId;
  p.tags = (p.tags ?? []).filter((t) => t !== ON_ROAD_TAG && !t.startsWith(VISITOR_TAG));
  p.tags.push('settled_here');
  delete state.visitors?.list[id];
}

/** Queue a line for the player's town this dawn ("{speaker} says a pilgrim came in…"). */
export function noteVisitorNews(state: SimState, townId: string | undefined, about: string, text: string): void {
  if (!townId) return;
  (ensureVisitors(state).news ??= []).push({ day: state.day, townId, text, about });
}

/** Keep the person in step with the record (a save may have given a road visitor a town). */
function normalize(state: SimState, v: Visitor): void {
  const p = state.people[v.id];
  if (!p) return;
  const tags = (p.tags ??= []);
  if (v.legs) {
    delete p.townId;
    if (!tags.includes(ON_ROAD_TAG)) tags.push(ON_ROAD_TAG);
  } else {
    p.townId = v.townId;
    if (tags.includes(ON_ROAD_TAG)) p.tags = tags.filter((t) => t !== ON_ROAD_TAG);
  }
}

/** One dawn: drop the vanished, walk the road, arrive, leave, then let every source send whoever comes. */
export function tickVisitors(state: SimState): void {
  const vs = ensureVisitors(state);
  vs.news = (vs.news ?? []).filter((n) => n.day === state.day);
  for (const id of Object.keys(vs.list).sort()) {
    const v = vs.list[id]!;
    // Died, or taken by another system: the record goes with them.
    if (!state.people[id]) { delete vs.list[id]; continue; }
    if (v.legs && v.setOut !== undefined && state.day - v.setOut >= roadDays(v.legs)) {
      v.townId = v.toTownId ?? v.legs[v.legs.length - 1]!.to;
      delete v.legs;
      v.arrivedDay = state.day;
      normalize(state, v);
      if (sources.get(v.source)?.arrive?.(state, v) === 'settle') { settleVisitor(state, id, v.townId); continue; }
    }
    if (state.day > v.leaveBy) { removeVisitor(state, id); continue; }
    normalize(state, v);
  }
  for (const s of sources.values()) s.spawn?.(state);
}

registerDawnTick('late', 'visitors', tickVisitors);
