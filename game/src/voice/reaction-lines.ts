/**
 * Juice → who says what. Pure: no Phaser/DOM, no sim writes. Repurposed from the old
 * src/ui/surface/reaction-lines.ts; fallback lines live in data/dialogue/surface-fallbacks.json.
 * VFX-only ids (reignite, kindle, burnout, spark spend) are handled in juice.ts, not here.
 */

import fallbackJson from '../data/dialogue/surface-fallbacks.json';
import { jobOf } from '../sim/goods/jobs';
import type { SimState } from '../sim/types/runtime';
import { expandGrammar, isGrammar, type GrammarCtx, type GrammarRules, type LinePool } from '../sim/grammar';

export type Tell = 'ember' | 'glance' | 'none';
export type Presentation = {
  kind: 'line';
  personId?: string;
  townId?: string;
  line?: string;
  tell: Tell;
  /** Stable key for the sound / tone this line carries. */
  cue: string;
};

export type PresentCtx = {
  /**
   * Someone the player can see to carry a town-level line; `excludeId` asks for someone else if possible.
   * Undefined when the town is not the player's (far news comes by letter or at dawn instead).
   */
  nearbyPersonId?: (townId?: string, excludeId?: string) => string | undefined;
  /** Slots and tags for the speaker's fallback grammar (given name, town, job, kin); see voiceAbout. */
  about?: (personId: string, townId?: string) => GrammarCtx;
};

/** Grammar context for a speaker plus any slots the payload adds (a patron's name). */
const aboutOf = (ctx: PresentCtx, personId: string, townId?: string, extra?: Record<string, string>): GrammarCtx => {
  const a = ctx.about?.(personId, townId) ?? {};
  return extra ? { ...a, slots: { ...a.slots, ...extra } } : a;
};

type FallbackFile = {
  /** Plain lists (some sim modules read these keys as lists themselves). */
  lines: Record<string, string[]>;
  /** Keys that may be a grammar, expanded with the shared `rules` (sim/grammar.ts). */
  talk: Record<string, LinePool>;
  rules: GrammarRules;
  woundChemistry: { deepAtLeast: number; slidAtMost: number };
  notorietyLevels: { id: string; min: number }[];
};
const FILE = fallbackJson as unknown as FallbackFile;
const poolOf = (key: string): LinePool | undefined => FILE.talk[key] ?? FILE.lines[key];
const authored = (key: string): boolean => {
  const p = poolOf(key);
  return !!p && (isGrammar(p) ? p.frames.length > 0 : p.length > 0);
};

/** How often each person has been handed each key this run, so they move on through the pool. */
const handed = new Map<string, number>();

/**
 * A fallback line. A plain list starts where the person's hash says, then steps on each time they say
 * that key again; a grammar expands off the same person+key+count, so a repeat gives a fresh variant.
 */
export function pickFallback(key: string, seed: string, about: GrammarCtx = {}): string {
  const pool = poolOf(key);
  if (!pool) return '';
  const k = `${key}|${seed}`;
  const n = handed.get(k) ?? 0;
  handed.set(k, n + 1);
  if (handed.size > 4000) handed.clear();
  if (isGrammar(pool)) return expandGrammar(pool, FILE.rules, about, `${k}|${n}`);
  if (!pool.length) return '';
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[(h + n) % pool.length]!;
}

/** `base.specific` when authored, else `base`. */
const keyed = (base: string, specific: string | undefined): string =>
  specific && authored(`${base}.${specific}`) ? `${base}.${specific}` : base;

/** Wound x method chemistry bucket: 'deep' / 'slid' when clearly off 1, else null (no line). */
export function woundChemistry(mul: unknown): 'deep' | 'slid' | null {
  if (typeof mul !== 'number' || !Number.isFinite(mul)) return null;
  if (mul >= FILE.woundChemistry.deepAtLeast) return 'deep';
  if (mul <= FILE.woundChemistry.slidAtMost) return 'slid';
  return null;
}

/** Highest authored notoriety level whose min the value reaches (levels in surface-fallbacks.json). */
export function notorietyLevel(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  let at: string | null = null;
  for (const l of FILE.notorietyLevels) if (n >= l.min) at = l.id;
  return at;
}

type P = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

type Entry = (p: P, ctx: PresentCtx) => Presentation | null;

const own =
  (cue: string, fb: string, tell: Tell, who: (p: P) => string | undefined, text?: (p: P) => string | undefined): Entry =>
  (p, ctx) => {
    const personId = who(p);
    return personId ? { kind: 'line', personId, tell, cue, line: text?.(p) ?? pickFallback(fb, personId, aboutOf(ctx, personId)) } : null;
  };

const nearby =
  (cue: string, fb: string, tell: Tell, text?: (p: P) => string | undefined): Entry =>
  (p, ctx) => {
    const townId = str(p.townId);
    const personId = str(p.personId) ?? ctx.nearbyPersonId?.(townId);
    return personId ? { kind: 'line', personId, townId, tell, cue, line: text?.(p) ?? pickFallback(fb, personId + fb, aboutOf(ctx, personId, townId)) } : null;
  };

/** A town-level line carried by someone in the crowd, not the person the act was about. */
const crowd =
  (cue: string, key: (p: P) => string | null, tell: Tell): Entry =>
  (p, ctx) => {
    const k = key(p);
    if (!k) return null;
    const townId = str(p.townId);
    const personId = ctx.nearbyPersonId?.(townId, str(p.personId)) ?? str(p.personId);
    const line = personId ? pickFallback(k, personId + k, aboutOf(ctx, personId, townId)) : '';
    return personId && line ? { kind: 'line', personId, townId, tell, cue, line } : null;
  };

/** The person's own line, from a fallback key chosen off the payload (null key = say nothing). */
const ownKeyed =
  (cue: string, key: (p: P) => string | null, tell: Tell): Entry =>
  (p, ctx) => {
    const personId = str(p.personId);
    const k = key(p);
    const line = personId && k ? pickFallback(k, personId + k + (str(p.interactionId) ?? ''), aboutOf(ctx, personId)) : '';
    return personId && line ? { kind: 'line', personId, tell, cue, line } : null;
  };

/** A road encounter is told back to you by someone at the far end (quiet stretches stay quiet). */
const road: Entry = (p, ctx) => {
  if (p.quiet === true) return null;
  const townId = str(p.townId);
  const personId = str(p.personId) ?? ctx.nearbyPersonId?.(townId);
  return personId ? { kind: 'line', personId, townId, tell: 'glance', cue: 'road', line: str(p.line) ?? pickFallback('road_encounter', personId + str(p.encounterId), aboutOf(ctx, personId, townId)) } : null;
};

/**
 * A townsperson where it happened notices; `{patron}` is the payload's patronName. A grammar key takes it
 * as a slot; the replace after covers a key still written as a plain list.
 */
const noticed =
  (cue: string, fb: string, tell: Tell): Entry =>
  (p, ctx) => {
    const townId = str(p.townId);
    const personId = ctx.nearbyPersonId?.(townId);
    if (!personId) return null;
    const patron = str(p.patronName) ?? 'patron';
    const line = pickFallback(fb, personId + fb + (str(p.dealId) ?? ''), aboutOf(ctx, personId, townId, { patron })).replace(/\{patron\}/g, () => patron);
    return { kind: 'line', personId, townId, tell, cue, line };
  };

/** A townsperson in `townKey`'s town says the line (payload text first, else a fallback). */
const inTown =
  (cue: string, fb: string, tell: Tell, townKey: string, text?: (p: P) => string | undefined): Entry =>
  (p, ctx) => {
    const townId = str(p[townKey]);
    const personId = ctx.nearbyPersonId?.(townId);
    return personId ? { kind: 'line', personId, townId, tell, cue, line: text?.(p) ?? pickFallback(fb, personId + fb, aboutOf(ctx, personId, townId)) } : null;
  };

/** Every juice id that surfaces. */
export const SURFACED: Record<string, Entry> = {
  'person.reaction': own('reaction', 'unspoken', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'refusal.coal_flicker': own('refusal', 'unspoken', 'none', (p) => str(p.personId), (p) => str(p.line)),
  // An authored moment landing (sim/scenario/moments-live): its line, from the person it happened to.
  'moment.beat': own('moment', 'unspoken', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'letter.deliver': own('letter', 'letter', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'rumor.spread': own('rumor', 'rumor', 'none', (p) => str(p.toPersonId), (p) => str(p.body)),
  'history.told': own('history', 'unspoken', 'none', (p) => str(p.personId), (p) => str(p.line)),
  'doctrine.voice': nearby('doctrine', 'doctrine_voice', 'none'),
  'doctrine.exposed': nearby('doctrine', 'doctrine_exposed', 'none'),
  'doctrine.suppressed': nearby('doctrine', 'doctrine_suppressed', 'none'),
  'doctrine.swap': nearby('doctrine', 'doctrine_swap', 'none'),
  'doctrine.collapse': nearby('doctrine', 'doctrine_collapse', 'none'),
  // Inner state, through the person: wound x method chemistry, the mark an act left, what the crowd now grants you.
  'person.wound': ownKeyed('wound', (p) => {
    const b = woundChemistry(p.woundMul);
    return b ? keyed(`wound_${b}`, str(p.woundId)) : null;
  }, 'none'),
  'mark.applied': ownKeyed('mark', (p) => (str(p.markId) ? keyed('mark', str(p.markId)) : null), 'glance'),
  'status.gain': crowd('status', (p) => keyed('status_gain', str(p.traitId)), 'glance'),
  'notoriety.rise': crowd('notoriety', (p) => keyed('notoriety_rise', notorietyLevel(p.notoriety) ?? undefined), 'glance'),
  'notoriety.fall': crowd('notoriety', () => 'notoriety_fall', 'glance'),
  'notoriety.attractor': nearby('notoriety', 'notoriety_attractor', 'glance'),
  'stash.theft': nearby('notoriety', 'stash_theft', 'glance'),
  'kin.birth': own('kin', 'kin_birth', 'ember', (p) => str(p.personId), (p) => str(p.line)),
  'kin.grown': own('kin', 'kin_grown', 'glance', (p) => str(p.personId), (p) => str(p.line)),
  // A death in the family (sim/economy/mortality): kin speak their own grief after the dawn news.
  'kin.death': own('kin', 'kin_death', 'none', (p) => str(p.personId), (p) => str(p.line)),
  'person.retired': own('kin', 'retired', 'glance', (p) => str(p.personId)),
  'encounter.spawn': road,
  'patron.offer': own('patron', 'patron_offer', 'none', (p) => str(p.personId), (p) => str(p.line)),
  'patron.deal': noticed('patron', 'patron_deal', 'glance'),
  'patron.fulfilled': noticed('patron', 'patron_fulfilled', 'none'),
  'patron.broken': noticed('patron', 'patron_broken', 'glance'),
  'patron.betrayed': noticed('patron', 'patron_betrayed', 'glance'),
  'stash.guard_left': nearby('notoriety', 'stash_guard_left', 'glance'),
  'stash.decay': nearby('notoriety', 'stash_decay', 'none'),
  'stash.hidden': own('stash', 'stash_hidden', 'none', (p) => str(p.personId)),
  'stash.stored': own('stash', 'stash_stored', 'none', (p) => str(p.personId)),
  'stash.guard_hired': own('stash', 'stash_guard_hired', 'none', (p) => str(p.personId)),
  'stash.withdrawn': own('stash', 'stash_withdrawn', 'none', (p) => str(p.personId)),
  'happening.start': nearby('happening', 'happening', 'glance', (p) => str(p.line)),
  // Unsilenced: the world's quieter news, always through someone nearby.
  'packet.deliver': inTown('rumor', 'packet_deliver', 'none', 'toTownId'),
  // A packet landed (sim/packets landPacket): the person it reached says what the news did to them.
  'packet.lifted': own('rumor', 'packet_lifted', 'glance', (p) => str(p.personId)),
  'packet.dimmed': own('rumor', 'packet_dimmed', 'none', (p) => str(p.personId)),
  'status.lose': nearby('notoriety', 'status_lose', 'glance'),
  'route.break': nearby('notoriety', 'route_break', 'none'),
  'stock.deliver': inTown('letter', 'stock_deliver', 'none', 'townId'),
  'caravan.arrive': inTown('letter', 'caravan_arrive', 'none', 'townId'),
  'caravan.trade': inTown('letter', 'caravan_trade', 'none', 'townId'),
  'caravan.depart': inTown('letter', 'caravan_depart', 'none', 'townId'),
  'letter.reply': inTown('letter', 'letter_reply', 'none', 'toTownId'),
  'succession.carried': own('reignite', 'succession_carried', 'ember', (p) => str(p.heirPersonId)),
  'succession.rested': nearby('reaction', 'succession_rested', 'none'),
  'legend.heard': own('rumor', 'legend_heard', 'none', (p) => str(p.personId), (p) => (Array.isArray(p.lines) ? str(p.lines[0]) : undefined)),
  'legend.act': own('reaction', 'legend_act', 'none', (p) => str(p.personId)),
  'grave.found': inTown('reaction', 'grave_found', 'none', 'townId', (p) => str(p.line)),
};

/** Ids the stream carries that have no line: VFX only (juice.ts) or another area's screen. */
export const SILENT: readonly string[] = [
  'person.reignite', 'site.kindle', 'spark.spend', 'succession.open',
  'packet.emit', 'route.travel_step', 'stock.starve', 'hoard.ending_open',
];

const given = (name: string | undefined): string | undefined => name?.split(' ')[0] || undefined;

/**
 * Who the speaker is, for the fallback grammar: given name, town, job, one of their household by name.
 * Tags let options gate on them: `job_<id>`, `kin` when they have family, `old` / `young` by age.
 * Reads state only; derived each time so a save never carries it.
 */
export function voiceAbout(state: SimState | undefined, personId: string, townId: string | undefined, townName: (id: string) => string): GrammarCtx {
  const p = state?.people[personId];
  if (!state || !p) return townId ? { slots: { town: townName(townId) } } : {};
  const town = p.townId ?? townId;
  const job = jobOf(state, personId);
  const hh = state.kin?.households.find((h) => h.adults.includes(personId));
  const partner = hh?.adults.find((a) => a !== personId);
  // a grown child who has died stays in the household's list; only name the living
  const child = hh?.kids
    .map((k) => state.kin!.children.find((c) => c.id === k))
    .find((c) => c && (!c.personId || state.people[c.personId]));
  const kin = given(partner ? state.people[partner]?.name : undefined) ?? child?.given;
  const tags = [`job_${job.id}`];
  if (kin) tags.push('kin');
  if ((p.age ?? 30) >= 55) tags.push('old');
  else if ((p.age ?? 30) < 20) tags.push('young');
  return { slots: { name: given(p.name), town: town ? townName(town) : undefined, job: job.name, kin }, tags };
}

export function presentJuice(id: string, payload: unknown, ctx: PresentCtx = {}): Presentation | null {
  const fn = SURFACED[id];
  return fn ? fn((payload ?? {}) as P, ctx) : null;
}
