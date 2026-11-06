/**
 * Fabric / worldgen type contracts (Probe).
 * Kept separate from connectFabricApi so fabric-api.ts stays under the soft cap.
 */

/** Generated person sample used by diversity / anti-template metrics. */
export type FabricPerson = {
  id: string;
  fingerprint: string;
  /** Optional continuous voice/trait vector for distance metrics. */
  vector?: Record<string, number>;
  lines?: FabricLine[];
};

export type FabricLine = {
  id: string;
  text: string;
  source?: 'fixed' | 'blend' | 'fallback';
};

/** Kin edge for connectedness. */
export type KinEdge = { from: string; to: string; kind?: string };

/** Settlement / site placement along city↔village gap (0 = village, 1 = city). */
export type GapSite = {
  id: string;
  /** Position on city↔village axis in [0, 1]. */
  gap01: number;
};

export type HistoryEvent = {
  id: string;
  at?: number;
  tags?: string[];
  personIds?: string[];
};

export type AssertionResult = {
  ok: boolean;
  violationId?: string;
  message?: string;
};

/**
 * One generated world (or fabric snapshot) for multi-seed quality checks.
 * Aligned with Forge `src/sim/gen/world.ts` FabricWorld (PersonDraft ≅ FabricPerson).
 */
export type FabricWorld = {
  seed: number;
  fingerprint: string;
  people: FabricPerson[];
  lines?: FabricLine[];
  history?: HistoryEvent[];
  /** Optional precomputed coherence in [0, 1]; metrics may also derive from history. */
  historyCoherence?: number;
  kinEdges?: KinEdge[];
  gapSites?: GapSite[];
  assertions?: AssertionResult[];
};

export type GenerateWorldOpts = {
  seed: number;
  peopleCount?: number;
};

export type FabricApi = {
  /** Preferred: generate a full world sample for one seed. */
  generateWorld?(opts: GenerateWorldOpts): FabricWorld | Promise<FabricWorld>;
  createFabric?(opts?: unknown): unknown;
  createWorldFabric?(opts?: unknown): unknown;
  generatePeople?(opts: {
    seed: number;
    count?: number;
  }): FabricPerson[] | Promise<FabricPerson[]>;
  generatePersonDraft?(opts: {
    seed: number;
    index?: number;
  }): FabricPerson | Promise<FabricPerson>;
  interpolateLine?(opts: unknown): FabricLine | Promise<FabricLine>;
  assertVoice?(opts: unknown): AssertionResult | Promise<AssertionResult>;
  runFabricAssertions?(
    opts: unknown,
  ): AssertionResult[] | Promise<AssertionResult[]>;
};
