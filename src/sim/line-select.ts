/** Fabric reaction-line blend selector. Pure; wires via state-scoped setReactionLineSelector. */

import type { DataTables } from './load-data';
import {
  setReactionLineSelector,
  type ReactionLineResult,
  type ReactionPickCtx,
} from './method-reactions';
import { buildStateVector, type PersonStateVector } from './person-vector';
import { createRng } from './rng';
import type { SimState } from './types/runtime';
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

function memoryTags(ctx: ReactionPickCtx): Set<string> {
  const person = ctx.state.people[ctx.personId];
  const tags = new Set<string>(person?.tags ?? []);
  for (const m of person?.marks ?? []) tags.add(`mark:${m.markId}`);
  if (person?.woundId) tags.add(`wound:${person.woundId}`);
  return tags;
}

function vectorFor(ctx: ReactionPickCtx): PersonStateVector {
  const data = ctx.state.data;
  const row = data.peopleById[ctx.personId] ?? { id: ctx.personId };
  const person = ctx.state.people[ctx.personId];
  const flags = ctx.state.flags as { trust?: number; notoriety?: number; kinStrain?: number };
  const hollow = person?.marks?.find((m) => m.markId === 'hollowness')?.stacks ?? 0;
  return buildStateVector(row, {
    data,
    trust: typeof flags.trust === 'number' ? flags.trust : 0.5,
    notoriety: typeof flags.notoriety === 'number' ? flags.notoriety : 0,
    kinStrain: typeof flags.kinStrain === 'number' ? flags.kinStrain : 0,
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

function pickWeighted(frags: Frag[], scores: number[], seed: number, personId: string, methodId: string): Frag {
  const rng = createRng((seed ^ hashStr(`${personId}:${methodId}`)) >>> 0);
  let r = rng.next() * scores.reduce((a, b) => a + b, 0);
  for (let i = 0; i < frags.length; i++) {
    r -= scores[i]!;
    if (r <= 0) return frags[i]!;
  }
  return frags[frags.length - 1]!;
}

function fixedFromCandidates(cands: Frag[], ctx: ReactionPickCtx): ReactionLineResult {
  const preferred =
    cands.find((f) => (f.tags ?? []).includes('authored_anchor')) ??
    cands.find((f) => (f.tags ?? []).includes('fallback_mirror')) ??
    cands[0];
  if (preferred?.text) return { lineId: preferred.id, text: preferred.text, source: 'fixed' };
  const people = (ctx.state.data.lines as { people?: Record<string, { methods?: Record<string, string> }> }).people;
  const text = people?.[ctx.personId]?.methods?.[ctx.methodId] ?? '';
  return { lineId: `${ctx.personId}.${ctx.methodId}`, text, source: text ? 'fixed' : 'fallback' };
}

function trustOf(ctx: ReactionPickCtx): number {
  const t = (ctx.state.flags as { trust?: number }).trust;
  return typeof t === 'number' ? t : 0.5;
}

/** Fragments + curves + vector when bakedDynamismLines; else authored/fallback alone. */
export function pickFabricReactionLine(ctx: ReactionPickCtx): ReactionLineResult {
  const data = ctx.state.data;
  const cands = methodCandidates(data, ctx.personId, ctx.methodId);
  if (!ctx.features.bakedDynamismLines) return fixedFromCandidates(cands, ctx);

  const memory = memoryTags(ctx);
  const constraints = (data.voiceConstraints.constraints ?? []) as Constraint[];
  const pool = cands.filter((f) => !violatesConstraints(f, memory, constraints));
  const use = pool.length ? pool : cands;
  if (!use.length) return fixedFromCandidates([], ctx);

  const v = vectorFor(ctx);
  const trust = trustOf(ctx);
  const influence = curveInfluence(data, v);
  influence.warmth = (influence.warmth ?? 0) * (0.5 + 0.5 * clamp01(trust));
  const scores = use.map((f) =>
    scoreFragment(f, influence, memory, { trust, flame01: v.flame01, hollowness: v.hollowness }),
  );
  // Hard bias: lonely/trust_low vs spark_high when state is extreme (Probe-visible).
  for (let i = 0; i < use.length; i++) {
    const tags = use[i]!.tags ?? [];
    const lonely = tags.includes('axis:lonely') || tags.includes('mood:wary') || tags.includes('state:lonely');
    const lowTrust = tags.includes('axis:trust_low');
    const highSpark = tags.includes('axis:spark_high');
    if ((lonely || lowTrust) && (trust < 0.25 || v.hollowness > 0.4)) scores[i] = scores[i]! + 4;
    if (highSpark && trust > 0.75 && v.flame01 > 0.55 && v.hollowness < 0.15) scores[i] = scores[i]! + 4;
    if (highSpark && trust < 0.25) scores[i] = Math.max(0.01, scores[i]! * 0.12);
    if ((lonely || lowTrust) && trust > 0.75 && v.flame01 > 0.55) {
      scores[i] = Math.max(0.01, scores[i]! * 0.12);
    }
  }
  const picked = pickWeighted(use, scores, ctx.seed, ctx.personId, ctx.methodId);
  return { lineId: picked.id, text: picked.text, source: 'blend' };
}

/** Attach fabric picker on this state only (no module globals). */
export function installFabricReactionSelector(state: SimState): void {
  setReactionLineSelector(state, pickFabricReactionLine);
}
