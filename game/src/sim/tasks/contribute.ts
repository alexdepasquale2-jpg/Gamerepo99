/**
 * Helping by doing: one effort unit (a hold of E at a work spot) goes into the real thing.
 *   build plan   → plan.laborDone (the dawn finishes it as ever)
 *   road crew    → the road's condition, a little at a time (no stone or tools: you are a spare pair of hands)
 *   stuck wagon  → the wheel: progress01, and after a couple of heaves it rolls free
 *   site, facility, household pot → effort waits as a bonus the next dawn pays out (applyTaskDawn), so the
 *     staffing and facility loops stay as they are.
 * The player's help is capped per person per day, and the rewards are what work_alongside gave (spark,
 * the lead's flame and trust, the town's despair) spread over effort, with spark capped across all tasks.
 * Pure and deterministic.
 */
import { BUILDING_BY_ID } from '../economy/build-plans';
import { facilityById, facilityOutput } from '../economy/facilities';
import { addStock } from '../economy/food-stock';
import { noteRoadNews, ROADS, routeById } from '../economy/roads';
import { civicIfAny, siteById, SITE_KIND_BY_ID } from '../civic/sites';
import { put } from '../civic/store';
import type { SimState } from '../types/runtime';
import { noteActToday } from '../embodiment';
import { helpOf, helpIfAny, nameOf, pickLine, taskById, TASKS, verbOfTask, fillTaskLine, wagonStuck, type Task } from './tasks';

export type WorkResult = {
  ok: boolean;
  /** What the player sees (narration, or why not). */
  line: string;
  /** A line spoken by the lead, to show over their head. */
  thanks?: { personId: string; line: string };
  /** The task after the effort (absent when it is gone). */
  task?: Task;
  effort?: number;
  sparkDelta?: number;
};

export type ContributeOpts = {
  /** The interaction runtime's trust for a person, so its mirror stays in step (play-session passes it). */
  trust?: { get(id: string): number | undefined; set(id: string, v: number): void };
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Who the daily cap counts against: the lead, or the task itself when nobody leads it. */
const capKey = (t: Task): string => t.workers[0] ?? t.id;

/** Effort the player may still give this task today. */
export function effortLeft(state: SimState, t: Task): number {
  const h = helpIfAny(state);
  const given = h?.day === state.day ? h.given[capKey(t)] ?? 0 : 0;
  return Math.min(Math.max(0, TASKS.capPerPersonPerDay - given), Math.max(0, t.need));
}

/** Put effort into the thing the task is about. Returns a line for the wagon when the wheel comes free. */
function applyToThing(state: SimState, t: Task, e: number): string | null {
  const h = helpOf(state);
  switch (t.source.type) {
    case 'plan': {
      const p = state.build?.plans.find((x) => x.id === t.source.ref);
      const def = p ? BUILDING_BY_ID.get(p.kind) : undefined;
      if (p && def) { p.laborDone = Math.min(def.labor, p.laborDone + e * TASKS.plan.laborPerEffort); p.stalledDays = 0; }
      return null;
    }
    case 'road': {
      const r = routeById(state, t.source.ref);
      if (!r) return null;
      const before = r.broken;
      r.condition = Math.min(TASKS.road.ceiling, Math.max(r.condition, r.condition + e * TASKS.road.conditionPerEffort));
      if (r.broken && r.condition >= ROADS.reopenAt) r.broken = false;
      if (before && !r.broken) noteRoadNews(state, { routeId: r.id, kind: 'reopened', by: 'player' });
      return null;
    }
    case 'wagon': {
      const c = state.caravans?.find((x) => x.id === t.source.ref);
      if (!c) return null;
      c.progress01 = Math.min(0.98, c.progress01 + e * TASKS.wagon.progressPerEffort);
      h.wheel[c.id] = (h.wheel[c.id] ?? 0) + e;
      if (h.wheel[c.id]! < TASKS.wagon.effortsToFree) return null;
      h.freed[c.id] = state.day;
      state.player.coin = (state.player.coin ?? 0) + TASKS.wagon.tip;
      return TASKS.wheelFree;
    }
    default: {
      // Sites, facilities and the pot: paid out at the next dawn (applyTaskDawn).
      const cur = h.pending[t.id];
      h.pending[t.id] = { source: t.source, townId: t.townId, effort: (cur?.effort ?? 0) + e };
      return null;
    }
  }
}

/** What working beside them gives: spark (scarce), the lead's flame and trust, the town a little lighter. */
function reward(state: SimState, t: Task, e: number, opts: ContributeOpts): number {
  const R = TASKS.rewards;
  const h = helpOf(state);
  const cap = state.player.sparkMax ?? 100;
  const before = state.player.spark;
  const gain = Math.max(0, Math.min(e * R.sparkPerEffort, R.sparkPerDay - h.spark, cap - before));
  state.player.spark = before + gain;
  h.spark += gain;
  const lead = t.workers[0];
  const p = lead ? state.people[lead] : undefined;
  if (p && lead) {
    p.flame = clamp(p.flame + e * R.flamePerEffort, 0, 1);
    const trust = clamp((opts.trust?.get(lead) ?? p.trust ?? 0.5) + e * R.trustPerEffort, 0, 1);
    p.trust = trust;
    opts.trust?.set(lead, trust);
  }
  const town = state.towns?.[t.townId];
  if (town && town.economyOptIn !== false) town.despair = clamp(town.despair + e * R.despairPerEffort, 0, 1);
  return gain;
}

/**
 * The player puts `effort` units (one per hold) into a task. Writes to the real thing, rewards, and
 * returns the narration and the lead's thanks. A task that is gone, finished or capped refuses with a line.
 */
export function contribute(state: SimState, taskId: string, effort = 1, opts: ContributeOpts = {}): WorkResult {
  const t = taskById(state, taskId);
  if (!t || (t.source.type === 'wagon' && !wagonStuck(state, t.source.ref))) return { ok: false, line: TASKS.gone };
  const lead = t.workers[0];
  const vars = { name: nameOf(state, lead), goal: t.goal, verb: verbOfTask(t) };
  const left = effortLeft(state, t);
  if (left <= 0) {
    const finished = t.need <= 0;
    return { ok: false, line: finished ? TASKS.gone : lead ? fillTaskLine(TASKS.enough, vars) : TASKS.enoughNobody, task: t };
  }
  const e = Math.min(Math.max(0, effort), left);
  if (e <= 0) return { ok: false, line: TASKS.gone, task: t };
  const h = helpOf(state);
  const freed = applyToThing(state, t, e);
  const sparkDelta = reward(state, t, e, opts);
  h.byTask[t.id] = (h.byTask[t.id] ?? 0) + e;
  h.given[capKey(t)] = (h.given[capKey(t)] ?? 0) + e;
  const rec = h.today[t.id];
  h.today[t.id] = { ...(lead ? { lead } : {}), goal: t.goal, verb: verbOfTask(t), effort: (rec?.effort ?? 0) + e };
  h.rev++;
  const turn = `${t.id}|${h.byTask[t.id]}`;
  const line = freed ?? pickLine(state, lead ? TASKS.done : TASKS.doneNobody, turn, vars);
  const thanks = lead ? { personId: lead, line: pickLine(state, TASKS.thanks, `${turn}|thanks`, vars) } : undefined;
  // Spark hooks (personal-cost, spark-recovery) still key on the old work_alongside kind: real help counts as it.
  noteActToday(state, 'carry_burden', 'work_alongside');
  return { ok: true, line, ...(thanks ? { thanks } : {}), task: taskById(state, t.id), effort: e, sparkDelta };
}

// ---------- the dawn: pay out the waiting effort, remember who to hear from ----------

/** What a site makes, for the bonus: the workshop's own good, else the kind's first output. */
const SITE_GOOD: Record<string, string> = { bakery: 'bread', weavery: 'cloth', pottery: 'pots', ropewalk: 'rope', sawmill: 'timber' };

function payOut(state: SimState, p: { source: Task['source']; effort: number; townId: string }): void {
  const e = p.effort;
  if (p.source.type === 'site') {
    const s = siteById(state, p.source.ref);
    const good = s ? SITE_GOOD[s.building] ?? siteOutputs(s.kind)[0] : undefined;
    if (s && good) put(s.store, good, e * TASKS.site.outputPerEffort, 'help:player', { day: state.day, log: civicIfAny(state)?.log, label: s.id });
  } else if (p.source.type === 'facility') {
    const place = facilityById(state, p.source.ref);
    if (!place) return;
    const route = state.economyRoutes?.find((r) => r.id === place.routeId);
    const shares = route?.receiveShare ?? Object.fromEntries(place.townIds.map((t) => [t, 1 / Math.max(1, place.townIds.length)]));
    for (const out of facilityOutput(state, place)) {
      for (const [townId, share] of Object.entries(shares)) if (share > 0) addStock(state, townId, out.resourceId, out.qty * share * e * TASKS.facility.shareOfDayPerEffort);
    }
  } else if (p.source.type === 'household') {
    const town = state.towns?.[p.townId];
    if (town && town.economyOptIn !== false) town.despair = clamp(town.despair + e * TASKS.household.despairPerEffort, 0, 1);
  }
}

const siteOutputs = (kind: string): string[] => SITE_KIND_BY_ID.get(kind)?.outputs ?? [];

/** One dawn: yesterday's waiting effort pays out; yesterday's help becomes this dawn's word. */
export function applyTaskDawn(state: SimState): void {
  const h = helpIfAny(state);
  if (!h) return;
  for (const id of Object.keys(h.pending).sort()) payOut(state, h.pending[id]!);
  h.pending = {};
  const list = Object.keys(h.today).sort().map((id) => h.today[id]!).map(({ lead, goal, verb }) => ({ ...(lead ? { lead } : {}), goal, verb }));
  h.told = list.length ? { day: state.day, list } : undefined;
  h.today = {};
}

/** At dawn, the people you worked beside tell the town (two at most). */
export function taskDawnLines(state: SimState): string[] {
  const told = helpIfAny(state)?.told;
  if (!told || told.day !== state.day) return [];
  return told.list.filter((x) => x.lead && state.people[x.lead]).slice(0, 2).map((x, i) =>
    pickLine(state, TASKS.dawn, `dawn|${x.lead}|${i}`, { name: nameOf(state, x.lead), goal: x.goal, verb: x.verb }));
}
