/**
 * Replies to the player's letters. When a letter is delivered, its recipient takes a day or
 * two to write back, then a courier carries the reply home along the same roads (days from road
 * distance, see road-journey). Tone and content are shaped by the recipient's trust, flame and
 * town, the social web around them, and any Blessing or Burden that comes to pass through the
 * letter. Pure, deterministic (deriveRng + sorted iteration); saveable (plain JSON on state.letters).
 */

import repliesJson from '../data/dialogue/letter-replies.json';
import { pushJuice } from './packets';
import { deriveRng } from './rng';
import { planRoad, positionOnLegs, reverseLegs, type RoadLeg, type RoadPosition } from './road-journey';
import { createSocialGraph } from './social/social-graph';
import type { SocialEdge, SocialEdgeKind } from './social/social-types';
import { surfaceUnspokenInReply } from './social/unspoken';
import type { SimState } from './types/runtime';
import type { DataTables } from './load-data';
import { ensureLetters, edgesOf } from './letters-scale';

export type ReplyTone = 'warm' | 'hopeful' | 'guarded' | 'weary' | 'bitter';
export type ReplyStatus = 'writing' | 'travelling' | 'arrived' | 'lost';

export type LetterReply = {
  id: string;
  /** The player letter (flight id) this answers. */
  letterId: string;
  fromPersonId: string;
  fromTownId: string;
  toTownId: string;
  status: ReplyStatus;
  /** Dawns left before the writer finishes (status writing). */
  writeLeft: number;
  legs: RoadLeg[];
  roadDays: number;
  /** Dawns left on the road (status travelling). */
  daysLeft: number;
  quote: string;
  sentDay: number;
  arrivedDay?: number;
  read: boolean;
  tone?: ReplyTone;
  title?: string;
  body?: string;
  /** A Blessing or Burden that came to pass in this reply. */
  surfaced?: { kind: 'blessing' | 'burden'; outcomeId: string; classId: string };
};

type ToneTable = { title: string; openers: string[]; echoes: string[]; closers: string[] };
type Table = {
  courierSurvivalPerDay: number;
  writeDays: { base: number; heavyDespair: number; lowFlame: number; max: number };
  tones: Record<ReplyTone, ToneTable>;
  town: { shortage: string[]; heavy: string[]; steady: string[] };
  web: Record<SocialEdgeKind | 'struggling', string[]>;
  postscript: { blessing: string; burden: string };
};
const T = repliesJson as unknown as Table;

export const COURIER_SURVIVAL_PER_DAY = T.courierSurvivalPerDay;
/** Letter tags a reply adds to the circumstance in which a Blessing or Burden may come to pass. */
export const REPLY_TAGS = ['letter_arrived', 'show_up_day'] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const nameOf = (state: SimState, id: string): string => state.people[id]?.name ?? id;
export const prettyTown = (id: string): string => id.split('_').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
const pick = <X>(arr: X[], rng: { int(lo: number, hi: number): number }): X => arr[rng.int(0, arr.length)]!;
const fill = (text: string, slots: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);

export function repliesOf(state: SimState): LetterReply[] {
  return (ensureLetters(state).replies ??= []);
}
export const unreadReplies = (state: SimState): number => (state.letters?.replies ?? []).filter((r) => r.status === 'arrived' && !r.read).length;
export function markReplyRead(state: SimState, id: string): boolean {
  const r = state.letters?.replies?.find((x) => x.id === id);
  if (!r || r.status !== 'arrived' || r.read) return false;
  r.read = true;
  return true;
}
export function markAllRead(state: SimState): void {
  for (const r of state.letters?.replies ?? []) if (r.status === 'arrived') r.read = true;
}

const GRATEFUL = /\b(thank|thanks|grateful|sorry|forgive|miss|hope|remember|kind|proud)\b/i;
const PUSHY = /\b(owe|owes|debt|pay|demand|must|deserve|fault|blame)\b/i;

type Ties = { score: number; neighbour?: { id: string; edge: SocialEdge } };

/** How the writer's social web leans toward the player's town, plus one neighbour worth mentioning. */
function webTies(state: SimState, writerId: string, originTown: string): Ties {
  const d = (state.data ?? {}) as Partial<DataTables>;
  const edges = edgesOf(state, d.socialWeb).filter((e) => e.a === writerId || e.b === writerId);
  const graph = createSocialGraph(edges);
  const weight: Record<SocialEdgeKind, number> = { kin: 0.08, friendship: 0.05, trade: 0.02, debt: -0.02, rival: -0.12 };
  let score = 0;
  let best: { id: string; edge: SocialEdge; rank: number } | undefined;
  const writerTown = state.people[writerId]?.townId;
  for (const n of graph.neighbors(writerId)) {
    const other = state.people[n.id];
    if (!other) continue;
    if (other.townId === originTown) score += weight[n.edge.kind] * (0.5 + n.edge.weight);
    // Prefer a neighbour in the writer's own town, then the strongest tie, then id (stable).
    const rank = (other.townId === writerTown ? 10 : 0) + (other.flame < 12 ? 3 : 0) + n.edge.weight + (n.edge.kind === 'rival' ? 1 : 0);
    if (!best || rank > best.rank || (rank === best.rank && n.id < best.id)) best = { id: n.id, edge: n.edge, rank };
  }
  return { score: clamp(score, -0.2, 0.2), neighbour: best && { id: best.id, edge: best.edge } };
}

export type ToneRead = { tone: ReplyTone; score: number };

/** Pure tone rule: higher score is warmer. Exposed for tests and the panel. */
export function toneFor(score: number, despair: number, surfaced?: 'blessing' | 'burden'): ReplyTone {
  if (surfaced === 'burden') return 'bitter';
  if (despair >= 0.55) return 'weary';
  if (score < 0.15) return 'bitter';
  if (score < 0.4) return 'guarded';
  return score >= 0.65 ? 'warm' : 'hopeful';
}

export function toneScore(state: SimState, writerId: string, originTown: string, letterText: string, surfaced?: 'blessing' | 'burden'): number {
  const w = state.people[writerId];
  const despair = state.towns?.[w?.townId ?? '']?.despair ?? 0;
  const ties = webTies(state, writerId, originTown);
  const heat = state.hoard?.notoriety ?? 0;
  return (
    0.3 +
    clamp(w?.trust ?? 0, 0, 1) * 0.3 +
    clamp((w?.flame ?? 0) / 50, 0, 1) * 0.2 -
    despair * 0.35 -
    clamp(heat, 0, 1) * 0.1 +
    ties.score +
    (GRATEFUL.test(letterText) ? 0.1 : 0) -
    (PUSHY.test(letterText) ? 0.1 : 0) +
    (surfaced === 'blessing' ? 0.2 : surfaced === 'burden' ? -0.25 : 0)
  );
}

function writeDays(state: SimState, writerId: string, id: string): number {
  const w = state.people[writerId];
  const despair = state.towns?.[w?.townId ?? '']?.despair ?? 0;
  const rng = deriveRng(state.seed, 'reply-write', id);
  const n = T.writeDays.base + (despair >= 0.55 ? T.writeDays.heavyDespair : 0) + ((w?.flame ?? 0) < 10 ? T.writeDays.lowFlame * rng.int(0, 2) : 0);
  return clamp(n, 1, T.writeDays.max);
}

/** The recipient reads the letter: start a reply. The road home mirrors the road the letter took. */
export function beginReply(state: SimState, f: { id: string; toPersonId: string; fromTownId: string; toTownId: string; legs?: RoadLeg[]; body?: string }): LetterReply | null {
  const replies = repliesOf(state);
  if (replies.some((r) => r.letterId === f.id)) return null;
  const home = planRoad(state, f.toTownId, f.fromTownId);
  const legs = home?.legs ?? (f.legs ? reverseLegs(f.legs) : []);
  const reply: LetterReply = {
    id: `rep_${f.id}`,
    letterId: f.id,
    fromPersonId: f.toPersonId,
    fromTownId: f.toTownId,
    toTownId: f.fromTownId,
    status: 'writing',
    writeLeft: writeDays(state, f.toPersonId, f.id),
    legs,
    roadDays: home?.days ?? 2,
    daysLeft: 0,
    quote: (f.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 70),
    sentDay: state.day,
    read: false,
  };
  replies.push(reply);
  return reply;
}

/**
 * Write the reply: pick a tone (surfacing a Blessing/Burden first, since it colours the tone),
 * then compose an opener, an echo of the player's words, a line about the town and the web, and
 * a postscript if a latent came to pass. `roll` is injected by tests to force a surfacing.
 */
export function composeReply(state: SimState, reply: LetterReply, opts: { roll?: () => number } = {}): void {
  const rng = deriveRng(state.seed, 'reply-compose', reply.id);
  const hit = surfaceUnspokenInReply(state, reply.fromPersonId, { tags: REPLY_TAGS, roll: opts.roll, rollKey: reply.id });
  const surfaced = hit?.outcome.kind;
  const despair = state.towns?.[reply.fromTownId]?.despair ?? 0;
  const score = toneScore(state, reply.fromPersonId, reply.toTownId, reply.quote, surfaced);
  const tone = toneFor(score, despair, surfaced);
  const tt = T.tones[tone];
  const ties = webTies(state, reply.fromPersonId, reply.toTownId);
  const stock = state.towns?.[reply.fromTownId]?.stock?.food_grain;
  const townLine = pick(stock !== undefined && stock < 4 ? T.town.shortage : despair >= 0.4 ? T.town.heavy : T.town.steady, rng);
  const n = ties.neighbour;
  const nb = n && state.people[n.id];
  const webKey: SocialEdgeKind | 'struggling' | undefined = n && nb ? (nb.flame < 8 && n.edge.kind !== 'rival' ? 'struggling' : n.edge.kind) : undefined;
  const slots: Record<string, string> = {
    fromName: nameOf(state, reply.fromPersonId),
    fromTown: prettyTown(reply.fromTownId),
    originTown: prettyTown(reply.toTownId),
    quote: reply.quote,
    neighbour: n ? nameOf(state, n.id) : 'a neighbour',
    neighbourTown: nb?.townId ? prettyTown(nb.townId) : prettyTown(reply.fromTownId),
  };
  const parts = [
    pick(tt.openers, rng),
    reply.quote ? pick(tt.echoes, rng) : '',
    townLine,
    webKey ? pick(T.web[webKey], rng) : '',
    pick(tt.closers, rng),
  ].filter(Boolean).map((p) => fill(p, slots));
  let body = parts.join(' ');
  if (hit && surfaced) body += '\n\n' + fill(T.postscript[surfaced], { line: hit.line ?? '' }).trim();
  reply.tone = tone;
  reply.title = fill(tt.title, slots);
  reply.body = body;
  if (hit) reply.surfaced = { kind: hit.outcome.kind, outcomeId: hit.outcome.id, classId: hit.classId };
}

/**
 * One dawn of reply logistics: writers finish, couriers advance one day along the road, and
 * arrivals become readable (unread). Returns ids of replies that arrived. Call before new
 * deliveries so a reply never skips a day.
 */
export function tickReplies(state: SimState): string[] {
  const replies = state.letters?.replies;
  if (!replies?.length) return [];
  const arrived: string[] = [];
  for (const r of replies) {
    if (r.status === 'writing') {
      r.writeLeft -= 1;
      if (r.writeLeft > 0) continue;
      composeReply(state, r);
      r.status = 'travelling';
      r.daysLeft = r.roadDays;
      continue;
    }
    if (r.status !== 'travelling') continue;
    r.daysLeft -= 1;
    if (r.daysLeft > 0) continue;
    // Long roads still thin mail, more gently than a rumour's reach.
    if (deriveRng(state.seed, 'reply-thin', r.id).next() >= Math.pow(COURIER_SURVIVAL_PER_DAY, Math.max(0, r.roadDays - 1))) {
      r.status = 'lost';
      r.read = true;
      continue;
    }
    r.status = 'arrived';
    r.arrivedDay = state.day;
    arrived.push(r.id);
    pushJuice(state, 'letter.reply', { replyId: r.id, fromPersonId: r.fromPersonId, toTownId: r.toTownId, tone: r.tone, surfaced: r.surfaced?.kind });
  }
  return arrived;
}

/** Where a reply's courier is right now (undefined unless it is on the road). */
export function replyPosition(r: LetterReply): RoadPosition | undefined {
  return r.status === 'travelling' ? positionOnLegs(r.legs, r.roadDays - r.daysLeft) : undefined;
}

/** Every courier currently on a road: the player's outbound letters and incoming replies. */
export function couriersOnRoad(state: SimState): { id: string; kind: 'letter' | 'reply'; pos: RoadPosition }[] {
  const out: { id: string; kind: 'letter' | 'reply'; pos: RoadPosition }[] = [];
  const ls = state.letters;
  if (!ls) return out;
  for (const f of ls.flight) {
    if (f.fromPersonId !== state.player.id || !f.legs || f.roadDays === undefined) continue;
    const pos = positionOnLegs(f.legs, f.roadDays - f.days);
    if (pos) out.push({ id: f.id, kind: 'letter', pos });
  }
  for (const r of ls.replies ?? []) {
    const pos = replyPosition(r);
    if (pos) out.push({ id: r.id, kind: 'reply', pos });
  }
  return out;
}

export type InboxEntry = { id: string; unread: boolean; from: string; title: string; tone: ReplyTone; day: number; body: string; blessing?: 'blessing' | 'burden' };

/** Arrived replies, newest first, ready for the L panel. */
export function inboxEntries(state: SimState): InboxEntry[] {
  return (state.letters?.replies ?? [])
    .filter((r) => r.status === 'arrived')
    .map((r) => ({
      id: r.id,
      unread: !r.read,
      from: nameOf(state, r.fromPersonId),
      title: r.title ?? 'A reply',
      tone: r.tone ?? 'guarded',
      day: r.arrivedDay ?? r.sentDay,
      body: r.body ?? '',
      blessing: r.surfaced?.kind,
    }))
    .sort((a, b) => b.day - a.day || (a.id < b.id ? 1 : -1));
}

/** One line per letter the player sent, saying where it and its answer are on the road. */
export function outgoingLines(state: SimState): string[] {
  const ls = state.letters;
  return (ls?.correspondence ?? []).slice(-8).map((n) => {
    const who = nameOf(state, n.toPersonId);
    if (n.status === 'lost') return `To ${who} · lost on the road`;
    if (n.status === 'travelling') return `To ${who} · on the road, ${ls!.flight.find((f) => f.id === n.id)?.days ?? '?'} dawn(s) to go`;
    const r = ls?.replies?.find((x) => x.letterId === n.id);
    if (!r) return `To ${who} · delivered`;
    if (r.status === 'writing') return `To ${who} · delivered, ${who} is writing back`;
    if (r.status === 'travelling') return `To ${who} · a reply is on the road, ${r.daysLeft} dawn(s) to go`;
    if (r.status === 'lost') return `To ${who} · delivered, but the reply never came home`;
    return `To ${who} · answered${r.read ? '' : ' (unread)'}`;
  });
}
