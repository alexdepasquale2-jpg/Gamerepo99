/** Runtime sim shapes assembled from data + tick state. */

import type {
  EconomyLodHooks,
  EconomyRouteState,
  TownEconomyState,
} from '../economy/economy-lod-types';

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
  /** 0..1 trust toward the player (mirrored from the interaction runtime). */
  trust?: number;
  townId?: string;
  siteId?: string;
  siteKind?: string;
  woundId?: string;
  tags?: string[];
  age?: number;
  x?: number;
  y?: number;
  anchor?: boolean;
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
  /** Per-state reaction-line picker (see method-reactions). Never module-global. */
  reactionLineSelector?: unknown;
  /** Fabric kinship graph for cross-town ripples. */
  kinEdges?: { from: string; to: string; kind?: string }[];
  /** M4 dawn economy LOD: per-town stock/despair (seeded lazily from towns.json). */
  towns?: Record<string, TownEconomyState>;
  /** M4 dawn economy LOD: mutable route condition/broken (from world/routes.json). */
  economyRoutes?: EconomyRouteState[];
  /** M4 B/C hook registry (caravan dawn, doctrine supply). Defaults to no-ops. */
  economyHooks?: EconomyLodHooks;
};
