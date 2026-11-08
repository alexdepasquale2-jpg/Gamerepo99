/**
 * Authored moments in play. Each special-bar scenario (data/systems/scenarios) is read as a pattern:
 * "the player does <method> to <resolved person> (in <town>) with <conditions>, then <rests>, and
 * <expect> holds". When live play matches it, the moment's authored beat surfaces once per save
 * through the people involved (`moment.beat` juice → bubbles; dawn lines for beats that land at dawn).
 *
 * Read from the scenario row:
 *   steps     method steps in order (same day; other acts may come between); approach/note/metrics are
 *             walking up, not conditions; record steps capture values; trailing advance steps are rests.
 *   setup     townId (only when this world has that town: the person must live there); ensure: tagsInclude
 *             and burning true/false (at/under the reignite threshold) are conditions, checked when the
 *             first method lands; exact flame/marks values are harness setup, not conditions.
 *   expect    refused, busContainsAny, people.* (hasMark, hasMarkAny, marksUnchanged, siteKindled,
 *             flameMin, flameLessThanRecord as "not above"), player.sparkDecreasedSinceStart, compare,
 *             playerCanNameChange.anyOf. Harness-only keys (metrics, menu, lines, hooksFiredAny,
 *             packets, *Optional) are not live conditions.
 *   beat      authored lines ({who, text}), optional dawnLine ("{name}"), archetypeOnly (match the
 *             row's archetypeId against the inhabitant's: a data match, not a system branch).
 * seed/worldSeed are test fields and ignored. People resolve through resolveScenarioPerson, so a
 * moment lands on the matching person in generated worlds. Pure and deterministic: no RNG draws.
 */
import { pushJuice } from '../packets';
import type { DataTables } from '../load-data';
import type { PersonState, SimState } from '../types/runtime';
import type { PlayLastResolve } from '../play-session/play-session-types';
import { resolveScenarioPerson, siteKindFromSiteId, type ScenarioPersonQuery } from './scenario-resolve';
import firstTen from '../../data/systems/scenarios/first_10_minutes_ashford_hook.json';
import chalk from '../../data/systems/scenarios/moment_chalk_after_the_cut.json';
import markBack from '../../data/systems/scenarios/moment_mark_comes_back.json';
import nail from '../../data/systems/scenarios/moment_nail_across_the_water.json';
import coal from '../../data/systems/scenarios/moment_refusal_coal.json';
import loaf from '../../data/systems/scenarios/moment_warm_loaf_cold_hill.json';

export type MomentStep = { op: string; personId?: string; methodId?: string; targetPersonId?: string; to?: string; as?: string; path?: string };
export type MomentEnsure = { personId: string; flame?: number; burning?: boolean; marks?: string[]; tagsInclude?: string[] };
type PersonExpect = { hasMark?: string; hasMarkAny?: string[]; marksUnchanged?: boolean; siteKindled?: boolean; flameMin?: number; flameLessThanRecord?: string };
export type MomentExpect = {
  refused?: boolean;
  busContainsAny?: string[];
  people?: Record<string, PersonExpect>;
  player?: { sparkDecreasedSinceStart?: boolean };
  compare?: { paths: string[]; rule: string };
  playerCanNameChange?: { anyOf: string[] };
};
export type MomentBeat = { lines: { who: string; text: string }[]; dawnLine?: string; archetypeOnly?: boolean };
export type MomentRow = {
  id: string;
  title?: string;
  archetypeId: string;
  setup?: { townId?: string; ensure?: MomentEnsure[] };
  steps: MomentStep[];
  expect: MomentExpect;
  resolvePerson?: ScenarioPersonQuery;
  specialBar?: boolean;
  beat?: MomentBeat;
};

/** Every shipped special-bar scenario that carries an authored beat. */
export const MOMENTS: readonly MomentRow[] = ([firstTen, chalk, markBack, nail, coal, loaf] as unknown as MomentRow[]).filter((r) => r.specialBar && r.beat);

export const momentById = (id: string): MomentRow | undefined => MOMENTS.find((m) => m.id === id);

type Progress = {
  /** Index of the next method step to match. */
  next: number;
  day: number;
  /** Scenario person id → live person id. */
  ids: Record<string, string>;
  records: Record<string, number>;
  bus: string[];
  /** People whose site kindled during the moment's own acts and rests. */
  kindled: string[];
  refused: boolean;
  spark0: number;
  flame0: Record<string, number>;
  marks0: Record<string, string>;
  /** Set once every method step matched: the rests still owed before expect is read. */
  wait?: { fromDay: number; dawns: number };
};
export type MomentSeen = { day: number; personId: string; atDawn: boolean };
type MomentsFlag = { seen: Record<string, MomentSeen>; open: Record<string, Progress> };

function flag(state: SimState): MomentsFlag {
  const f = ((state.flags ??= {}).moments ??= { seen: {}, open: {} }) as MomentsFlag;
  f.seen ??= {};
  f.open ??= {};
  return f;
}

/** Moments this save has already seen (id → when and on whom). */
export function seenMoments(state: SimState): Record<string, MomentSeen> {
  return { ...(((state.flags?.moments as MomentsFlag | undefined)?.seen) ?? {}) };
}

const methodSteps = (row: MomentRow): MomentStep[] => row.steps.filter((s) => s.op === 'method');

/** Resolutions made during one settle (people do not change mid-settle); cleared after it. */
let resolved: Map<string, string | undefined> | null = null;

/**
 * The scenario's resolvePerson anchor resolves through resolveScenarioPerson (anchor, else the first
 * person matching its wound/tags/site). Other authored people match by id; play worlds always carry
 * the authored anchors, so they are there.
 */
function liveId(state: SimState, row: MomentRow, sid: string): string | undefined {
  const q = row.resolvePerson;
  if (q && sid !== q.preferAnchorId) return state.people[sid] ? sid : undefined;
  const key = `${row.id}\u0000${sid}`;
  if (resolved?.has(key)) return resolved.get(key);
  const source = {
    listPeople: () =>
      Object.values(state.people).map((p) => ({ id: p.id, woundId: p.woundId, tags: p.tags, siteId: p.siteId, siteKind: p.siteKind ?? siteKindFromSiteId(p.siteId), townId: p.townId, anchor: p.anchor })),
  };
  const id = resolveScenarioPerson(source, q ?? { preferAnchorId: sid });
  resolved?.set(key, id);
  return id;
}

function idOf(state: SimState, row: MomentRow, prog: Progress | undefined, sid: string): string | undefined {
  if (prog?.ids[sid]) return prog.ids[sid];
  const id = liveId(state, row, sid);
  if (id && prog) prog.ids[sid] = id;
  return id;
}

const markSig = (p?: { marks?: PersonState['marks'] }): string =>
  (p?.marks ?? []).filter((m) => m.stacks > 0).map((m) => `${m.markId}:${m.stacks}`).sort().join(',');

const threshold = (state: SimState): number => ((state.data as DataTables | undefined)?.reigniteThreshold as number | undefined) ?? 35;

type Pre = { spark: number; personId?: string; flame?: number; marks?: string };

/** Who someone is (tags) and whether they burn are conditions; exact flame/marks values are harness setup. */
function ensureHolds(state: SimState, e: MomentEnsure, person: PersonState, pre: Pre): boolean {
  const flame = person.id === pre.personId ? (pre.flame ?? person.flame) : person.flame;
  if (e.burning === true && flame < threshold(state)) return false;
  if (e.burning === false && flame >= threshold(state)) return false;
  if (e.tagsInclude?.some((t) => !(person.tags ?? []).includes(t))) return false;
  return true;
}

function startHolds(state: SimState, row: MomentRow, prog: Progress, pre: Pre): boolean {
  const town = row.setup?.townId;
  const first = methodSteps(row)[0]!;
  const target = state.people[prog.ids[first.targetPersonId!]!];
  if (town && Object.values(state.people).some((p) => p.townId === town) && target?.townId !== town) return false;
  for (const e of row.setup?.ensure ?? []) {
    const id = idOf(state, row, prog, e.personId);
    const p = id ? state.people[id] : undefined;
    if (!p) {
      // An authored person this world lacks only matters when it is the one acted on.
      if (e.personId === first.targetPersonId) return false;
      continue;
    }
    if (!ensureHolds(state, e, p, pre)) return false;
  }
  return true;
}

function runRecords(state: SimState, row: MomentRow, prog: Progress, afterMethod: number, resolve?: PlayLastResolve): void {
  // Record steps that sit after the afterMethod-th method step (and before the next method).
  let seen = -1;
  for (const s of row.steps) {
    if (s.op === 'method') seen += 1;
    else if (s.op === 'record' && seen === afterMethod && s.as && s.path) {
      const parts = s.path.split('.');
      let v: number | undefined;
      if (parts[0] === 'lastResolve' && resolve) v = (resolve as unknown as Record<string, number>)[parts[1]!];
      else if (parts[0] === 'people' && parts[2] === 'flame') {
        const id = idOf(state, row, prog, parts[1]!);
        v = id ? state.people[id]?.flame : undefined;
      }
      if (typeof v === 'number') prog.records[s.as] = v;
    }
  }
}

function trailingRests(row: MomentRow): number {
  let lastMethod = -1;
  row.steps.forEach((s, i) => {
    if (s.op === 'method') lastMethod = i;
  });
  // A dusk is the evening of this day; a rest (dusk+dawn) or any day passing settles it.
  return row.steps.slice(lastMethod + 1).filter((s) => s.op === 'advance').reduce((n, s) => n + (s.to === 'dusk' ? 1 : s.to === 'dawn' || s.to === 'day' ? 1 : 0), 0);
}

function personExpectHolds(state: SimState, prog: Progress, id: string, exp: PersonExpect): boolean {
  const p = state.people[id];
  if (!p) return false;
  const marks = (p.marks ?? []).filter((m) => m.stacks > 0).map((m) => m.markId);
  if (exp.hasMark && !marks.includes(exp.hasMark)) return false;
  if (exp.hasMarkAny && !exp.hasMarkAny.some((m) => marks.includes(m))) return false;
  if (exp.marksUnchanged && markSig(p) !== (prog.marks0[id] ?? '')) return false;
  if (exp.siteKindled && !prog.kindled.includes(id)) return false;
  if (typeof exp.flameMin === 'number' && p.flame < exp.flameMin) return false;
  if (exp.flameLessThanRecord) {
    // Live reading: the cut has not healed (no warmth back above the record). Nothing cools a person
    // overnight yet, so a strict drop would make the moment unreachable.
    const rec = prog.records[exp.flameLessThanRecord];
    if (typeof rec !== 'number' || p.flame > rec) return false;
  }
  return true;
}

function changeNamed(state: SimState, row: MomentRow, prog: Progress, path: string): boolean {
  const [head, sid, what] = path.split('.');
  if (head !== 'people' || !sid) return false;
  const id = idOf(state, row, prog, sid);
  const p = id ? state.people[id] : undefined;
  if (!p || !id) return false;
  if (what === 'siteKindled') return prog.kindled.includes(id);
  // A change the player can name: a mark they did not carry when the moment began.
  if (what === 'hasMarkAny') return markSig(p) !== '' && markSig(p) !== (prog.marks0[id] ?? '');
  if (what === 'flameChanged') return prog.flame0[id] !== undefined && p.flame !== prog.flame0[id];
  return false;
}

function expectHolds(state: SimState, row: MomentRow, prog: Progress): boolean {
  const ex = row.expect;
  if (!!ex.refused !== prog.refused) return false;
  if (ex.busContainsAny?.length && !ex.busContainsAny.some((id) => prog.bus.includes(id))) return false;
  for (const [sid, exp] of Object.entries(ex.people ?? {})) {
    const id = idOf(state, row, prog, sid);
    if (!id) {
      if (methodSteps(row).some((s) => s.targetPersonId === sid)) return false;
      continue;
    }
    if (!personExpectHolds(state, prog, id, exp)) return false;
  }
  if (ex.player?.sparkDecreasedSinceStart && !(state.player.spark < prog.spark0)) return false;
  if (ex.compare?.rule === 'at_least_one_pair_differs') {
    const ps = ex.compare.paths;
    let differs = false;
    for (let i = 0; i + 1 < ps.length; i += 2) {
      const a = prog.records[ps[i]!], b = prog.records[ps[i + 1]!];
      if (typeof a === 'number' && typeof b === 'number' && a !== b) differs = true;
    }
    if (!differs) return false;
  }
  const any = ex.playerCanNameChange?.anyOf;
  if (any?.length && !any.some((path) => changeNamed(state, row, prog, path))) return false;
  return true;
}

const pretty = (id: string): string => id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const nameOf = (state: SimState, id: string): string => (state.people[id]?.name ?? pretty(id)).split(' ')[0]!;

function fire(state: SimState, row: MomentRow, prog: Progress, f: MomentsFlag): void {
  const first = methodSteps(row)[0]!;
  const personId = prog.ids[first.targetPersonId!]!;
  f.seen[row.id] = { day: state.day, personId, atDawn: !!prog.wait && prog.wait.dawns > 0 };
  delete f.open[row.id];
  for (const l of row.beat?.lines ?? []) {
    const id = idOf(state, row, prog, l.who);
    if (!id || !state.people[id]) continue;
    pushJuice(state, 'moment.beat', { momentId: row.id, personId: id, line: l.text, title: row.title });
  }
}

/** Lines heard on waking for moments that landed at this dawn. */
export function momentDawnLines(state: SimState): string[] {
  const f = state.flags?.moments as MomentsFlag | undefined;
  const out: string[] = [];
  for (const row of MOMENTS) {
    const seen = f?.seen?.[row.id];
    if (!seen?.atDawn || seen.day !== state.day || !row.beat?.dawnLine) continue;
    out.push(row.beat.dawnLine.replace(/\{name\}/g, nameOf(state, seen.personId)));
  }
  return out;
}

function parseAct(actionId: string): { methodId: string; personId: string } | null {
  const at = actionId.indexOf('@');
  if (at <= 0 || actionId.startsWith('approach@')) return null;
  return { methodId: actionId.slice(0, at), personId: actionId.slice(at + 1) };
}

/**
 * Call before an act or a rest (snapshots the acted-on person); call the returned function after it
 * with the session's last resolve. Advances every open moment and fires any whose pattern completed.
 */
export function beginMomentAct(state: SimState, actionId: string): (resolve?: PlayLastResolve) => void {
  const busLen = state.bus?.lastIds?.length ?? 0;
  const act = parseAct(actionId);
  const person = act ? state.people?.[act.personId] : undefined;
  const pre: Pre = { spark: state.player?.spark ?? 0, ...(person ? { personId: person.id, flame: person.flame, marks: markSig(person) } : {}) };
  // Whose site kindled during this act or rest (lastIds carries ids only, not payloads).
  const kindled: string[] = [];
  const bus = state.bus as { on?: (e: string, h: (p: unknown) => void) => () => void } | undefined;
  const off = bus?.on?.('site.kindle', (p) => {
    const id = (p as { personId?: unknown } | undefined)?.personId;
    if (typeof id === 'string') kindled.push(id);
  });
  return (resolve) => {
    off?.();
    resolved = new Map();
    try {
      settle(state, act, busLen, pre, kindled, resolve);
    } finally {
      resolved = null;
    }
  };
}

function settle(state: SimState, act: { methodId: string; personId: string } | null, busLen: number, pre: Pre, kindled: string[], resolve?: PlayLastResolve): void {
  if (!state.people) return;
  const juice = state.bus?.lastIds?.slice(busLen) ?? [];
  const absorb = (p: Progress): void => {
    for (const id of juice) if (!p.bus.includes(id)) p.bus.push(id);
    for (const id of kindled) if (!p.kindled.includes(id)) p.kindled.push(id);
  };
  // An act landed when the person answered it: a reaction, or a refusal beat.
  const landed = juice.includes('person.reaction') || juice.includes('refusal.coal_flicker');
  const refused = juice.includes('refusal.coal_flicker');
  const f = flag(state);
  for (const row of MOMENTS) {
    if (f.seen[row.id]) continue;
    if (row.beat?.archetypeOnly && row.archetypeId !== state.player.archetypeId) continue;
    const steps = methodSteps(row);
    if (!steps.length) continue;
    let prog: Progress | undefined = f.open[row.id];
    if (prog && !prog.wait && prog.day !== state.day) {
      delete f.open[row.id];
      prog = undefined;
    }
    if (prog) prog.kindled ??= [];
    // Only the moment's own acts and the rests after them count toward what it expects to see.
    if (prog && !act) absorb(prog);
    if (act && landed && state.people[act.personId] && (!prog || !prog.wait)) {
      const matches = (s: MomentStep, p?: Progress) => s.methodId === act.methodId && idOf(state, row, p, s.targetPersonId!) === act.personId;
      const step = (p: Progress, k: number): void => {
        p.next = k + 1;
        p.refused ||= refused;
        absorb(p);
        if (p.flame0[act.personId] === undefined) p.flame0[act.personId] = pre.personId === act.personId ? (pre.flame ?? 0) : state.people[act.personId]!.flame;
        if (p.marks0[act.personId] === undefined) p.marks0[act.personId] = pre.personId === act.personId ? (pre.marks ?? '') : markSig(state.people[act.personId]);
        runRecords(state, row, p, k, resolve);
      };
      if (prog && matches(steps[prog.next]!, prog)) step(prog, prog.next);
      else if (matches(steps[0]!)) {
        const fresh: Progress = { next: 0, day: state.day, ids: {}, records: {}, bus: [], kindled: [], refused: false, spark0: pre.spark, flame0: {}, marks0: {} };
        fresh.ids[steps[0]!.targetPersonId!] = act.personId;
        if (startHolds(state, row, fresh, pre)) {
          step(fresh, 0);
          f.open[row.id] = prog = fresh;
        }
      }
    }
    if (!prog) continue;
    if (!prog.wait && prog.next >= steps.length) prog.wait = { fromDay: state.day, dawns: trailingRests(row) };
    if (!prog.wait || state.day - prog.wait.fromDay < prog.wait.dawns) continue;
    if (expectHolds(state, row, prog)) fire(state, row, prog, f);
    else delete f.open[row.id];
  }
}
