/**
 * Happenings (data/systems/events.json): small things that befall a town at dawn — grey rain, a
 * stranger with embers, a rider with bad news. At most one starts per dawn, rarely; the draw is
 * seeded per seed+day on its own stream so no other system's rolls shift. Effects go through
 * applyEffect; time-limited ones are undone when they lapse. People carry the news (dawn lines in
 * contrib/happenings, a `happening.start` bubble over whoever said it). Pure: no Phaser/DOM.
 *
 * Effect targets, as they land in play:
 *  - player.*            only when the player woke in that town (or the effect is about your own den).
 *  - person.flame/mark   one picked person in the town (`pick`: random_burning, random_stalled_or_burning, same).
 *  - town.vitality       there is no live vitality meter: -5 vitality reads as +0.05 town despair.
 *  - town.despair        the town's despair. town.fear: the legacy town reputation, when a life has one.
 *  - relapse.mul         live play has no per-dawn relapse roll, so the modifier itself is the relapse:
 *                        burning people there lose relapseFlamePerDawn × (mul − 1) flame each dawn it lasts.
 *  - method.effectiveness scales that method's power on people in the town while it lasts (actInteraction).
 *  - doctrine.exposure   nudges the exposure of every live doctrine held in the town (lasting, as exposure is).
 *
 * The world chooses too: a row's `when` (sim/happening-world) must hold in the town, and a matching one
 * weighs whenWeight more, so a starving town riots and a lit one holds a festival. townBias names roles
 * (den, village, city, despairing, lit) or, from older data, authored town ids. Lines (say/news/newsHere)
 * may be a list of variants; one is drawn per happening from the seed.
 */

import { prettyTownId } from './map/districts';
import { nudgeDoctrine } from './doctrine-tick';
import { applyEffect, FLAME_MAX, type EffectCtx } from './effects';
import { burnAt, isTownRole, matchTownWhen, roleTowns, stampCollapses, type CollapseDays, type HappeningSubject, type HappeningWhen } from './happening-world';
import { loadWorldTables, pickWeighted } from './gen/load/load-world-tables';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import { deriveRng, type Rng } from './rng';
import { VISITOR_TAG } from './visitors';
import type { Effect } from './types/data';
import type { PersonState, SimState } from './types/runtime';

export type HappeningEffectRow = Effect & {
  /** kin_of_dead: whoever told of the death the `when` matched (kin, else a neighbour), else anyone there. */
  pick?: 'random_burning' | 'random_stalled_or_burning' | 'kin_of_dead' | 'same';
  methodId?: string;
  requireSkippedDenRest?: boolean;
};

export type HappeningRow = {
  id: string;
  name: string;
  weight: number;
  durationDays: number;
  /** Roles (den, home, village, town, city, despairing, lit) or authored town ids. */
  townBias?: string[];
  /** Only in its bias towns (e.g. your own den). */
  townStrict?: boolean;
  /** What must be true of the town (sim/happening-world). */
  when?: HappeningWhen;
  blurb?: string;
  /** Bubble over the speaker. {target}/{town}/{name}/{dead} fill in. A list is variants. */
  say?: string | string[];
  /** Dawn line heard as news. */
  news?: string | string[];
  /** Dawn line when the player woke in that town. */
  newsHere?: string | string[];
  effects: HappeningEffectRow[];
};

export type HappeningsTuning = {
  minDay: number;
  chancePerDawn: number;
  minGapDays: number;
  maxActive: number;
  biasWeight: number;
  /** Added to the town weight where an event's `when` holds. */
  whenWeight: number;
  playerTownWeight: number;
  relapseFlamePerDawn: number;
};

/** Something undone (or still in force) until `until`. */
export type HappeningMod =
  | { kind: 'despair'; until: number; delta: number }
  | { kind: 'fear'; until: number; delta: number }
  | { kind: 'mark'; until: number; personId: string; markId: string }
  | { kind: 'relapse'; until: number; mul: number }
  | { kind: 'method'; until: number; methodId: string; mul: number };

export type ActiveHappening = {
  eventId: string;
  townId: string;
  startDay: number;
  /** First dawn it is no longer in force. */
  endsDay: number;
  /** Who carries the news. */
  speakerId?: string;
  /** The person it fell on (pick effects). */
  targetId?: string;
  /** Player was in the town when it began. */
  here?: boolean;
  /** The cause its `when` matched (death:<id>, war:<id>, collapse:<id>, chapel:…). */
  about?: string;
  /** Name of the dead, for a funeral's lines. */
  deadName?: string;
  tags: string[];
  mods: HappeningMod[];
};

export type HappeningsState = {
  active: ActiveHappening[];
  lastStartDay?: number;
  /** Recent starts, newest last (capped). */
  log: { eventId: string; townId: string; day: number; about?: string }[];
  /** Dawn each doctrine was first seen collapsed (for collapsedWithin). */
  collapsed?: CollapseDays;
  /** Causes already told, `<eventId>|<townId>|<about>`, oldest first (capped; longer than the log, as a war outlasts many happenings). */
  told?: string[];
};

const LOG_CAP = 20;
const TOLD_CAP = 80;
const DEFAULT_TUNING: HappeningsTuning = {
  minDay: 2,
  chancePerDawn: 0.35,
  minGapDays: 3,
  maxActive: 1,
  biasWeight: 3,
  whenWeight: 4,
  playerTownWeight: 2,
  relapseFlamePerDawn: 8,
};

type TownRow = { id: string; name: string; gapAxis: number; isDen?: boolean };
let worldTowns: TownRow[] | undefined;
function townRows(): TownRow[] {
  return (worldTowns ??= loadWorldTables().towns.map((t) => ({ id: t.id, name: t.name, gapAxis: t.gapAxis })));
}

export function happeningsTuning(state: SimState): HappeningsTuning {
  const raw = ((state.data as DataTables | undefined)?.eventsTuning ?? {}) as Partial<Record<keyof HappeningsTuning, unknown>>;
  const out = { ...DEFAULT_TUNING };
  for (const k of Object.keys(out) as (keyof HappeningsTuning)[]) {
    if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) out[k] = raw[k] as number;
  }
  return out;
}

export function happeningRows(state: SimState): HappeningRow[] {
  return ((state.data as DataTables | undefined)?.events ?? []) as HappeningRow[];
}

export function ensureHappenings(state: SimState): HappeningsState {
  return (state.happenings ??= { active: [], log: [] });
}

/** Display name of a town ("The Reach (City Pole)" → "The Reach"). */
export function happeningTownName(townId: string): string {
  const name = townRows().find((t) => t.id === townId)?.name ?? prettyTownId(townId);
  return name.replace(/\s*\(.*\)\s*$/, '');
}

/**
 * The present towns a townBias entry names. A role (den, village, city, despairing, lit) reads this world
 * (sim/happening-world); an authored id from older data maps as before: the den is the den role (your
 * home hearth, or a district's den-like town), a present town is itself, a missing one the nearest gap.
 */
export function biasTowns(state: SimState, entry: string, present: string[]): string[] {
  if (isTownRole(entry)) return roleTowns(state, entry, present);
  const authored = ((state.data as DataTables | undefined)?.towns ?? []) as TownRow[];
  if (authored.find((t) => t.id === entry)?.isDen) return roleTowns(state, 'den', present);
  const one = mapBiasTown(state, entry, present);
  return one ? [one] : [];
}

/** An authored (non-den) town id on this world: itself when present, else the nearest gap (never your home). */
export function mapBiasTown(state: SimState, authoredId: string, present: string[]): string | undefined {
  if (present.includes(authoredId)) return authoredId;
  const gap = townRows().find((t) => t.id === authoredId)?.gapAxis;
  if (gap === undefined) return undefined;
  let best: string | undefined;
  let bestD = Infinity;
  for (const id of present) {
    const g = townRows().find((t) => t.id === id)?.gapAxis;
    if (g === undefined || id === state.player.homeTownId) continue;
    const d = Math.abs(g - gap);
    if (d < bestD) [best, bestD] = [id, d];
  }
  return best;
}

function folkIn(state: SimState, townId: string): PersonState[] {
  return Object.values(state.people)
    .filter((p) => p.townId === townId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pickPool(state: SimState, townId: string, pick: string, sub?: HappeningSubject): PersonState[] {
  const folk = folkIn(state, townId);
  if (pick === 'random_burning') return folk.filter((p) => p.flame >= burnAt(state));
  if (pick === 'random_stalled_or_burning') return folk.filter((p) => p.flame > 0);
  if (pick === 'kin_of_dead') {
    const kin = folk.filter((p) => p.id === sub?.tellerId);
    return kin.length ? kin : folk;
  }
  return folk;
}

/** The player rested somewhere other than their own den last night. Away from the home world there is no den fire to bank. */
function skippedDenRest(state: SimState): boolean {
  const home = state.player.homeTownId;
  return !!home && !!state.towns?.[home] && !!state.player.townId && state.player.townId !== home;
}

function eligible(state: SimState, ev: HappeningRow, townId: string, sub: HappeningSubject): boolean {
  for (const fx of ev.effects ?? []) {
    if (fx.requireSkippedDenRest && !skippedDenRest(state)) return false;
    if (fx.pick && fx.pick !== 'same' && pickPool(state, townId, fx.pick, sub).length === 0) return false;
  }
  // Someone besides whoever it falls on, to carry the news.
  return folkIn(state, townId).length > 1;
}

export type HappeningCandidate = { ev: HappeningRow; townId: string; weight: number; subject: HappeningSubject };

/** Weighted (event, town) pairs for this dawn, in stable order: bias roles, the event's `when`, where you woke. */
export function happeningCandidates(state: SimState): HappeningCandidate[] {
  const t = happeningsTuning(state);
  const present = Object.keys(state.towns ?? {}).sort();
  const collapses = state.happenings?.collapsed ?? {};
  const told = new Set(state.happenings?.told ?? []);
  const out: HappeningCandidate[] = [];
  for (const ev of happeningRows(state)) {
    if (!(ev.weight > 0)) continue;
    const bias = new Set((ev.townBias ?? []).flatMap((id) => biasTowns(state, id, present)));
    // A reactive event (one with a `when`) is the world answering something: when it holds, it outweighs the everyday table.
    const reactive = Object.keys(ev.when ?? {}).length > 0;
    for (const townId of present) {
      const inBias = bias.has(townId);
      if (ev.townStrict && !inBias) continue;
      // One funeral per death, one vacuum per fall: a cause told here is passed over for the next one.
      const subject = matchTownWhen(state, townId, ev.when, collapses, (about) => told.has(`${ev.id}|${townId}|${about}`));
      if (!subject) continue;
      if (subject.about && told.has(`${ev.id}|${townId}|${subject.about}`)) continue;
      if (!eligible(state, ev, townId, subject)) continue;
      const w = 1 + (inBias ? t.biasWeight : 0) + (reactive ? t.whenWeight : 0) + (state.player.townId === townId ? t.playerTownWeight : 0);
      out.push({ ev, townId, weight: ev.weight * w, subject });
    }
  }
  return out;
}

function pickOne<T>(rng: Rng, items: T[]): T | undefined {
  return items.length ? items[rng.int(0, items.length)] : undefined;
}

/** Begin `ev` in `townId` now: apply its effects and record what must lapse later. */
export function startHappening(state: SimState, ev: HappeningRow, townId: string, rng: Rng, subject: HappeningSubject = {}): ActiveHappening {
  const data = state.data as DataTables;
  const day = state.day;
  const here = state.player.townId === townId;
  const town = state.towns?.[townId];
  const act: ActiveHappening = {
    eventId: ev.id,
    townId,
    startDay: day,
    endsDay: day + Math.max(1, Math.floor(ev.durationDays ?? 0)),
    here,
    ...(subject.about ? { about: subject.about } : {}),
    ...(subject.deadName ? { deadName: subject.deadName } : {}),
    tags: [...new Set((ev.effects ?? []).flatMap((fx) => fx.tags ?? []))],
    mods: [],
  };
  let targetId: string | undefined;
  for (const fx of ev.effects ?? []) {
    const until = fx.durationDays == null ? Infinity : day + Math.max(1, fx.durationDays);
    const timed = Number.isFinite(until);
    const target = fx.target;
    if (target.startsWith('player.')) {
      if (!here && !fx.requireSkippedDenRest) continue;
      const sparkBefore = state.player.spark;
      applyEffect(state, fx, { data, rng });
      // A happening never takes the last of your spark.
      if (state.player.spark < 0) state.player.spark = Math.min(0, sparkBefore);
      if (state.player.spark < sparkBefore) pushJuice(state, 'spark.spend', { amount: sparkBefore - state.player.spark, reason: 'happening' });
      continue;
    }
    if (target.startsWith('person.')) {
      if (fx.pick && fx.pick !== 'same') targetId = pickOne(rng, pickPool(state, townId, fx.pick, subject))?.id;
      if (!targetId) continue;
      applyEffect(state, fx, { data, rng, targetId });
      if (fx.op === 'grant_mark' && fx.markId && timed) act.mods.push({ kind: 'mark', until, personId: targetId, markId: fx.markId });
      continue;
    }
    if (target === 'relapse.mul' || target === 'method.effectiveness') {
      const ctx: EffectCtx = { data, rng, mods: {} };
      applyEffect(state, fx, ctx);
      const mul = ctx.mods?.[target] ?? 1;
      if (mul === 1) continue;
      const lasts = timed ? until : act.endsDay;
      if (target === 'relapse.mul') act.mods.push({ kind: 'relapse', until: lasts, mul });
      else if (fx.methodId) act.mods.push({ kind: 'method', until: lasts, methodId: fx.methodId, mul });
      continue;
    }
    if (target === 'doctrine.exposure') {
      // Through the doctrine tick's own nudge (clamped, live doctrines only); exposure does not lapse.
      const add = Number(fx.value ?? 0);
      for (const d of Object.values(state.doctrines ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
        if (d.townId === townId && add) nudgeDoctrine(state, d.id, 'exposure', add);
      }
      continue;
    }
    if (target.startsWith('town.') && town) {
      const rep = state.legacy?.townRep?.[townId];
      const vitality = (1 - town.despair) * 100;
      const ctx: EffectCtx = { data, rng, town: { despair: town.despair, vitality, fear: rep?.fear ?? 0 } };
      applyEffect(state, fx, ctx);
      const after = ctx.town ?? {};
      const want = (after.despair ?? town.despair) - ((after.vitality ?? vitality) - vitality) / 100;
      const next = Math.max(0, Math.min(1, want));
      const dDespair = next - town.despair;
      if (dDespair !== 0) {
        town.despair = next;
        if (timed) act.mods.push({ kind: 'despair', until, delta: dDespair });
      }
      const dFear = (after.fear ?? 0) - (rep?.fear ?? 0);
      if (state.legacy && dFear !== 0) {
        const r = (state.legacy.townRep[townId] ??= { fear: 0, trust: 0 });
        r.fear += dFear;
        if (timed) act.mods.push({ kind: 'fear', until, delta: dFear });
      }
    }
  }
  const folk = folkIn(state, townId);
  // A resident carries the news: a passing visitor may be gone before the dawn line is told.
  const speakers = folk.filter((p) => p.id !== targetId && p.flame > 0 && p.name && !p.tags?.includes(VISITOR_TAG));
  act.speakerId = pickOne(rng, speakers.length ? speakers : folk.filter((p) => p.id !== targetId))?.id;
  act.targetId = targetId;
  const hs = ensureHappenings(state);
  hs.active.push(act);
  hs.lastStartDay = day;
  hs.log.push({ eventId: ev.id, townId, day, ...(subject.about ? { about: subject.about } : {}) });
  if (hs.log.length > LOG_CAP) hs.log.splice(0, hs.log.length - LOG_CAP);
  if (subject.about) {
    (hs.told ??= []).push(`${ev.id}|${townId}|${subject.about}`);
    if (hs.told.length > TOLD_CAP) hs.told.splice(0, hs.told.length - TOLD_CAP);
  }
  const line = happeningLine(state, act, 'say');
  pushJuice(state, 'happening.start', { eventId: ev.id, townId, personId: act.speakerId, targetId, line, here });
  return act;
}

/** Undo what has lapsed by today; drop happenings whose time is up. Safe to call any time the day moves. */
export function lapseHappenings(state: SimState): void {
  const hs = state.happenings;
  if (!hs) return;
  const day = state.day;
  for (const act of hs.active) {
    const town = state.towns?.[act.townId];
    act.mods = act.mods.filter((m) => {
      if (m.until > day) return true;
      if (m.kind === 'despair' && town) town.despair = Math.max(0, Math.min(1, town.despair - m.delta));
      if (m.kind === 'fear' && state.legacy?.townRep?.[act.townId]) state.legacy.townRep[act.townId]!.fear -= m.delta;
      if (m.kind === 'mark') {
        const p = state.people[m.personId];
        const mk = p?.marks?.find((x) => x.markId === m.markId);
        if (p && mk) {
          mk.stacks -= 1;
          if (mk.stacks <= 0) p.marks = p.marks!.filter((x) => x !== mk);
        }
      }
      return false;
    });
  }
  hs.active = hs.active.filter((a) => a.endsDay > day || a.mods.length > 0);
}

/** Relapse pressure for this dawn: burning people in a town under a relapse.mul happening lose a little. */
function applyRelapse(state: SimState): void {
  const t = happeningsTuning(state);
  for (const townId of new Set((state.happenings?.active ?? []).map((a) => a.townId))) {
    const mul = happeningRelapseMul(state, townId);
    if (mul === 1) continue;
    const loss = Math.round(t.relapseFlamePerDawn * (mul - 1));
    if (!loss) continue;
    for (const p of folkIn(state, townId)) {
      if (p.flame >= burnAt(state)) p.flame = Math.max(0, Math.min(FLAME_MAX, p.flame - loss));
    }
  }
}

/** One dawn: lapse old happenings, maybe start one, then the day's relapse pressure. Call after state.day advances. */
export function tickHappenings(state: SimState): ActiveHappening | undefined {
  if (!state.data || !state.towns || !happeningRows(state).length) return undefined;
  lapseHappenings(state);
  const t = happeningsTuning(state);
  // Note doctrine falls every dawn (not only on a draw), so a collapse is dated to the dawn it happened.
  if (state.doctrines && Object.values(state.doctrines).some((d) => d.collapsed)) {
    const h = ensureHappenings(state);
    h.collapsed = stampCollapses(state, h.collapsed);
  }
  const hs = state.happenings;
  let started: ActiveHappening | undefined;
  const gapOk = hs?.lastStartDay === undefined || state.day - hs.lastStartDay >= t.minGapDays;
  const roomOk = (hs?.active.filter((a) => a.endsDay > state.day).length ?? 0) < t.maxActive;
  if (state.day >= t.minDay && gapOk && roomOk) {
    const rng = deriveRng(state.seed, 'happening', state.day);
    if (rng.next() < t.chancePerDawn) {
      const pick = pickWeighted(rng, happeningCandidates(state));
      if (pick) started = startHappening(state, pick.ev, pick.townId, rng, pick.subject);
    }
  }
  applyRelapse(state);
  return started;
}

function inForce(state: SimState, townId: string | undefined): ActiveHappening[] {
  if (!townId) return [];
  return (state.happenings?.active ?? []).filter((a) => a.townId === townId);
}

/** Relapse multiplier from happenings in force in a town (1 = none). */
export function happeningRelapseMul(state: SimState, townId: string | undefined): number {
  let mul = 1;
  for (const a of inForce(state, townId)) for (const m of a.mods) if (m.kind === 'relapse' && m.until > state.day) mul *= m.mul;
  return mul;
}

/** Power multiplier on `methodId` acts toward people in a town (1 = none). */
export function happeningMethodMul(state: SimState, townId: string | undefined, methodId: string): number {
  let mul = 1;
  for (const a of inForce(state, townId)) {
    for (const m of a.mods) if (m.kind === 'method' && m.methodId === methodId && m.until > state.day) mul *= m.mul;
  }
  return mul;
}

/** Tags of happenings in force in a town (e.g. breach_open while the hill rumor lasts). */
export function happeningTags(state: SimState, townId: string | undefined): string[] {
  return [...new Set(inForce(state, townId).filter((a) => a.endsDay > state.day).flatMap((a) => a.tags))];
}

function nameOf(state: SimState, id: string | undefined): string {
  const p = id ? state.people[id] : undefined;
  return p?.name ?? p?.id ?? 'someone';
}

/** A happening told through people: 'say' (the bubble), or the dawn line. */
export function happeningLine(state: SimState, act: ActiveHappening, which: 'say' | 'news'): string {
  const ev = happeningRows(state).find((e) => e.id === act.eventId);
  if (!ev) return '';
  // A variant per happening, the same every time it is told (seed, event, town, start day).
  const variant = (v: string | string[] | undefined): string | undefined => {
    if (!Array.isArray(v)) return v || undefined;
    return v.length ? v[deriveRng(state.seed, 'happening-line', act.eventId, act.townId, act.startDay, which).int(0, v.length)] : undefined;
  };
  const tpl = which === 'say' ? variant(ev.say) ?? ev.blurb ?? '' : (act.here && variant(ev.newsHere)) || variant(ev.news) || `${ev.name} in {town}.`;
  const first = (s: string): string => s.split(/\s+/)[0] ?? s;
  return tpl
    .replace(/\{dead\}/g, act.deadName ?? 'the one they lost')
    .replace(/\{town\}/g, happeningTownName(act.townId))
    .replace(/\{name\}/g, first(nameOf(state, act.speakerId)))
    .replace(/\{target\}/g, first(nameOf(state, act.targetId)));
}

/** Dawn lines for happenings that began this dawn. */
export function happeningDawnLines(state: SimState): string[] {
  return (state.happenings?.active ?? []).filter((a) => a.startDay === state.day).map((a) => happeningLine(state, a, 'news')).filter(Boolean);
}
