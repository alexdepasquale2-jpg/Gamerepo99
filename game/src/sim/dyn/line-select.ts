/** Fabric reaction-line blend selector. Pure; wires via state-scoped setReactionLineSelector. */

import { noteUse } from '../data-use-people';
import type { DataTables } from '../load-data';
import {
  pickFixedReactionLine,
  setReactionLineSelector,
  type ReactionLineResult,
  type ReactionPickCtx,
} from '../method-reactions';
import { buildStateVector, type PersonStateVector } from './person-vector';
import { dampRecent, linesSaid } from './line-memory';
import { genericVoiceLine, placeBias, placeOf } from './generic-voice';
import { createRng } from '../rng';
import { kinStrainOf, STRAINED } from '../social/kin-strain';
import type { SimState } from '../types/runtime';
import {
  scoreFragment,
  violatesConstraints,
  type Constraint,
  type Frag,
} from './line-score';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * This person's kin strain across the gap: the ctx value when the caller passed one, else a
 * `flags.kinStrain` override (tests / dev), else derived from where their kin live (social/kin-strain).
 */
export function kinStrainFor(ctx: ReactionPickCtx): number {
  if (typeof ctx.kinStrain === 'number') return clamp01(ctx.kinStrain);
  const flag = (ctx.state.flags as { kinStrain?: unknown }).kinStrain;
  if (typeof flag === 'number') return clamp01(flag);
  return kinStrainOf(ctx.state, ctx.personId);
}

function memoryTags(ctx: ReactionPickCtx): Set<string> {
  const person = ctx.state.people[ctx.personId];
  const tags = new Set<string>(person?.tags ?? []);
  for (const m of person?.marks ?? []) tags.add(`mark:${m.markId}`);
  if (person?.woundId) tags.add(`wound:${person.woundId}`);
  if (kinStrainFor(ctx) >= STRAINED) tags.add('kin:strain');
  const place = placeOf(ctx.state, ctx.personId);
  if (place) tags.add(`place:${place}`);
  return tags;
}

const isKinStrainFrag = (f: Frag): boolean => (f.tags ?? []).includes('axis:kin_strain');

function vectorFor(ctx: ReactionPickCtx): PersonStateVector {
  const data = ctx.state.data;
  const row = data.peopleById[ctx.personId] ?? { id: ctx.personId };
  const person = ctx.state.people[ctx.personId];
  const flags = ctx.state.flags as { trust?: number; notoriety?: number };
  const trust = typeof person?.trust === 'number' ? person.trust : typeof flags.trust === 'number' ? flags.trust : 0.5;
  const hollow = person?.marks?.find((m) => m.markId === 'hollowness')?.stacks ?? 0;
  return buildStateVector(row, {
    data,
    trust,
    notoriety: typeof flags.notoriety === 'number' ? flags.notoriety : 0,
    kinStrain: kinStrainFor(ctx),
    hollowness: clamp01(hollow / 3),
    flame01: typeof person?.flame === 'number' ? person.flame / 100 : undefined,
  });
}

function curveInfluence(data: DataTables, v: PersonStateVector): Record<string, number> {
  const bag: Record<string, number> = {
    warmth: v.warmth,
    bite: v.bite,
    piety: v.piety,
    secrecy: v.secrecy,
    weariness: v.weariness,
  };
  noteUse('dialogue/reaction-curves', (data.reactionCurves.curves[0] as { id?: string } | undefined)?.id);
  const drives =
    (
      data.reactionCurves.curves[0] as {
        drives?: Array<{ statePath: string; from: number; to: number; influence?: Record<string, number> }>;
      }
    )?.drives ?? [];
  const pathValue: Record<string, number> = {
    'person.flame01': v.flame01,
    'player.trust': v.trust,
    'person.mark.hollowness': v.hollowness,
    'town.doctrine.legitimacy': 0.5,
    'player.notoriety': v.notoriety,
    'kin.strain': v.kinStrain,
  };
  for (const d of drives) {
    const t = clamp01(((pathValue[d.statePath] ?? 0) - d.from) / (d.to - d.from || 1));
    for (const [dim, w] of Object.entries(d.influence ?? {})) {
      bag[dim] = (bag[dim] ?? 0) + t * w;
    }
  }
  return bag;
}

function isAloneSlot(f: Frag): boolean {
  if (f.slot === 'alone') return true;
  const tags = f.tags ?? [];
  return tags.includes('slot:alone') || (!f.slot && !tags.some((t) => t.startsWith('slot:') && t !== 'slot:alone'));
}

function methodCandidates(data: DataTables, personId: string, methodId: string): Frag[] {
  const personTag = `person:${personId}`;
  const methodTag = `method:${methodId}`;
  return (data.lineFragments.fragments ?? []).filter((f) => {
    const tags = f.tags ?? [];
    return tags.includes(personTag) && tags.includes(methodTag) && isAloneSlot(f);
  });
}

function pickWeighted(frags: Frag[], scores: number[], seed: number, personId: string, methodId: string, salt = ''): Frag {
  const rng = createRng((seed ^ hashStr(`${personId}:${methodId}${salt}`)) >>> 0);
  let r = rng.next() * scores.reduce((a, b) => a + b, 0);
  for (let i = 0; i < frags.length; i++) {
    r -= scores[i]!;
    if (r <= 0) return frags[i]!;
  }
  return frags[frags.length - 1]!;
}

function fixedFromCandidates(cands: Frag[], ctx: ReactionPickCtx): ReactionLineResult {
  const noAxis = cands.filter(
    (f) => !(f.tags ?? []).some((t) => String(t).startsWith('axis:')),
  );
  const pool = noAxis.length ? noAxis : cands;
  const preferred =
    pool.find((f) => (f.tags ?? []).includes('migration_verbatim')) ??
    pool.find((f) => (f.tags ?? []).includes('authored_anchor')) ??
    pool.find((f) => (f.tags ?? []).includes('fallback_mirror')) ??
    pool[0];
  if (preferred?.text) return { lineId: preferred.id, text: preferred.text, source: 'fixed' };
  return pickFixedReactionLine(ctx);
}

/** Their own trust toward the player (the interaction runtime mirrors it), else the old global flag. */
function trustOf(ctx: ReactionPickCtx): number {
  const own = ctx.state.people[ctx.personId]?.trust;
  if (typeof own === 'number') return own;
  const t = (ctx.state.flags as { trust?: number }).trust;
  return typeof t === 'number' ? t : 0.5;
}

/** Fragments + curves + vector when bakedDynamismLines; else authored/fallback alone. */
export function pickFabricReactionLine(ctx: ReactionPickCtx): ReactionLineResult {
  const data = ctx.state.data;
  const cands = methodCandidates(data, ctx.personId, ctx.methodId);
  const constraints = (data.voiceConstraints.constraints ?? []) as Constraint[];
  // People without their own fragments (generated villagers) speak in a generic voice (C8, D7).
  if (!cands.length) {
    const memory = memoryTags(ctx);
    const generic = genericVoiceLine(ctx, { memory, strained: memory.has('kin:strain'), constraints });
    if (generic) return generic;
  }
  if (!ctx.features.bakedDynamismLines) return fixedFromCandidates(cands, ctx);

  const memory = memoryTags(ctx);
  const strained = memory.has('kin:strain');
  const place = placeOf(ctx.state, ctx.personId);
  // Kin-strain lines need kin strain (their requiresAny: kin:strain): unstrained people never say them.
  const allowed = strained ? cands : cands.filter((f) => !isKinStrainFrag(f));
  const pool = allowed.filter((f) => !violatesConstraints(f, memory, constraints));
  const use = pool.length ? pool : allowed;
  if (!use.length) return fixedFromCandidates([], ctx);

  const v = vectorFor(ctx);
  const trust = trustOf(ctx);
  const influence = curveInfluence(data, v);
  influence.warmth = (influence.warmth ?? 0) * (0.5 + 0.5 * clamp01(trust));
  // Extreme states: when axis-tagged alone frags exist, prefer that axis pool so
  // weighted sampling cannot land on an unrelated mark/doctrine line (Probe-visible).
  const highExtreme = trust > 0.75 && v.flame01 > 0.55 && v.hollowness < 0.15;
  const lowExtreme = trust < 0.25 || v.hollowness > 0.4;
  let pickPool = use;
  if (highExtreme) {
    const preferred = use.filter((f) => {
      const tags = f.tags ?? [];
      return (
        tags.includes('axis:spark_high') ||
        tags.includes('migration_verbatim') ||
        tags.includes('fallback_mirror') ||
        /_alone$/.test(f.id)
      );
    });
    if (preferred.length) pickPool = preferred;
  } else if (lowExtreme) {
    const preferred = use.filter((f) => {
      const tags = f.tags ?? [];
      return (
        tags.includes('axis:lonely') ||
        tags.includes('axis:trust_low') ||
        tags.includes('axis:spark_low') ||
        tags.includes('mood:wary') ||
        tags.includes('state:lonely') ||
        tags.includes('axis:mark_hollowness') ||
        tags.includes('axis:mark_dependence')
      );
    });
    if (preferred.length) pickPool = preferred;
  } else if (strained) {
    // Family split by the drift is what is on their mind.
    const preferred = use.filter(isKinStrainFrag);
    if (preferred.length) pickPool = preferred;
  }

  const scores = pickPool.map((f) =>
    scoreFragment(f, influence, memory, { trust, flame01: v.flame01, hollowness: v.hollowness }),
  );
  // Hard bias within the preferred pool.
  for (let i = 0; i < pickPool.length; i++) {
    const tags = pickPool[i]!.tags ?? [];
    const lonely = tags.includes('axis:lonely') || tags.includes('mood:wary') || tags.includes('state:lonely');
    const lowTrust = tags.includes('axis:trust_low');
    const highSpark = tags.includes('axis:spark_high');
    if ((lonely || lowTrust) && lowExtreme) scores[i] = scores[i]! + 4;
    if (highSpark && highExtreme) scores[i] = scores[i]! + 4;
    if (highSpark && trust < 0.25) scores[i] = Math.max(0.01, scores[i]! * 0.12);
    if ((lonely || lowTrust) && highExtreme) {
      scores[i] = Math.max(0.01, scores[i]! * 0.12);
    }
    if (isKinStrainFrag(pickPool[i]!)) scores[i] = scores[i]! + (influence['axis:kin_strain'] ?? 0) * 4;
    // D7: city, town and village people speak differently (place:<kind> tagged lines).
    scores[i] = placeBias(pickPool[i]!, place, scores[i]!);
  }
  // Each visit draws afresh (day + lines said so far), and what they said lately is damped.
  const damped = dampRecent(ctx.state, ctx.personId, pickPool, scores);
  const picked = pickWeighted(pickPool, damped, ctx.seed, ctx.personId, ctx.methodId, `:${ctx.state.day}:${linesSaid(ctx.state, ctx.personId)}`);
  return composedLine(ctx, picked) ?? { lineId: picked.id, text: picked.text, source: 'blend' };
}

/** How often a calm, axis-free answer is spoken at length instead (the person's opener, middle and closer). */
const COMPOSE_CHANCE = 0.3;

/**
 * An authored person in no particular state sometimes says more: their opener, middle and closer for the
 * method strung together ("Listen. The yeast is still alive... Warmth doesn't ask permission. Eat."). Lines
 * shaped by an axis (a mark, a doctrine, kin strain) stay as picked. Seeded per day and lines said.
 */
function composedLine(ctx: ReactionPickCtx, picked: Frag): ReactionLineResult | null {
  if ((picked.tags ?? []).some((t) => t.startsWith('axis:'))) return null;
  const personTag = `person:${ctx.personId}`;
  const methodTag = `method:${ctx.methodId}`;
  const part = (slot: string): Frag | undefined =>
    (ctx.state.data.lineFragments.fragments ?? []).find((f) => f.slot === slot && (f.tags ?? []).includes(personTag) && (f.tags ?? []).includes(methodTag));
  const parts = ['opener', 'middle', 'closer'].map(part);
  if (parts.some((p) => !p?.text)) return null;
  const rng = createRng((ctx.seed ^ hashStr(`${ctx.personId}:${ctx.methodId}:compose:${ctx.state.day}:${linesSaid(ctx.state, ctx.personId)}`)) >>> 0);
  if (rng.next() >= COMPOSE_CHANCE) return null;
  return { lineId: parts.map((p) => p!.id).join('+'), text: parts.map((p) => p!.text).join(' '), source: 'blend' };
}

/** Attach fabric picker on this state only (no module globals). */
export function installFabricReactionSelector(state: SimState): void {
  setReactionLineSelector(state, pickFabricReactionLine);
}
