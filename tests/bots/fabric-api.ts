/**
 * Fabric / worldgen public API adapter (Probe).
 * Feature-detects Forge exports from src/sim/fabric.ts (file facade) and src/sim.
 * Returns null until enough surface exists to run generator quality bots.
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

/** One generated world (or fabric snapshot) for multi-seed quality checks. */
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

const MODULE_CANDIDATES = [
  '../../src/sim/fabric.ts',
  '../../src/sim/index.ts',
] as const;

/** Export names Forge may ship — detect all of them. */
const NAMED_EXPORTS = [
  'createFabric',
  'generatePeople',
  'generatePersonDraft',
  'interpolateLine',
  'assertVoice',
  'runFabricAssertions',
  'generateWorld',
  'createWorldFabric',
  'worldFingerprint',
  'historySummary',
  'kinGraph',
  'gapAxisSpread',
  'assertionResults',
] as const;

function isFunction(v: unknown): v is (...args: never[]) => unknown {
  return typeof v === 'function';
}

function pickApi(mod: Record<string, unknown>): FabricApi | null {
  const api: FabricApi = {};
  let hit = 0;

  if (isFunction(mod.createFabric)) {
    api.createFabric = mod.createFabric as FabricApi['createFabric'];
    hit++;
  }
  if (isFunction(mod.createWorldFabric)) {
    api.createWorldFabric = mod.createWorldFabric as FabricApi['createWorldFabric'];
    hit++;
  }
  if (isFunction(mod.generateWorld)) {
    api.generateWorld = mod.generateWorld as FabricApi['generateWorld'];
    hit++;
  }
  if (isFunction(mod.generatePeople)) {
    api.generatePeople = mod.generatePeople as FabricApi['generatePeople'];
    hit++;
  }
  if (isFunction(mod.generatePersonDraft)) {
    api.generatePersonDraft =
      mod.generatePersonDraft as FabricApi['generatePersonDraft'];
    hit++;
  }
  if (isFunction(mod.interpolateLine)) {
    api.interpolateLine = mod.interpolateLine as FabricApi['interpolateLine'];
    hit++;
  }
  if (isFunction(mod.assertVoice)) {
    api.assertVoice = mod.assertVoice as FabricApi['assertVoice'];
    hit++;
  }
  if (isFunction(mod.runFabricAssertions)) {
    api.runFabricAssertions =
      mod.runFabricAssertions as FabricApi['runFabricAssertions'];
    hit++;
  }

  // Helper exports that may sit beside factories (recorded as presence via hit)
  for (const name of [
    'worldFingerprint',
    'historySummary',
    'kinGraph',
    'gapAxisSpread',
    'assertionResults',
  ] as const) {
    if (isFunction(mod[name]) || (mod[name] !== undefined && mod[name] !== null)) {
      hit++;
    }
  }

  // Usable when we can produce a world or a people sample.
  if (api.generateWorld || api.generatePeople || api.generatePersonDraft) {
    return api;
  }
  // Or a fabric factory we can call later once shape is known
  if (api.createFabric || api.createWorldFabric) {
    return api;
  }

  void hit;
  void NAMED_EXPORTS;
  return null;
}

/**
 * Feature-detect Forge fabric / worldgen API.
 * Returns null until M2 exports a matching surface → bots mark API_PENDING.
 */
export async function connectFabricApi(): Promise<FabricApi | null> {
  for (const path of MODULE_CANDIDATES) {
    try {
      const mod = (await import(/* @vite-ignore */ path)) as Record<
        string,
        unknown
      >;
      const api = pickApi(mod);
      if (api) return api;
    } catch {
      // Module missing or unloadable — try next candidate
    }
  }
  return null;
}

/** Names Probe expects Forge to eventually export (documentation + tests). */
export const FABRIC_EXPORT_CANDIDATES: readonly string[] = [...NAMED_EXPORTS];
