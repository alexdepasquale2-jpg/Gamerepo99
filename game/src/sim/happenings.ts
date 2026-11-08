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
 */

import { prettyTownId } from './map/districts';
import { applyEffect, FLAME_MAX, type EffectCtx } from './effects';
import { loadWorldTables, pickWeighted } from './gen/load/load-world-tables';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import { deriveRng, type Rng } from './rng';
import type { Effect } from './types/data';
import type { PersonState, SimState } from './types/runtime';

export type HappeningEffectRow = Effect & {
  pick?: 'random_burning' | 'random_stalled_or_burning' | 'same';
  methodId?: string;
  requireSkippedDenRest?: boolean;
};

export type HappeningRow = {
  id: string;
  name: string;
  weight: number;
  durationDays: number;
  townBias?: string[];
  /** Only in its bias towns (e.g. your own den). */
  townStrict?: boolean;
  blurb?: string;
  /** Bubble over the speaker. {target}/{town}/{name} fill in. */
  say?: string;
  /** Dawn line heard as news. */
  news?: string;
  /** Dawn line when the player woke in that town. */
  newsHere?: string;
  effects: HappeningEffectRow[];
};

export type HappeningsTuning = {
  minDay: number;
  chancePerDawn: number;
  minGapDays: number;
  maxActive: number;
  biasWeight: number;
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
  tags: string[];
  mods: HappeningMod[];
};

export type HappeningsState = {
  active: ActiveHappening[];
  lastStartDay?: number;
  /** Recent starts, newest last (capped). */
  log: { eventId: string; townId: string; day: number }[];
};

const LOG_CAP = 20;
const DEFAULT_TUNING: HappeningsTuning = {
  minDay: 2,
  chancePerDawn: 0.35,
  minGapDays: 3,
  maxActive: 1,
  biasWeight: 3,
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

/** Map an authored bias town onto this world: the den is your home hearth; a missing town is the nearest gap. */
export function mapBiasTown(state: SimState, authoredId: string, present: string[]): string | undefined {
  const authored = ((state.data as DataTables | undefined)?.towns ?? []) as TownRow[];
  if (authored.find((t) => t.id === authoredId)?.isDen) {
    const home = state.player.homeTownId;
    return home && present.includes(home) ? home : undefined;
  }
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

function burnAt(state: SimState): number {
  return (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
}

function folkIn(state: SimState, townId: string): PersonState[] {
  return Object.values(state.people)
    .filter((p) => p.townId === townId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function pickPool(state: SimState, townId: string, pick: string): PersonState[] {
  const folk = folkIn(state, townId);
  if (pick === 'random_burning') return folk.filter((p) => p.flame >= burnAt(state));
  if (pick === 'random_stalled_or_burning') return folk.filter((p) => p.flame > 0);
  return folk;
}

/** The player rested somewhere other than their own den last night. */
function skippedDenRest(state: SimState): boolean {
  const home = state.player.homeTownId;
  return !!home && !!state.player.townId && state.player.townId !== home;
}

function eligible(state: SimState, ev: HappeningRow, townId: string): boolean {
  for (const fx of ev.effects ?? []) {
    if (fx.requireSkippedDenRest && !skippedDenRest(state)) return false;
    if (fx.pick && fx.pick !== 'same' && pickPool(state, townId, fx.pick).length === 0) return false;
  }
  // Someone besides whoever it falls on, to carry the news.
  return folkIn(state, townId).length > 1;
}

/** Weighted (event, town) pairs for this dawn, in stable order. */
export function happeningCandidates(state: SimState): { ev: HappeningRow; townId: string; weight: number }[] {
  const t = happeningsTuning(state);
  const present = Object.keys(state.towns ?? {}).sort();
  const out: { ev: HappeningRow; townId: string; weight: number }[] = [];
  for (const ev of happeningRows(state)) {
    if (!(ev.weight > 0)) continue;
    const bias = new Set((ev.townBias ?? []).map((id) => mapBiasTown(state, id, present)).filter((id): id is string => !!id));
    for (const townId of present) {
      const inBias = bias.has(townId);
      if (ev.townStrict && !inBias) continue;
      if (!eligible(state, ev, townId)) continue;
      const w = 1 + (inBias ? t.biasWeight : 0) + (state.player.townId === townId ? t.playerTownWeight : 0);
      out.push({ ev, townId, weight: ev.weight * w });
    }
  }
  return out;
}

function pickOne<T>(rng: Rng, items: T[]): T | undefined {
  return items.length ? items[rng.int(0, items.length)] : undefined;
}

/** Begin `ev` in `townId` now: apply its effects and record what must lapse later. */
export function startHappening(state: SimState, ev: HappeningRow, townId: string, rng: Rng): ActiveHappening {
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
      if (fx.pick && fx.pick !== 'same') targetId = pickOne(rng, pickPool(state, townId, fx.pick))?.id;
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
  const speakers = folk.filter((p) => p.id !== targetId && p.flame > 0 && p.name);
  act.speakerId = pickOne(rng, speakers.length ? speakers : folk.filter((p) => p.id !== targetId))?.id;
  act.targetId = targetId;
  const hs = ensureHappenings(state);
  hs.active.push(act);
  hs.lastStartDay = day;
  hs.log.push({ eventId: ev.id, townId, day });
  if (hs.log.length > LOG_CAP) hs.log.splice(0, hs.log.length - LOG_CAP);
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
  const hs = state.happenings;
  let started: ActiveHappening | undefined;
  const gapOk = hs?.lastStartDay === undefined || state.day - hs.lastStartDay >= t.minGapDays;
  const roomOk = (hs?.active.filter((a) => a.endsDay > state.day).length ?? 0) < t.maxActive;
  if (state.day >= t.minDay && gapOk && roomOk) {
    const rng = deriveRng(state.seed, 'happening', state.day);
    if (rng.next() < t.chancePerDawn) {
      const pick = pickWeighted(rng, happeningCandidates(state));
      if (pick) started = startHappening(state, pick.ev, pick.townId, rng);
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
  const tpl = which === 'say' ? ev.say ?? ev.blurb ?? '' : (act.here && ev.newsHere) || ev.news || `${ev.name} in {town}.`;
  const first = (s: string): string => s.split(/\s+/)[0] ?? s;
  return tpl
    .replace(/\{town\}/g, happeningTownName(act.townId))
    .replace(/\{name\}/g, first(nameOf(state, act.speakerId)))
    .replace(/\{target\}/g, first(nameOf(state, act.targetId)));
}

/** Dawn lines for happenings that began this dawn. */
export function happeningDawnLines(state: SimState): string[] {
  return (state.happenings?.active ?? []).filter((a) => a.startDay === state.day).map((a) => happeningLine(state, a, 'news')).filter(Boolean);
}
