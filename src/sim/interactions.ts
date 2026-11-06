import { clamp, type InteractionPerson } from './interaction-state';

export interface InteractionDef {
  id: string;
  kind: string;
  baseStrain: number;
  sparkGain: number;
  touch?: { flame01?: number; trust?: number };
  bondDelta?: number;
  marksAdd?: Record<string, number>;
  ripple?: string;
  tags?: string[];
}

export interface InteractionScoring {
  spark: { sparkMax: number; situationMulDefault: number };
  touchScoreWeights: Record<string, number>;
  reignite: { touchScoreMin: number; flame01Min: number; requireHollownessStacks: number };
  onReignite?: { removeMarks?: string[]; addMarks?: Record<string, number> };
}

export const REIGNITE_MIN_KINDS = 3;

export interface InteractionRuntimeInit {
  catalog: { interactions: InteractionDef[] };
  scoring: InteractionScoring;
  person: InteractionPerson;
}

export interface InteractionRuntime {
  catalog: Map<string, InteractionDef>;
  scoring: InteractionScoring;
  people: Map<string, InteractionPerson>;
}

export interface InteractionResult {
  flame01: number;
  trust: number;
  bond: number;
  spark: number;
  touchScore: number;
  reignited: boolean;
  usedMethodSparkCost: false;
}

export function createInteractionRuntime(init: InteractionRuntimeInit): InteractionRuntime {
  return {
    catalog: new Map(init.catalog.interactions.map((i) => [i.id, i])),
    scoring: init.scoring,
    people: new Map([[init.person.id, { ...init.person, marks: { ...init.person.marks } }]]),
  };
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

  const dFlame = def.touch?.flame01 ?? 0;
  const dBond = def.bondDelta ?? 0;
  p.flame01 = clamp(p.flame01 + dFlame, 0, 1);
  p.trust = clamp(p.trust + (def.touch?.trust ?? 0), 0, 1);
  p.bond += dBond;
  p.spark = clamp(p.spark - def.baseStrain * sp.situationMulDefault + def.sparkGain, 0, sp.sparkMax);

  let ts = dFlame * (w.flame01Abs ?? 0) + dBond * (w.bond ?? 0);
  if (def.tags?.includes('meaning')) ts += w.meaning ?? 0;
  if (def.tags?.includes('kept_promise')) ts += w.keptPromise ?? 0;
  p.touchScore += ts;

  for (const [k, v] of Object.entries(def.marksAdd ?? {})) {
    p.marks[k] = Math.max(0, (p.marks[k] ?? 0) + v);
  }
  const kinds = new Set(p.kindsTouched ?? []);
  kinds.add(def.kind);
  p.kindsTouched = [...kinds];

  const rg = rt.scoring.reignite;
  const reignited =
    p.touchScore >= rg.touchScoreMin &&
    p.flame01 >= rg.flame01Min &&
    (p.marks.hollowness ?? 0) <= rg.requireHollownessStacks &&
    kinds.size >= REIGNITE_MIN_KINDS;
  if (reignited) {
    const on = rt.scoring.onReignite;
    for (const m of on?.removeMarks ?? []) delete p.marks[m];
    for (const [m, v] of Object.entries(on?.addMarks ?? {})) p.marks[m] = (p.marks[m] ?? 0) + v;
  }

  return {
    flame01: p.flame01,
    trust: p.trust,
    bond: p.bond,
    spark: p.spark,
    touchScore: p.touchScore,
    reignited,
    usedMethodSparkCost: false,
  };
}
