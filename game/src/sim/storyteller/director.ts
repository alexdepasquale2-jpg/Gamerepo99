/**
 * The storyteller: the one scheduler for everything that befalls the district you are in. Where a flat
 * chance per dawn gave the same drizzle of small events for ever, a teller gives the days a shape: a quiet
 * spell to build in, signs that something is coming, a crisis sized to what you have built, and room to
 * mend after. It never tells the same thing twice running, holds its hand while you are down (if it is a
 * merciful one), and its troubles are things you can answer: packs to rout outside a raided town, a
 * blighted town to keep fed, a sick one to keep lit. How they end is up to you, and the tale goes on from
 * the ending. News comes through people (a `happening.start` bubble, the dawn lines, the board's Tidings).
 *
 * One dawn (tickStoryteller, in the dawn pipeline where the happenings draw used to be):
 *   1. happenings lapse; incidents past their day are decided (won or lost) or simply end;
 *   2. tension eases, points come in (more as days pass and as you grow rich);
 *   3. the phase turns when its days are up;
 *   4. a chain (arc) takes its next step if one is due; otherwise the phase's chance decides whether
 *      something begins, and its kind weights decide what: an everyday happening, a boon, an omen, a
 *      twist, a threat, or the first step of an arc.
 * Pure + deterministic: every draw is deriveRng(seed, 'story', day, ...).
 */
import { heroIfAny } from '../hero/hero';
import { matchTownWhen } from '../happening-world';
import { beginHappeningsDawn, endHappeningsDawn, happeningCandidates, happeningsTuning, happeningTownName, startHappening } from '../happenings';
import { pushJuice } from '../packets';
import { deriveRng, type Rng } from '../rng';
import type { SimState } from '../types/runtime';
import { residentsOf } from '../visitors';
import { arcById, incidentById, STORY, tellerById, type Arc, type DrawKind, type Family, type Incident, type Op, type Teller } from './data';
import { applyOps, holds, neighbourDistrict, otherName } from './ops';
import { storyOf, type ActiveIncident, type StoryState } from './state';

const T = STORY.tuning;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const firstName = (s: string | undefined): string => (s ?? 'someone').split(/\s+/)[0]!;

type Pick<X> = { item: X; weight: number };
function weighted<X>(rng: Rng, xs: Pick<X>[]): X | undefined {
  const total = xs.reduce((n, x) => n + x.weight, 0);
  if (!(total > 0)) return undefined;
  let r = rng.next() * total;
  for (const x of xs) { r -= x.weight; if (r <= 0) return x.item; }
  return xs[xs.length - 1]!.item;
}

/** How hard trouble lands today: it grows with the days and with what you own. */
export function intensityOf(state: SimState, teller: Teller = tellerById(storyOf(state).teller)): number {
  const coin = state.player.coin ?? 0, level = heroIfAny(state)?.level ?? 1;
  const f = clamp((state.day / T.dayRamp) * 0.6 + (coin / T.wealthCoin) * 0.2 + (level - 1) * 0.05, 0, 1);
  return (T.intensity[0] + (T.intensity[1] - T.intensity[0]) * f) * teller.threatMul;
}

/** A merciful teller holds trouble back while you are nearly out, or your town nearly is. */
export function mercyNow(state: SimState, teller: Teller): boolean {
  if (!teller.mercy) return false;
  const max = state.player.sparkMax ?? 100;
  return state.player.spark < max * T.mercySpark || (state.towns?.[state.player.townId ?? '']?.despair ?? 0) > T.mercyDespair;
}

/** 1 for something not told lately; less the more recently it was. */
function novelty(s: StoryState, id: string): number {
  const back = s.recent.length - 1 - s.recent.lastIndexOf(id);
  if (!s.recent.includes(id)) return 1;
  return back < T.noveltySpan[0] ? T.novelty[0] : back < T.noveltySpan[1] ? T.novelty[1] : 1;
}

function remember(s: StoryState, id: string, day: number): void {
  s.last[id] = day;
  s.recent.push(id);
  if (s.recent.length > 12) s.recent.splice(0, s.recent.length - 12);
}

/** Towns an incident can befall, weighted: where you are first, your home next. */
function townsFor(state: SimState, inc: Incident, s: StoryState): Pick<string>[] {
  const out: Pick<string>[] = [];
  for (const townId of Object.keys(state.towns ?? {}).sort()) {
    if (inc.where === 'here' && state.player.townId !== townId) continue;
    if (residentsOf(state, townId).length < 2) continue;
    if (inc.days && s.active.some((a) => a.townId === townId)) continue;
    if (inc.when && !matchTownWhen(state, townId, inc.when, state.happenings?.collapsed ?? {})) continue;
    out.push({ item: townId, weight: state.player.townId === townId ? 3 : state.player.homeTownId === townId ? 2 : 1 });
  }
  return out;
}

function speakerIn(state: SimState, townId: string, rng: Rng): string | undefined {
  const folk = residentsOf(state, townId);
  const lit = folk.filter((id) => state.people[id]!.flame > 0);
  const pool = lit.length ? lit : folk;
  return pool.length ? pool[rng.int(0, pool.length)] : undefined;
}

/** Say it through someone: the bubble now, the dawn line for the morning. */
function tell(state: SimState, s: StoryState, eventId: string, townId: string, say: string[], news: string[], rng: Rng, other?: string): void {
  const speaker = speakerIn(state, townId, rng);
  const fill = (tpl: string | undefined): string =>
    (tpl ?? '').replace(/\{town\}/g, happeningTownName(townId)).replace(/\{name\}/g, firstName(speaker ? state.people[speaker]?.name : undefined)).replace(/\{other\}/g, otherName(state, other));
  const line = fill(say.length ? say[rng.int(0, say.length)] : undefined);
  const heard = fill(news.length ? news[rng.int(0, news.length)] : undefined);
  if (heard) s.news.push({ day: state.day, line: heard, townId });
  pushJuice(state, 'happening.start', { eventId, townId, personId: speaker, line: line || heard, here: state.player.townId === townId, source: 'story' });
}

/** Begin an incident in a town now. */
export function fireIncident(state: SimState, inc: Incident, townId: string, rng: Rng, arcId?: string): ActiveIncident | undefined {
  const s = storyOf(state), teller = tellerById(s.teller);
  const intensity = inc.kind === 'threat' ? intensityOf(state, teller) : 1;
  const active: ActiveIncident | undefined = inc.days ? { id: inc.id, townId, start: state.day, ends: state.day + inc.days, intensity, ...(arcId ? { arc: arcId } : {}) } : undefined;
  const other = inc.ops.some((o) => o.op === 'feud') || [...inc.say, ...inc.news].some((l) => l.includes('{other}')) ? neighbourDistrict(state, rng) : undefined;
  applyOps(state, inc.ops, { townId, intensity, rng, ...(active ? { active } : {}) }, other);
  if (active) s.active.push(active);
  remember(s, inc.id, state.day);
  s.points = Math.max(0, s.points - inc.cost);
  s.tension = clamp(s.tension + inc.tension, 0, 100);
  s.lastFire = state.day;
  s.log.push({ day: state.day, id: inc.id, townId, kind: inc.kind });
  if (s.log.length > T.logKeep) s.log.splice(0, s.log.length - T.logKeep);
  tell(state, s, inc.id, townId, inc.say, inc.news, rng, other);
  return active;
}

/** An incident in force ends, well or badly. */
function settle(state: SimState, a: ActiveIncident, outcome: 'won' | 'lost'): void {
  const s = storyOf(state), inc = incidentById(a.id);
  s.active = s.active.filter((x) => x !== a);
  if (s.arc && a.arc === s.arc.id) s.arc.outcome = outcome;
  if (!inc?.resolve || !state.towns?.[a.townId]) return;
  const rng = deriveRng(state.seed, 'story-end', a.id, a.townId, a.start);
  const ops: Op[] = outcome === 'won' ? inc.resolve.win : inc.resolve.lose;
  applyOps(state, ops, { townId: a.townId, intensity: a.intensity, rng, active: a });
  s.tension = clamp(s.tension + (outcome === 'won' ? -15 : 5), 0, 100);
  s.log.push({ day: state.day, id: a.id, townId: a.townId, kind: inc.kind, outcome });
  const lines = outcome === 'won' ? inc.resolve.winLines : inc.resolve.loseLines;
  tell(state, s, `${a.id}_${outcome}`, a.townId, lines, lines, rng);
}

/**
 * You routed a pack near a town (combat/spawner, when the last of it falls). If packs of that family were
 * gathering there, it counts; the last one needed ends the incident well, there and then.
 */
export function routPack(state: SimState, family: Family, nearTown: string | undefined, worth = 1): { left: number; done: boolean } | null {
  const s = storyOf(state);
  const a = s.active.find((x) => x.townId === nearTown && x.family === family && (x.routed ?? 0) < (x.need ?? 0));
  if (!a) return null;
  a.routed = (a.routed ?? 0) + worth;
  const left = Math.max(0, (a.need ?? 0) - a.routed);
  if (left === 0) settle(state, a, 'won');
  return { left, done: left === 0 };
}

function income(state: SimState, teller: Teller): number {
  return teller.income * (0.5 + Math.min(1, state.day / T.dayRamp)) + Math.min(T.wealthMax, (state.player.coin ?? 0) / T.wealthCoin);
}

function turnPhase(state: SimState, s: StoryState, teller: Teller): void {
  const cur = teller.phases[s.phase] ?? Object.values(teller.phases)[0]!;
  const next = teller.phases[cur.next] ? cur.next : Object.keys(teller.phases)[0]!;
  const p = teller.phases[next]!;
  s.cycle += 1;
  s.phase = next;
  s.phaseEnds = state.day + p.days[0] + deriveRng(state.seed, 'story-phase', s.cycle).int(0, p.days[1] - p.days[0] + 1);
}

const cooled = (s: StoryState, id: string, cooldown: number | undefined, day: number): boolean => s.last[id] === undefined || day - s.last[id]! >= (cooldown ?? 0);

/** Start a chain: its first step now, the rest on their days. */
export function startArc(state: SimState, arc: Arc, townId: string, rng: Rng): boolean {
  const s = storyOf(state);
  if (s.arc) return false;
  s.arc = { id: arc.id, step: 0, due: state.day, townId };
  s.points = Math.max(0, s.points - arc.cost);
  remember(s, `arc:${arc.id}`, state.day);
  return stepArc(state, rng);
}

/** The running chain's next step, if its day has come. */
function stepArc(state: SimState, rng: Rng): boolean {
  const s = storyOf(state), run = s.arc, arc = arcById(run?.id);
  if (!run || !arc) { delete s.arc; return false; }
  const step = arc.steps[run.step];
  // The town emptied, or the chain ran out: the tale lets it drop.
  if (!step || !state.towns?.[run.townId]) { delete s.arc; return false; }
  // A step that turns on how the last one ended waits for that ending.
  if (!step.incident && !run.outcome && s.active.some((a) => a.arc === run.id)) return false;
  const inc = incidentById(step.incident ?? (run.outcome === 'won' ? step.won : step.lost));
  // One trouble at a town at a time: a step that would stand at its gate waits for the one already there.
  if (inc?.days && s.active.some((a) => a.townId === run.townId)) return false;
  delete run.outcome;
  if (inc) fireIncident(state, inc, run.townId, rng, arc.id);
  run.step += 1;
  const next = arc.steps[run.step];
  if (next) run.due = state.day + next.after;
  else delete s.arc;
  return !!inc;
}

/** Whether, and what, begins this dawn. */
function draw(state: SimState, s: StoryState, teller: Teller, rng: Rng): void {
  const phase = teller.phases[s.phase]!;
  if (rng.next() >= phase.chance) return;
  const day = state.day, mercy = mercyNow(state, teller);
  const timed = s.active.length;
  const lastTold = s.recent[s.recent.length - 1];
  // What the running chain will tell is the chain's to tell.
  const inArc = new Set((arcById(s.arc?.id)?.steps ?? []).flatMap((x) => [x.incident, x.won, x.lost]));
  const incidentsOf = (kind: Incident['kind']): Pick<{ inc: Incident; towns: Pick<string>[] }>[] => {
    if (kind === 'threat' && (mercy || s.tension > teller.tensionCap)) return [];
    const out: Pick<{ inc: Incident; towns: Pick<string>[] }>[] = [];
    for (const inc of STORY.incidents) {
      if (inc.kind !== kind || inc.arcOnly || !(inc.weight > 0) || day < (inc.minDay ?? 0) || inc.cost > s.points) continue;
      if (!cooled(s, inc.id, inc.cooldown, day) || lastTold === inc.id || inArc.has(inc.id)) continue;
      if (inc.days && timed >= 2) continue;
      const towns = townsFor(state, inc, s);
      if (towns.length) out.push({ item: { inc, towns }, weight: inc.weight * novelty(s, inc.id) });
    }
    return out;
  };
  const everyday = (): Pick<ReturnType<typeof happeningCandidates>[number]>[] =>
    happeningCandidates(state)
      .filter((c) => !state.happenings?.active.some((a) => a.eventId === c.ev.id && a.townId === c.townId && a.endsDay > day))
      .map((c) => ({ item: c, weight: c.weight * novelty(s, c.ev.id) }));
  const arcs = (): Pick<Arc>[] =>
    s.arc || mercy || s.tension > teller.tensionCap || timed >= 2
      ? []
      : STORY.arcs.filter((a) => day >= (a.minDay ?? 0) && a.cost <= s.points && cooled(s, `arc:${a.id}`, a.cooldown, day) && a.steps[0]?.incident !== lastTold).map((a) => ({ item: a, weight: a.weight * novelty(s, `arc:${a.id}`) }));

  const pools = { everyday: everyday(), boon: incidentsOf('boon'), omen: incidentsOf('omen'), twist: incidentsOf('twist'), threat: incidentsOf('threat'), arc: arcs() };
  const kinds = (Object.keys(phase.kinds) as DrawKind[]).map((k) => ({ item: k, weight: pools[k].length ? (phase.kinds[k] ?? 0) * (mercy && k === 'boon' ? 2 : 1) : 0 }));
  const kind = weighted(rng, kinds);
  if (!kind) return;
  if (kind === 'everyday') {
    const c = weighted(rng, pools.everyday);
    if (!c) return;
    startHappening(state, c.ev, c.townId, rng, c.subject);
    remember(s, c.ev.id, day);
    s.lastFire = day;
    s.log.push({ day, id: c.ev.id, townId: c.townId, kind: 'everyday' });
    return;
  }
  if (kind === 'arc') {
    const arc = weighted(rng, pools.arc);
    const first = incidentById(arc?.steps[0]?.incident);
    const townId = arc && first ? weighted(rng, townsFor(state, first, s)) : undefined;
    if (arc && townId) startArc(state, arc, townId, rng);
    return;
  }
  const pick = weighted(rng, pools[kind]);
  const townId = pick ? weighted(rng, pick.towns) : undefined;
  if (pick && townId) fireIncident(state, pick.inc, townId, rng);
}

/** One dawn of the tale. Call after state.day advances (scenario-advance; civic/lod on a long wait). */
export function tickStoryteller(state: SimState): void {
  if (!state.data || !state.towns) return;
  beginHappeningsDawn(state);
  const s = storyOf(state), teller = tellerById(s.teller);
  const day = state.day;
  s.news = s.news.filter((n) => n.day >= day);
  // A district you walked out on keeps its own troubles; here they are only this district's towns.
  s.active = s.active.filter((a) => !!state.towns?.[a.townId]);
  for (const a of [...s.active]) {
    if (a.ends > day) continue;
    const inc = incidentById(a.id);
    settle(state, a, inc?.resolve?.by === 'when' && holds(state, a.townId, inc.resolve.when) ? 'won' : 'lost');
  }
  s.tension = Math.max(0, s.tension - teller.tensionDecay);
  s.points = Math.min(T.pointsCap, s.points + income(state, teller));
  if (!teller.phases[s.phase] || day >= s.phaseEnds) turnPhase(state, s, teller);
  const rng = deriveRng(state.seed, 'story', day);
  let stepped = false;
  if (s.arc && day >= s.arc.due) stepped = stepArc(state, rng);
  if (!stepped && day >= happeningsTuning(state).minDay && (s.lastFire === undefined || day - s.lastFire >= teller.minGap)) draw(state, s, teller, rng);
  endHappeningsDawn(state);
}
