/** Interaction runtime: build from catalog/scoring tables and resolve one interaction. */

import { clamp, type InteractionPerson, type PromiseStatus } from './interaction-state';
import type {
  InteractionDef,
  InteractionResult,
  InteractionRuntime,
  InteractionRuntimeInit,
  InteractionScoring,
  MarkAdd,
} from './interaction-types';

export type {
  InteractionDef,
  InteractionResult,
  InteractionRuntime,
  InteractionRuntimeInit,
  InteractionScoring,
  InteractionTouch,
  MarkAdd,
} from './interaction-types';

export const REIGNITE_MIN_KINDS = 3;

export function createInteractionRuntime(init: InteractionRuntimeInit): InteractionRuntime {
  return {
    catalog: new Map(init.catalog.interactions.map((i) => [i.id, i])),
    scoring: init.scoring,
    people: new Map([[init.person.id, { ...init.person, marks: { ...init.person.marks } }]]),
  };
}

const EPS = 1e-9;

function markScoreWeight(w: Record<string, number>, markId: string): number {
  if (markId === 'genuine_growth') return w.genuine_growth ?? 0;
  if (markId === 'hollowness') return w.hollownessAdd ?? 0;
  if (markId === 'resentment') return w.resentmentAdd ?? 0;
  return 0;
}

export function resolveInteraction(
  rt: InteractionRuntime,
  interactionId: string,
  personId: string,
  _args?: Record<string, unknown>,
): InteractionResult {
  const def = rt.catalog.get(interactionId);
  if (!def) throw new Error(`unknown interaction: ${interactionId}`);
  const p = rt.people.get(personId);
  if (!p) throw new Error(`unknown person: ${personId}`);
  const { spark: sp, touchScoreWeights: w } = rt.scoring;

  const promises = (p.promises ??= []);
  const pending = [...promises].reverse().find((x) => x.status === 'pending');
  if (def.requires?.promisePending && !pending) {
    throw new Error(`${interactionId} requires a pending promise for ${personId}`);
  }

  // Modifiers are judged against marks as they stand before this interaction.
  let dFlame = def.touch?.flame01 ?? 0;
  let dTrust = def.touch?.trust ?? 0;
  let flat = def.touchScoreFlat ?? 0;
  for (const m of def.touchModifiers ?? []) {
    if (m.requireMarksAny && !m.requireMarksAny.some((k) => (p.marks[k] ?? 0) > 0)) continue;
    dFlame += m.touch?.flame01 ?? 0;
    dTrust += m.touch?.trust ?? 0;
    flat += m.touchScoreFlat ?? 0;
  }

  // Presence (show_up) + one-time threshold bonus.
  const dPresence = def.presenceDelta ?? 0;
  const presenceBefore = p.presence;
  p.presence += dPresence;
  if (def.ripple === 'harm' && presenceBefore > 0) p.harmSinceShowUp = true;
  const bonus = def.presenceThresholdBonus;
  if (
    bonus && dPresence > 0 &&
    presenceBefore < bonus.minPresence && p.presence >= bonus.minPresence &&
    !(bonus.requireNoHarm && p.harmSinceShowUp)
  ) {
    dFlame += bonus.touch.flame01 ?? 0;
    dTrust += bonus.touch.trust ?? 0;
  }

  const dBond = def.bondDelta ?? 0;
  p.flame01 = clamp(p.flame01 + dFlame, 0, 1);
  p.trust = clamp(p.trust + dTrust, 0, 1);
  p.bond += dBond;
  let strainMul = sp.situationMulDefault;
  let gainAdj = 0;
  for (const t of def.tags ?? []) {
    strainMul *= sp.strainMulByTag?.[t] ?? 1;
    gainAdj += sp.sparkGainAdjustByTag?.[t] ?? 0;
  }
  p.spark = clamp(p.spark - def.baseStrain * strainMul + def.sparkGain + gainAdj, 0, sp.sparkMax);

  let ts = Math.abs(dFlame) * (w.flame01Abs ?? 0) + dBond * (w.bond ?? 0) + dPresence * (w.presenceDay ?? 0) + flat;
  if (def.meaning || def.tags?.includes('meaning')) ts += w.meaning ?? 0;
  if (def.tags?.includes('kept_promise')) ts += w.keptPromise ?? 0;
  if (def.giftAccepted) ts += w.giftAccepted ?? 0;
  if (def.stoodUp) ts += w.stoodUp ?? 0;

  // Marks: adds score by weight (positive stacks only); removes clear the mark entirely.
  const adds: MarkAdd[] = [
    ...(def.touch?.marksAdd ?? []),
    ...Object.entries(def.marksAdd ?? {}).map(([markId, stacks]) => ({ markId, stacks })),
  ];
  for (const { markId, stacks = 1 } of adds) {
    if (stacks > 0 && !(def.scoreBrokenPromiseOnly && markId !== 'genuine_growth')) {
      ts += stacks * markScoreWeight(w, markId);
    }
    p.marks[markId] = Math.max(0, (p.marks[markId] ?? 0) + stacks);
  }
  for (const m of def.touch?.marksRemove ?? []) delete p.marks[m];

  // Promises.
  let promise: PromiseStatus | undefined;
  const op = def.promise?.op;
  if (op === 'make') {
    promises.push({ id: `promise_${p.id}_${promises.length + 1}`, status: 'pending' });
    promise = 'pending';
  } else if (op === 'keep' && pending) {
    pending.status = 'kept';
    promise = 'kept';
    ts += w.keptPromise ?? 0;
  } else if (op === 'break' && pending) {
    pending.status = 'broken';
    promise = 'broken';
    ts += w.brokenPromise ?? 0;
  }
  p.touchScore += ts;

  const kinds = new Set(p.kindsTouched ?? []);
  kinds.add(def.kind);
  p.kindsTouched = [...kinds];

  const rg = rt.scoring.reignite;
  const hollow = p.marks.hollowness ?? 0;
  const enoughKinds = kinds.size >= (rg.minDistinctKinds ?? REIGNITE_MIN_KINDS);
  const main = p.touchScore >= rg.touchScoreMin - EPS && p.flame01 >= rg.flame01Min - EPS && hollow <= rg.requireHollownessStacks;
  const alt = rg.alternate;
  const viaAlt =
    !!alt && (p.marks[alt.requireMark] ?? 0) > 0 &&
    p.touchScore >= alt.touchScoreMin - EPS && p.flame01 >= alt.flame01Min - EPS;
  const reignited = enoughKinds && (main || viaAlt);
  if (reignited) {
    const on = rt.scoring.onReignite;
    for (const m of [...(on?.removeMarks ?? []), ...(on?.marksRemove ?? [])]) delete p.marks[m];
    for (const [m, v] of Object.entries(on?.addMarks ?? {})) p.marks[m] = (p.marks[m] ?? 0) + v;
    for (const { markId, stacks = 1 } of on?.marksAdd ?? []) p.marks[markId] = (p.marks[markId] ?? 0) + stacks;
  }

  return {
    flame01: p.flame01,
    trust: p.trust,
    bond: p.bond,
    spark: p.spark,
    touchScore: p.touchScore,
    reignited,
    reigniteBlocked: !reignited && hollow > rg.requireHollownessStacks,
    presence: p.presence,
    marks: { ...p.marks },
    promise,
    usedMethodSparkCost: false,
  };
}
