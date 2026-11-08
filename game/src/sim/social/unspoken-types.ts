/** Blessings and Burdens types (spec 2026-11-06-social-graph/06 §3). Pure data shapes. */

export type UnspokenLeaning = 'blessing' | 'burden' | 'mixed';
export type OutcomeKind = 'blessing' | 'burden';

/** Authored class (people/unspoken/classes.json). */
export type UnspokenClass = {
  id: string;
  kind: string;
  leaning: UnspokenLeaning;
  encodeFrom: { interactionIds?: string[]; tagsAny?: string[]; requireReignite?: boolean };
  baseWeight: number;
  halfLifeDays: number;
  comeToPass: {
    requireTagsAny?: string[];
    minWeight: number;
    baseP: number;
    blessingOutcomeIds: string[];
    burdenOutcomeIds: string[];
    mixedBias?: number;
  };
  deposit: { onSourcePerson: number; onPathEdges: number; onPlaceTown?: number };
};

/** Runtime instance — saveable. */
export type UnspokenInstance = {
  id: string;
  classId: string;
  sourcePersonId: string;
  placeTownId: string;
  encodedDay: number;
  weight: number;
  edgeIds: string[];
  personIds: string[];
  consumed: boolean;
  tuningSalt: number;
};

export type ComeToPassOutcome = {
  id: string;
  kind: OutcomeKind;
  carrierPrefer: string;
  fragmentIds: string[];
  effects: {
    flame01?: number;
    trust?: number;
    despair?: number;
    marksAdd?: { markId: string; stacks?: number }[];
    edgeWeightDelta?: number;
    letterOrRumor?: 'letter' | 'rumor';
  };
};

/** Bounded adaptation — persisted per seed. */
export type BlessingsBurdensTuning = {
  classId: string;
  pBias: number;
  blessingBias: number;
  samples: number;
};

/** people/unspoken/tuning.json (caps + runtime constants). */
export type UnspokenTuningTable = {
  caps: { pBiasMax: number; blessingBiasMax: number; pBiasPerSample: number; blessingBiasPerWitness: number };
  runtime: {
    epsilon: number;
    maxActivePerSource: number;
    falloffDefault: number;
    maxDepositHops: number;
    comeToPassPClamp: [number, number];
    blessingPClamp: [number, number];
    cascadeBoostMul: number;
  };
  comeToPassAlsoOnInteractionIds: string[];
};

export type UnspokenFragment = { id: string; text: string };

/** Loaded tables (load-data `unspoken`). */
export type UnspokenTables = {
  classes: UnspokenClass[];
  outcomes: ComeToPassOutcome[];
  tuning: UnspokenTuningTable;
  fragments: UnspokenFragment[];
};

/** Mutable per-save runtime state. */
export type UnspokenState = {
  seq: number;
  instances: UnspokenInstance[];
  tuning: Record<string, BlessingsBurdensTuning>;
};

/** One come-to-pass resolution, surfaced indirectly by a carrier. */
export type ComeToPassResult = {
  instanceId: string;
  classId: string;
  outcome: ComeToPassOutcome;
  carrierId: string;
  sourcePersonId: string;
  fragmentId?: string;
  line?: string;
};
