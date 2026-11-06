/** Method commit: refusal hooks first, else wound matrix resolve. Pure sim. */

import { applyEffect, type EffectCtx } from './effects';
import type { DataTables } from './load-data';
import type { Rng } from './rng';
import type { Effect } from './types/data';
import type { PersonState, SimState } from './types/runtime';
import {
  findRefusal,
  pickRefusalLine,
  selectReactionLine,
  type MethodSimState,
} from './method-reactions';
import { maybeEmitCrossTownPacket, pushJuice } from './packets';

export type { MethodSimState } from './method-reactions';
export {
  pickFixedReactionLine,
  setReactionLineSelector,
  selectReactionLine,
  type ReactionPickCtx,
  type ReactionLineResult,
  type ReactionLineSelector,
} from './method-reactions';

export type CommitResult =
  | { kind: 'refused'; line: string; tells: Tell[] }
  | { kind: 'resolved'; flameDelta: number; marks: { markId: string; stacks: number }[] };

type Tell = { id: string; view?: string; durationTicks?: number };
type MarkWeight = { markId: string; weight: number; minMatrix?: number };
type MethodRow = {
  id: string;
  family?: string;
  style?: string;
  sparkCost: number;
  basePower: number;
  tags?: string[];
  effectiveness?: Record<string, number>;
  markWeights?: MarkWeight[];
};

function requireMethodState(state: SimState): MethodSimState {
  const s = state as MethodSimState;
  if (!s.data || !s.rng) throw new Error('commitMethod requires state.data and state.rng');
  return s;
}

function methodMod(player: SimState['player'], methodId: string) {
  const row = (
    player.methodMods as
      | { byMethod?: Record<string, { powerMul?: number; sparkCostMul?: number; tags?: string[] }> }
      | undefined
  )?.byMethod?.[methodId];
  return {
    powerMul: row?.powerMul ?? 1,
    sparkCostMul: row?.sparkCostMul ?? 1,
    tags: row?.tags ?? [],
  };
}

function emberMul(state: MethodSimState, method: MethodRow): number {
  if (method.family !== 'kind') return 1;
  const arch = state.data.archetypes.find((a) => a.id === state.player.archetypeId);
  const profile = (state.data.traits.sparkProfiles as Array<Record<string, unknown>>).find(
    (p) => arch && p.id === arch.sparkProfileId,
  );
  const below = Number(profile?.emberZoneBelow ?? 20);
  const kindMul = Number(profile?.emberKindCostMul ?? 1.25);
  return state.player.spark < below ? kindMul : 1;
}

function markMul(person: PersonState, data: DataTables): number {
  let mul = 1;
  for (const m of person.marks ?? []) {
    const def = (data.marks as Array<Record<string, unknown>>).find((d) => d.id === m.markId);
    if (!def) continue;
    let fromFx = false;
    for (const fx of (def.effects as Effect[] | undefined) ?? []) {
      if (fx.target === 'method.effectiveness' && fx.op === 'mul' && typeof fx.value === 'number') {
        mul *= fx.value;
        fromFx = true;
      }
    }
    if (!fromFx && typeof def.sameMethodFamilyMul === 'number') mul *= def.sameMethodFamilyMul as number;
  }
  return mul;
}

function buildCtx(state: MethodSimState, person: PersonState, method: MethodRow, tags: string[]): EffectCtx {
  return {
    data: state.data,
    rng: state.rng,
    methodId: method.id,
    methodTags: tags,
    targetId: person.id,
    targetTags: person.tags ?? [],
    targetAge: person.age,
    playerTraitTags: [...state.player.statusTraits, ...methodMod(state.player, method.id).tags],
  };
}

function hasWitness(state: MethodSimState, target: PersonState): boolean {
  if (typeof target.x !== 'number' || typeof target.y !== 'number') return false;
  const burnAt = state.data.reigniteThreshold;
  for (const p of Object.values(state.people)) {
    if (p.id === target.id || p.flame < burnAt) continue;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
    if (Math.abs(p.x - target.x) + Math.abs(p.y - target.y) <= 3) return true;
  }
  return false;
}

function weightedMarks(weights: MarkWeight[], method: MethodRow, witnessed: boolean): MarkWeight[] {
  if (!witnessed) return weights.map((w) => ({ ...w }));
  const savage = method.family === 'savage' || (method.style ?? '').includes('savage');
  return weights.map((w) => {
    const next = { ...w };
    if (savage && w.markId === 'hollowness') next.weight = Math.round(w.weight * 1.25);
    if (!savage && w.markId === 'genuine_growth') next.weight = Math.round(w.weight * 1.25);
    return next;
  });
}

function rollMark(weights: MarkWeight[], woundMul: number, rng: Rng): string | undefined {
  const eligible = weights.filter((w) => w.minMatrix == null || woundMul >= w.minMatrix);
  const total = eligible.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return undefined;
  let roll = rng.next() * total;
  for (const w of eligible) {
    roll -= w.weight;
    if (roll <= 0) return w.markId;
  }
  return eligible.at(-1)?.markId;
}

function grantMark(person: PersonState, markId: string) {
  const marks = (person.marks ??= []);
  const hit = marks.find((m) => m.markId === markId);
  if (hit) hit.stacks += 1;
  else marks.push({ markId, stacks: 1 });
  return marks.map((m) => ({ ...m }));
}

/** Commit a method against a person: refusal beat or matrix resolve. */
export function commitMethod(state: SimState, personId: string, methodId: string): CommitResult {
  const s = requireMethodState(state);
  const person = s.people[personId];
  if (!person) throw new Error(`UNKNOWN person: ${personId}`);
  const method = (s.data.methods as MethodRow[]).find((m) => m.id === methodId);
  if (!method) throw new Error(`UNKNOWN method: ${methodId}`);
  const mod = methodMod(s.player, methodId);
  const tags = [...(method.tags ?? []), ...mod.tags];
  const ctx = buildCtx(s, person, method, tags);

  const refusal = findRefusal(s, method, ctx);
  if (refusal) {
    for (const effect of refusal.effects ?? []) applyEffect(s, effect, ctx);
    const line = pickRefusalLine(refusal, s.player.archetypeId, s.rng);
    pushJuice(s, 'refusal.coal_flicker', { personId, methodId, line });
    pushJuice(s, 'spark.spend', { amount: 1, reason: 'refusal' });
    return { kind: 'refused', line, tells: refusal.tells ?? [] };
  }

  const woundMul = method.effectiveness?.[person.woundId ?? ''] ?? 1;
  const flameDelta = Math.floor(
    method.basePower *
      woundMul *
      markMul(person, s.data) *
      mod.powerMul *
      (1 + (s.rng.next() * 2 - 1) * s.data.rngFuzz),
  );
  const cost = Math.floor(method.sparkCost * mod.sparkCostMul * emberMul(s, method));
  s.player.spark -= cost;
  pushJuice(s, 'spark.spend', { amount: cost, methodId });

  const markId = rollMark(weightedMarks(method.markWeights ?? [], method, hasWitness(s, person)), woundMul, s.rng);
  let marks = person.marks?.map((m) => ({ ...m })) ?? [];
  if (markId) {
    marks = grantMark(person, markId);
    pushJuice(s, 'mark.applied', { personId, markId });
    maybeEmitCrossTownPacket(s, personId, markId);
  }

  person.flame += flameDelta;
  const reaction = selectReactionLine({
    personId,
    methodId,
    seed: s.seed,
    state: s,
    features: { bakedDynamismLines: false },
  });
  pushJuice(s, 'person.reaction', { personId, methodId, line: reaction.text, source: reaction.source });
  if (person.flame >= s.data.reigniteThreshold) {
    pushJuice(s, 'site.kindle', { personId, siteId: person.siteId });
  }
  return { kind: 'resolved', flameDelta, marks };
}
