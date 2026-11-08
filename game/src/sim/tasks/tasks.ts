/**
 * Tasks: what each person is working on, read off the systems that already run, so the player can help
 * by doing (hold E at the work spot) instead of picking "work alongside" from a menu.
 *
 * A task is derived, never stored: build plans in their building stage, civic sites that trade, facility
 * crews, road crews, a wagon stuck in a rut, and each town's household pot. Same state + day → same
 * tasks (deterministic rng only). The list is cached per state, day and help revision, so the world layer
 * and the folk may ask for it every frame.
 * Pure: no Phaser/DOM. Positions are tile maths; road, wagon and hearth spots are placed by the world.
 */
import { trackedTable } from '../data-use-people';
import tasksJson from '../../data/systems/tasks.json';
import { activePlans, BUILDING_BY_ID, PLAYER_OWNER, type Claim } from '../economy/build-plans';
import { claimRect } from '../economy/borders';
import { facilityPlaces } from '../economy/facilities';
import { roadNeedsMending } from '../economy/roads';
import { canWork, sitesIn, type Site } from '../civic/sites';
import { TILE_PX } from '../map/constants';
import { deriveRng } from '../rng';
import { usedToday } from '../contrib/use-effects';
import type { SimState } from '../types/runtime';

// By-key reads of kinds / goals count as use (a task of that kind or goal is on offer).
export const TASKS = trackedTable('systems/tasks', tasksJson as unknown as TasksTable, ['kinds', 'goals']);
type KindRow = { look: string; spot: string; verb: string };
export type TasksTable = {
  holdMs: number; tapMs: number; capPerPersonPerDay: number;
  rewards: { sparkPerEffort: number; sparkPerDay: number; flamePerEffort: number; despairPerEffort: number; trustPerEffort: number };
  plan: { laborPerEffort: number };
  site: { needPerDay: number; outputPerEffort: number };
  facility: { needPerDay: number; shareOfDayPerEffort: number };
  household: { needPerDay: number; despairPerEffort: number; minFlame: number };
  road: { conditionPerEffort: number; ceiling: number };
  wagon: { stuckChance: number; progressPerEffort: number; effortsToFree: number; tip: number };
  kinds: Record<string, KindRow>;
  goals: Record<string, string>;
  hint: string; hintNobody: string; done: string[]; doneNobody: string[]; thanks: string[];
  wheelFree: string; enough: string; enoughNobody: string; gone: string; dawn: string[];
};

export type TaskKind = 'cook' | 'process' | 'saw' | 'mine' | 'build' | 'mend' | 'farm' | 'haul-free' | 'road';
export type TaskHorizon = 'short' | 'mid' | 'long';
export type TaskSource = { type: 'plan' | 'site' | 'facility' | 'road' | 'wagon' | 'household'; ref: string };

/**
 * Where the work happens. `key` is the work spot's Thing key (`prop:work@<taskId>`). x, y (world px, the
 * spot's foot) are set when the sim can place it; otherwise the world places it from `road` (a point
 * along a route), `wagon` (follows the caravan) or `hearth` (beside a town's hearth).
 */
export type TaskSpot = {
  key: string; look: string; name: string;
  x?: number; y?: number;
  road?: { routeId: string; f: number };
  wagon?: string;
  hearth?: string;
};

export type Task = {
  id: string;
  kind: TaskKind;
  source: TaskSource;
  /** The town the task belongs to (the first of a road's or facility's towns). */
  townId: string;
  townIds: string[];
  /** People at it, the lead first. A stuck wagon has none (its driver is nobody you know). */
  workers: string[];
  spot: TaskSpot;
  /** "raising a smithy", "milling the harvest". */
  goal: string;
  /** 0..1 done (long tasks: the whole build; daily tasks: today's share). */
  progress: number;
  /** Effort units still wanted (long: to finish; daily: today). */
  need: number;
  horizon: TaskHorizon;
};

/** Per-day help book-keeping (lazily created on state; see contribute.ts). Only read here. */
export type TaskHelp = {
  day: number;
  rev: number;
  /** Effort given today, by task and by lead (or task id when nobody leads). */
  byTask: Record<string, number>;
  given: Record<string, number>;
  spark: number;
  /** Site, facility and pot effort waiting for the next dawn. */
  pending: Record<string, { source: TaskSource; effort: number; townId: string }>;
  /** What was done today (for tomorrow's dawn lines). */
  today: Record<string, { lead?: string; goal: string; verb: string; effort: number }>;
  /** Yesterday's help, told at this dawn. */
  told?: { day: number; list: { lead?: string; goal: string; verb: string }[] };
  /** Wagons whose wheel is free today, and effort on each wheel. */
  freed: Record<string, number>;
  wheel: Record<string, number>;
};
type WithHelp = SimState & { taskHelp?: TaskHelp };
export const helpIfAny = (state: SimState): TaskHelp | undefined => (state as WithHelp).taskHelp;
export const helpOf = (state: SimState): TaskHelp => {
  const s = state as WithHelp;
  const h = (s.taskHelp ??= { day: state.day, rev: 0, byTask: {}, given: {}, spark: 0, pending: {}, today: {}, freed: {}, wheel: {} });
  // A new day clears the day's counters; pending effort and the told list wait for their dawn.
  if (h.day !== state.day) { h.day = state.day; h.byTask = {}; h.given = {}; h.spark = 0; h.wheel = {}; h.freed = {}; }
  return h;
};

export const spotKeyOf = (taskId: string): string => `prop:work@${taskId}`;
/** The task id in a spot key (`prop:work@<id>`, `work@<id>`) or a bare id. */
export const taskIdOfKey = (key: string): string => key.replace(/^prop:/, '').replace(/^work@/, '');

const pretty = (id: string): string => id.replace(/_/g, ' ');
const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const article = (w: string): string => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const kindRow = (k: TaskKind): KindRow => TASKS.kinds[k] ?? { look: 'frame', spot: 'Work', verb: 'with the work' };
const spotFor = (id: string, kind: TaskKind, at: Partial<TaskSpot>): TaskSpot => ({ key: spotKeyOf(id), look: kindRow(kind).look, name: kindRow(kind).spot, ...at });
const isPerson = (state: SimState, id: string | null | undefined): id is string => !!id && id !== PLAYER_OWNER && !!state.people[id];

/** The front of a footprint: a little in from its bottom-right corner, clear of the plot's own stake. */
function claimSpot(state: SimState, c: Pick<Claim, 'townId' | 'dx' | 'dy' | 'w' | 'h'>): { x: number; y: number } | null {
  const r = claimRect(state, c as Claim);
  return r ? { x: r.q1 * TILE_PX - TILE_PX * 0.8, y: r.r1 * TILE_PX - TILE_PX * 0.6 } : null;
}

const daily = (state: SimState, id: string, needPerDay: number): { progress: number; need: number } => {
  const done = helpIfAny(state)?.day === state.day ? helpIfAny(state)!.byTask[id] ?? 0 : 0;
  return { progress: Math.min(1, done / needPerDay), need: Math.max(0, needPerDay - done) };
};

// ---------- the sources ----------

function planTasks(state: SimState): Task[] {
  const out: Task[] = [];
  for (const p of activePlans(state)) {
    if (p.stage !== 'building') continue;
    const def = BUILDING_BY_ID.get(p.kind);
    const claim = state.build?.claims.find((c) => c.id === p.claimId);
    const at = claim ? claimSpot(state, claim) : null;
    if (!def || !at) continue;
    const id = `plan-${p.id}`;
    const name = def.name.toLowerCase();
    out.push({
      id, kind: 'build', source: { type: 'plan', ref: p.id }, townId: p.townId, townIds: [p.townId],
      workers: isPerson(state, p.ownerId) ? [p.ownerId] : [],
      spot: spotFor(id, 'build', at),
      goal: p.ownerId === PLAYER_OWNER ? `raising your ${name}` : fill(TASKS.goals.plan!, { a: article(name), building: name }),
      progress: Math.min(1, p.laborDone / Math.max(1, def.labor)), need: Math.max(0, (def.labor - p.laborDone) / TASKS.plan.laborPerEffort), horizon: 'long',
    });
  }
  return out;
}

/** What kind of work a trading site is, by its site kind and the building it stands in. */
function siteKind(s: Site): TaskKind | null {
  switch (s.kind) {
    case 'farm': return 'farm';
    case 'mill': return 'process';
    case 'camp': return 'saw';
    case 'smithy': return 'mend';
    case 'workshop': return s.building === 'bakery' ? 'cook' : 'process';
    default: return null;
  }
}

function siteTasks(state: SimState): Task[] {
  const out: Task[] = [];
  for (const s of sitesIn(state)) {
    // Crew-run sites are the facilities (below); building sites are the plans (above).
    if (s.crewRun || s.status !== 'working' || s.source.type !== 'company') continue;
    const kind = siteKind(s);
    const at = s.plot && 'dx' in s.plot ? claimSpot(state, { townId: s.townId, ...s.plot }) : s.plot && 'q' in s.plot ? { x: s.plot.q * TILE_PX + TILE_PX * 1.5, y: s.plot.r * TILE_PX + TILE_PX } : null;
    if (!kind || !at) continue;
    const workers = [...new Set([s.managerId, ...s.workers].filter((w): w is string => isPerson(state, w) && canWork(state, w, true)))];
    if (!workers.length) continue;
    const id = `site-${s.id}`;
    out.push({
      id, kind, source: { type: 'site', ref: s.id }, townId: s.townId, townIds: [s.townId], workers,
      spot: spotFor(id, kind, at), goal: TASKS.goals[s.building] ?? TASKS.goals[s.kind] ?? TASKS.goals.workshop!,
      ...daily(state, id, TASKS.site.needPerDay), horizon: 'mid',
    });
  }
  return out;
}

const FACILITY_KIND: Record<string, TaskKind> = { mill: 'process', lumber_camp: 'saw', mine: 'mine', waystation: 'cook' };

function facilityTasks(state: SimState): Task[] {
  const out: Task[] = [];
  for (const f of facilityPlaces(state)) {
    const kind = FACILITY_KIND[f.kind];
    const staff = state.facilityStaff?.[f.id];
    if (!kind || !staff || staff.idle) continue;
    const workers = staff.crew.filter((c): c is string => isPerson(state, c));
    if (!workers.length) continue;
    const id = `fac-${f.id}`;
    // Left of the building (its crew stand on the right), so the spot and the facility are told apart.
    const at = { x: f.q * TILE_PX + TILE_PX / 2 - TILE_PX * 1.3, y: f.r * TILE_PX + TILE_PX + 6 };
    out.push({
      id, kind, source: { type: 'facility', ref: f.id }, townId: f.townIds[0] ?? '', townIds: [...f.townIds], workers,
      spot: spotFor(id, kind, at), goal: TASKS.goals[`facility.${f.kind}`] ?? `working at ${f.name}`,
      ...daily(state, id, TASKS.facility.needPerDay), horizon: 'mid',
    });
  }
  return out;
}

function roadTasks(state: SimState): Task[] {
  const out: Task[] = [];
  const crews = state.roadway?.crews ?? {};
  for (const routeId of Object.keys(crews).sort()) {
    const hand = crews[routeId];
    const r = state.economyRoutes?.find((x) => x.id === routeId);
    if (!r || !roadNeedsMending(r) || !isPerson(state, hand)) continue;
    const id = `road-${routeId}`;
    // The crew works one stretch, seeded per road: off the ends, where the towns are.
    const f = 0.3 + deriveRng(state.seed, 'task-road', routeId).next() * 0.4;
    const left = Math.max(0, TASKS.road.ceiling - r.condition);
    out.push({
      id, kind: 'road', source: { type: 'road', ref: routeId }, townId: r.fromTownId, townIds: [r.fromTownId, r.toTownId], workers: [hand],
      spot: spotFor(id, 'road', { road: { routeId, f } }),
      goal: r.broken ? TASKS.goals['road.broken']! : TASKS.goals.road!,
      progress: Math.min(1, r.condition / TASKS.road.ceiling), need: left / TASKS.road.conditionPerEffort, horizon: r.broken ? 'short' : 'mid',
    });
  }
  return out;
}

/** A rolling wagon sits in a rut today (seeded per wagon and day), or its road is broken, until freed. */
export function wagonStuck(state: SimState, caravanId: string): boolean {
  const c = state.caravans?.find((x) => x.id === caravanId);
  if (!c || c.phase) return false;
  const h = helpIfAny(state);
  if (h?.day === state.day && h.freed[c.id] === state.day) return false;
  // Lifted the old way (the body act) counts as freed too.
  if (usedToday(state, `body.lift@${c.id}`)) return false;
  if (state.economyRoutes?.find((r) => r.id === c.routeId)?.broken) return true;
  return deriveRng(state.seed, 'task-wagon-stuck', c.id, state.day).next() < TASKS.wagon.stuckChance;
}

function wagonTasks(state: SimState): Task[] {
  const out: Task[] = [];
  for (const c of state.caravans ?? []) {
    if (!wagonStuck(state, c.id)) continue;
    const r = state.economyRoutes?.find((x) => x.id === c.routeId);
    const id = `wagon-${c.id}`;
    const done = helpIfAny(state)?.day === state.day ? helpIfAny(state)!.wheel[c.id] ?? 0 : 0;
    out.push({
      id, kind: 'haul-free', source: { type: 'wagon', ref: c.id }, townId: r?.fromTownId ?? '', townIds: r ? [r.fromTownId, r.toTownId] : [], workers: [],
      spot: spotFor(id, 'haul-free', { wagon: c.id }), goal: TASKS.goals.wagon!,
      progress: Math.min(1, done / TASKS.wagon.effortsToFree), need: Math.max(0, TASKS.wagon.effortsToFree - done), horizon: 'short',
    });
  }
  return out;
}

/** Each town's pot: one resident cooks for the households today (seeded per town and day). */
function householdTasks(state: SimState): Task[] {
  const out: Task[] = [];
  const byTown = new Map<string, string[]>();
  for (const p of Object.values(state.people)) {
    if (!p.townId || p.flame < TASKS.household.minFlame || !canWork(state, p.id)) continue;
    (byTown.get(p.townId) ?? byTown.set(p.townId, []).get(p.townId)!).push(p.id);
  }
  for (const townId of Object.keys(state.towns ?? {}).sort()) {
    const folk = byTown.get(townId)?.sort();
    if (!folk?.length) continue;
    const cook = folk[deriveRng(state.seed, 'task-cook', townId, state.day).int(0, folk.length)]!;
    const id = `pot-${townId}`;
    out.push({
      id, kind: 'cook', source: { type: 'household', ref: townId }, townId, townIds: [townId], workers: [cook],
      spot: spotFor(id, 'cook', { hearth: townId }), goal: TASKS.goals.household!,
      ...daily(state, id, TASKS.household.needPerDay), horizon: 'short',
    });
  }
  return out;
}

// ---------- the list, cached ----------

type Cache = { sig: string; list: Task[]; byId: Map<string, Task>; byPerson: Map<string, Task> };
const CACHE = new WeakMap<SimState, Cache>();

const sigOf = (state: SimState): string => {
  const h = helpIfAny(state);
  // Things that change inside a day: help given, plans going up, wagons coming and going, road crews.
  return [state.day, h?.day === state.day ? h.rev : 0, state.build?.plans.length ?? 0, activePlans(state).filter((p) => p.stage === 'building').length,
    state.caravans?.map((c) => `${c.id}${c.phase ?? ''}`).join(',') ?? '', Object.keys(state.roadway?.crews ?? {}).length].join('|');
};

/** Every task in the live district, deterministic for a state and day. */
export function tasksOf(state: SimState): Task[] {
  return cache(state).list;
}

function cache(state: SimState): Cache {
  const sig = sigOf(state);
  const hit = CACHE.get(state);
  if (hit && hit.sig === sig) return hit;
  const list = [...planTasks(state), ...siteTasks(state), ...facilityTasks(state), ...roadTasks(state), ...wagonTasks(state), ...householdTasks(state)];
  const byPerson = new Map<string, Task>();
  // A person's own task: the first that names them, long work before daily chores.
  for (const t of list) for (const w of t.workers) if (!byPerson.has(w)) byPerson.set(w, t);
  const c: Cache = { sig, list, byId: new Map(list.map((t) => [t.id, t])), byPerson };
  CACHE.set(state, c);
  return c;
}

/** Tasks belonging to a town (by any of their towns). */
export const tasksNear = (state: SimState, townId: string): Task[] => tasksOf(state).filter((t) => t.townIds.includes(townId));
export const taskById = (state: SimState, id: string): Task | undefined => cache(state).byId.get(taskIdOfKey(id));
/** The task a person is at today, if any. */
export const personTask = (state: SimState, personId: string): Task | undefined => cache(state).byPerson.get(personId);

// ---------- words ----------

export const nameOf = (state: SimState, id: string | undefined): string => {
  const n = (id && state.people[id]?.name) || (id ? pretty(id) : '');
  return n.split(' ')[0] ?? n;
};
export const verbOfTask = (t: Task): string => kindRow(t.kind).verb;

/** "Hold to help Mara with the cooking." */
export function taskHint(state: SimState, t: Task): string {
  const lead = t.workers[0];
  return lead ? fill(TASKS.hint, { name: nameOf(state, lead), verb: verbOfTask(t) }) : fill(TASKS.hintNobody, { verb: verbOfTask(t) });
}

/** A line from a list, seeded per save, task, day and turn. */
export function pickLine(state: SimState, lines: string[], salt: string, vars: Record<string, string>): string {
  if (!lines.length) return '';
  const s = lines[deriveRng(state.seed, 'task-line', salt, state.day).int(0, lines.length)]!;
  const out = fill(s, vars);
  return out[0] ? out[0].toUpperCase() + out.slice(1) : out;
}
export { fill as fillTaskLine };
