/**
 * Aging, retirement and death (F11). Every person has an age: people the data left ageless get one from
 * the seed, and everyone is a year older every LIFE.yearDays dawns. Old workers retire (they leave their
 * company and facility crew, and their trade passes to their heir); the old die. A death hands land,
 * plans, company and purse to the heir (households.inheritFrom), takes the dead out of every place that
 * names them, and lays a stone (legacy graves). The news is told at dawn by kin (contrib/lifecycle).
 * Succession: a manager who dies or retires leaves their site's post empty (civic/staffing vacatePosts);
 * "wanted: manager" goes up and the best fit in town is promoted at the next dawn.
 * Anchored residents (authored people, doctrine leaders) and legends never die. Pure + deterministic.
 */
import { vacatePosts } from '../civic/staffing';
import { registerDawnTick } from '../dawn-ticks';
import { placeGrave } from '../legacy/npc';
import { legacyTable } from '../legacy/state';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import type { PersonState, SimState } from '../types/runtime';
import { heirOf, inheritFrom } from './households';

export const LIFE = {
  /** Dawns per year of age: slow enough that a town is not emptied in a long game (households grow children faster). */
  yearDays: 8,
  /** Ages dealt to people the data gave none: [min, max). */
  firstAge: [18, 64] as const,
  adultAge: 18,
  /** From this age a birthday may bring retirement (retireChance), and by retireBy it always does. */
  retireAge: 62,
  retireChance: 0.35,
  retireBy: 72,
  /** Yearly chance of death: hazardBase at hazardFrom, doubling every hazardDoubling years, capped. */
  hazardBase: 0.004,
  hazardFrom: 50,
  hazardDoubling: 7,
  hazardMax: 0.7,
  /** Nobody outlives this. */
  oldest: 95,
  /** At most this many deaths a dawn across the world, one per town. */
  maxDeathsPerDawn: 2,
  /** Life events kept for the dawn lines and the board. */
  keepEvents: 40,
};

export type LifeEvent = {
  kind: 'died' | 'retired';
  personId: string;
  name: string;
  townId?: string;
  age: number;
  day: number;
  /** Who tells it: kin when there is any, else a neighbour. */
  teller?: string;
  /** True when the teller is family. */
  kin?: boolean;
  /** Who took over the land, plans, company and purse. */
  heir?: string;
  /** Name of the company that changed hands, if any. */
  trade?: string;
};
export type LifeState = { events: LifeEvent[] };

const life = (state: SimState): LifeState => (state.life ??= { events: [] });
export const lifeEvents = (state: SimState, day = state.day): LifeEvent[] => (state.life?.events ?? []).filter((e) => e.day === day);
export const isRetired = (p: PersonState | undefined): boolean => !!p?.tags?.includes('retired');
const alive = (state: SimState, id: string | undefined, not?: string): id is string => !!id && id !== not && !!state.people[id];

/** Never taken: anchored residents (authored, leaders) and former inhabitants living on as legends. */
export const deathless = (state: SimState, p: PersonState): boolean =>
  p.anchor === true || !!p.tags?.includes('legacy_player') || !!state.legacy?.npcs[p.id];

/** Yearly chance of death at this age. */
export function hazard(age: number): number {
  if (age < LIFE.adultAge) return 0;
  if (age >= LIFE.oldest) return 1;
  return Math.min(LIFE.hazardMax, LIFE.hazardBase * 2 ** ((age - LIFE.hazardFrom) / LIFE.hazardDoubling));
}

/** The family who carries the news: spouse, eldest grown child, a parent, then fabric kin. */
export function kinOf(state: SimState, id: string): string | undefined {
  const k = state.kin;
  const spouse = k?.households.find((h) => h.adults.includes(id))?.adults.find((a) => alive(state, a, id));
  if (spouse) return spouse;
  const kids = (k?.children ?? []).filter((c) => c.parents.includes(id) && alive(state, c.personId, id)).sort((a, z) => a.born - z.born || a.id.localeCompare(z.id));
  if (kids[0]) return kids[0].personId;
  const parent = k?.children.find((c) => c.personId === id)?.parents.find((p) => alive(state, p, id));
  if (parent) return parent;
  return (state.kinEdges ?? []).map((e) => (e.from === id ? e.to : e.to === id ? e.from : undefined)).filter((x): x is string => alive(state, x, id)).sort()[0];
}

/** A neighbour in the same town (the eldest, ties by id), for news with no family to tell it. */
export function neighbourOf(state: SimState, id: string, townId: string | undefined): string | undefined {
  if (!townId) return undefined;
  return Object.values(state.people)
    .filter((p) => p.id !== id && p.townId === townId && (p.age ?? LIFE.adultAge) >= LIFE.adultAge)
    .sort((a, z) => (z.age ?? 0) - (a.age ?? 0) || a.id.localeCompare(z.id))[0]?.id;
}

function teller(state: SimState, id: string): { teller?: string; kin?: boolean } {
  const kin = kinOf(state, id);
  if (kin) return { teller: kin, kin: true };
  const n = neighbourOf(state, id, state.people[id]?.townId);
  return n ? { teller: n, kin: false } : {};
}

function record(state: SimState, e: LifeEvent): void {
  const l = life(state);
  l.events.push(e);
  if (l.events.length > LIFE.keepEvents) l.events.splice(0, l.events.length - LIFE.keepEvents);
}

/** Leave work: off every company's payroll and facility crew; a company they own passes to their heir. */
function stepDown(state: SimState, id: string, heir: string | null): string | undefined {
  let trade: string | undefined;
  for (const c of state.companies?.list ?? []) {
    c.workers = c.workers.filter((w) => w !== id);
    delete c.unpaid[id];
    if (c.ownerId === id && heir) {
      c.ownerId = heir;
      c.workers = c.workers.filter((w) => w !== heir);
      trade ??= c.name;
    }
  }
  for (const s of Object.values(state.facilityStaff ?? {})) {
    s.crew = s.crew.map((c) => (c === id ? null : c));
    if (s.by === id) s.by = undefined;
  }
  return trade;
}

/** Someone to take a dead person's things when no family is left: a crew member of their company, else a neighbour. */
function stranger(state: SimState, id: string): string | undefined {
  const co = (state.companies?.list ?? []).find((c) => c.ownerId === id && c.workers.some((w) => alive(state, w, id)));
  return co?.workers.find((w) => alive(state, w, id)) ?? neighbourOf(state, id, state.people[id]?.townId);
}

function handOver(state: SimState, from: string, to: string): void {
  for (const c of state.build?.claims ?? []) if (c.ownerId === from) c.ownerId = to;
  for (const p of state.build?.plans ?? []) if (p.ownerId === from) p.ownerId = to;
  for (const c of state.companies?.list ?? []) if (c.ownerId === from) { c.ownerId = to; c.workers = c.workers.filter((w) => w !== to); }
}

/** Nobody at all to take them: the company closes, the plans stop, the land goes back to the town. */
function letLapse(state: SimState, id: string): void {
  if (state.companies) state.companies.list = state.companies.list.filter((c) => c.ownerId !== id);
  if (state.build) {
    state.build.plans = state.build.plans.filter((p) => p.ownerId !== id);
    state.build.claims = state.build.claims.filter((c) => c.ownerId !== id);
  }
}

/** Take the dead out of everything that names them, so nothing points at someone who is gone. */
function scrub(state: SimState, id: string, heir: string | undefined): void {
  stepDown(state, id, null);
  const co = state.companies;
  if (co) {
    if (heir && co.purse[id]) co.purse[heir] = (co.purse[heir] ?? 0) + co.purse[id]!;
    delete co.purse[id];
  }
  // Households: the dead leave it; a home with no one left in it (no adult, no child still growing) is gone.
  const k = state.kin;
  if (k) {
    for (const h of k.households) h.adults = h.adults.filter((a) => a !== id);
    k.households = k.households.filter((h) => h.adults.some((a) => !!state.people[a] && a !== id) || h.kids.some((kid) => k.children.find((c) => c.id === kid)?.status === 'child'));
  }
  if (state.kinEdges) state.kinEdges = state.kinEdges.filter((e) => e.from !== id && e.to !== id);
  const ls = state.letters;
  if (ls) {
    ls.pending = ls.pending.filter((p) => p.fromPersonId !== id);
    for (const f of ls.flight) if (f.toPersonId === id) { const n = ls.correspondence?.find((c) => c.id === f.id); if (n) n.status = 'lost'; }
    ls.flight = ls.flight.filter((f) => f.toPersonId !== id && f.fromPersonId !== id);
    if (ls.replies) ls.replies = ls.replies.filter((r) => r.fromPersonId !== id || r.status === 'arrived');
  }
  for (const u of state.unspoken?.instances ?? []) {
    u.personIds = u.personIds.filter((p) => p !== id);
    if (u.sourcePersonId === id) u.consumed = true;
  }
  if (state.itemInstances) {
    for (const i of state.itemInstances) if (i.heldBy === id && heir) i.heldBy = heir;
    state.itemInstances = state.itemInstances.filter((i) => i.heldBy !== id);
  }
  if (state.loans) {
    for (const l of state.loans) if (l.fromPersonId === id && heir) l.fromPersonId = heir;
    state.loans = state.loans.filter((l) => l.fromPersonId !== id);
  }
  if (state.cargo) {
    for (const c of state.cargo) if (c.fromPersonId === id && heir) c.fromPersonId = heir;
    state.cargo = state.cargo.filter((c) => c.fromPersonId !== id);
  }
  const raiders = state.hoard?.raiders;
  if (raiders) for (const [site, who] of Object.entries(raiders)) if (who === id) delete raiders[site];
  if (state.historyTold) delete state.historyTold[id];
  if (state.legacy) delete state.legacy.bonds[id];
  delete state.people[id];
}

/** A person dies: heir takes over, the dead leave every list, a stone is laid. Returns the event (null if they can't). */
export function laidToRest(state: SimState, id: string): LifeEvent | null {
  const p = state.people[id];
  if (!p) return null;
  const who = teller(state, id);
  const trade = (state.companies?.list ?? []).find((c) => c.ownerId === id)?.name;
  let heir = inheritFrom(state, id) ?? undefined;
  if (!heir) {
    heir = stranger(state, id);
    if (heir) handOver(state, id, heir);
    else letLapse(state, id);
  }
  const name = p.name ?? id;
  vacatePosts(state, id, 'died');
  const e: LifeEvent = { kind: 'died', personId: id, name, townId: p.townId, age: p.age ?? LIFE.adultAge, day: state.day, ...who, ...(heir ? { heir } : {}), ...(trade && heir ? { trade } : {}) };
  scrub(state, id, heir);
  placeGrave(state, { personId: id, name, townId: p.townId, epitaphId: legacyTable().graveEpitaphId, day: state.day });
  record(state, e);
  // Kin take it hardest: their own line follows the dawn news (voice: kin.death, fallback kin_death).
  if (e.kin && e.teller) pushJuice(state, 'kin.death', { personId: e.teller, deadId: id, townId: state.people[e.teller]?.townId, name });
  return e;
}

/** A person retires: off the payroll and the crews; their trade passes to their heir. */
export function retire(state: SimState, id: string): LifeEvent | null {
  const p = state.people[id];
  if (!p || isRetired(p)) return null;
  const heir = heirOf(state, id);
  vacatePosts(state, id, 'retired');
  const trade = stepDown(state, id, heir);
  p.tags = [...(p.tags ?? []), 'retired'];
  const e: LifeEvent = { kind: 'retired', personId: id, name: p.name ?? id, townId: p.townId, age: p.age ?? LIFE.retireAge, day: state.day, ...teller(state, id), ...(heir && trade ? { heir, trade } : {}) };
  record(state, e);
  pushJuice(state, 'person.retired', { personId: id, townId: p.townId, heirId: heir ?? undefined });
  return e;
}

export function tickMortality(state: SimState): void {
  const ids = Object.keys(state.people ?? {}).sort();
  const birthday = state.day % LIFE.yearDays === 0;
  for (const id of ids) {
    const p = state.people[id]!;
    if (p.age === undefined) {
      const [lo, hi] = LIFE.firstAge;
      p.age = deriveRng(state.seed, 'first-age', id).int(lo, hi);
    } else if (birthday) p.age += 1;
  }
  if (birthday) {
    for (const id of ids) {
      const p = state.people[id]!;
      if (isRetired(p) || p.tags?.includes('legacy_player') || p.age! < LIFE.retireAge) continue;
      if (p.age! >= LIFE.retireBy || deriveRng(state.seed, 'retire', state.day, id).next() < LIFE.retireChance) retire(state, id);
    }
  }
  const struck = new Set<string>();
  for (const id of ids) {
    if (struck.size >= LIFE.maxDeathsPerDawn) break;
    const p = state.people[id];
    if (!p || deathless(state, p) || (p.townId && struck.has(p.townId))) continue;
    if (deriveRng(state.seed, 'death', state.day, id).next() >= hazard(p.age ?? 0) / LIFE.yearDays && (p.age ?? 0) < LIFE.oldest) continue;
    if (laidToRest(state, id)) struck.add(p.townId ?? id);
  }
}

registerDawnTick('people', 'mortality', tickMortality);
