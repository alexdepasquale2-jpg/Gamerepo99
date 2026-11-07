/** Data-table shapes loaded from src/data/*.json (string ids OK for M2). */

export const DATA_TYPES_MODULE = 'data' as const;

export type EffectOp = 'add' | 'mul' | 'set' | 'grant_mark' | 'remove_mark' | 'emit_packet';

export type Effect = {
  id: string;
  target: string;
  op: EffectOp;
  value?: number;
  durationDays?: number | null;
  tags?: string[];
  markId?: string;
  packetId?: string;
};

export type HookWhen = Record<string, unknown>;

export type HookDef = {
  id: string;
  kind: string;
  trigger: string;
  /** Runs for every player regardless of archetype hookIds. */
  universal?: boolean;
  when?: HookWhen;
  effects?: Effect[];
  methodId?: string;
  stillShowsInMenu?: boolean;
  consumesAct?: boolean;
  lines?: Record<string, string[]>;
};

export type ArchetypeDef = {
  id: string;
  name: string;
  title?: string;
  speciesTags?: string[];
  blurb?: string;
  m2Playable?: boolean;
  generatorWeight?: number;
  embodimentTraitId: string;
  perceptionTraitId: string;
  methodModifierId: string;
  sparkProfileId: string;
  personalCostHookIds: string[];
  refusalHookIds: string[];
  legacyHookIds: string[];
  startingTownId: string;
  defaultProofId?: string;
  burnoutVignette?: string;
};
