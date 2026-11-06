/** Interaction model shapes: catalog defs, scoring tables, runtime + result. */

import type { InteractionPerson, PromiseStatus } from './interaction-state';

export interface MarkAdd { markId: string; stacks?: number }

export interface InteractionTouch {
  flame01?: number;
  trust?: number;
  marksAdd?: MarkAdd[];
  marksRemove?: string[];
  woundPressure?: { woundId: string; delta: number }[];
}

export interface InteractionDef {
  id: string;
  kind: string;
  baseStrain: number;
  sparkGain: number;
  touch?: InteractionTouch;
  bondDelta?: number;
  /** Legacy flat form (mark → signed delta). Catalog uses touch.marksAdd/marksRemove. */
  marksAdd?: Record<string, number>;
  ripple?: string;
  tags?: string[];
  requires?: { promisePending?: boolean };
  promise?: { op: 'make' | 'keep' | 'break'; idFrom?: string };
  presenceDelta?: number;
  presenceThresholdBonus?: {
    minPresence: number;
    requireNoHarm?: boolean;
    touch: { flame01?: number; trust?: number };
  };
  touchModifiers?: {
    requireMarksAny?: string[];
    touch?: { flame01?: number; trust?: number };
    touchScoreFlat?: number;
  }[];
  touchScoreFlat?: number;
  meaning?: boolean;
  giftAccepted?: boolean;
  stoodUp?: boolean;
  scoreBrokenPromiseOnly?: boolean;
}

export interface InteractionScoring {
  spark: { sparkMax: number; situationMulDefault: number };
  touchScoreWeights: Record<string, number>;
  reignite: {
    touchScoreMin: number;
    flame01Min: number;
    requireHollownessStacks: number;
    minDistinctKinds?: number;
    alternate?: { requireMark: string; touchScoreMin: number; flame01Min: number };
  };
  onReignite?: {
    removeMarks?: string[];
    addMarks?: Record<string, number>;
    marksRemove?: string[];
    marksAdd?: MarkAdd[];
  };
}

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
  /** True when a reignite is held back by hollowness stacks above the allowed count. */
  reigniteBlocked: boolean;
  presence: number;
  marks: Record<string, number>;
  /** Status of the promise this interaction touched (make/keep/break), if any. */
  promise?: PromiseStatus;
  usedMethodSparkCost: false;
}
