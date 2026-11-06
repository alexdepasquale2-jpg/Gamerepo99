/** Runtime sim shapes assembled from data + tick state. */

export const RUNTIME_TYPES_MODULE = 'runtime' as const;

export type EmbodimentState = {
  bodySlots: number;
  activeBodiesMax: number;
  blockedTileTags: string[];
  footprint?: unknown;
  moveTicksPerTile?: number;
  mode?: string;
};

export type Inhabitant = {
  id: string;
  archetypeId: string;
  spark: number;
  hookIds: string[];
  statusTraits: string[];
  embodiment: EmbodimentState;
  perception?: Record<string, unknown>;
  methodMods?: Record<string, unknown>;
  sparkMax?: number;
  townId?: string;
  x?: number;
  y?: number;
};

export type PersonState = {
  id: string;
  flame: number;
  flameStart?: number;
  marks?: { markId: string; stacks: number }[];
  townId?: string;
  siteId?: string;
  woundId?: string;
  tags?: string[];
  age?: number;
  x?: number;
  y?: number;
};

export type PacketState = {
  id: string;
  days: number;
  kind?: string;
  fromTownId?: string;
  toTownId?: string;
};

export type SimState = {
  day: number;
  seed: number;
  player: Inhabitant;
  people: Record<string, PersonState>;
  flags: Record<string, unknown>;
  packets: PacketState[];
  deliveredProofs?: unknown[];
  ended?: string;
  bus?: { lastIds?: string[]; emit?: (event: string, payload: unknown) => void };
  /** Attached by boot / play session for pure resolve. */
  data?: unknown;
  rng?: unknown;
};
