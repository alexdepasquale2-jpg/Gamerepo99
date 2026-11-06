/**
 * Fabric / worldgen public API adapter (Probe).
 * Feature-detects Forge exports from src/sim/fabric.ts (file facade) and src/sim.
 * Returns null until enough surface exists to run generator quality bots.
 */

export type {
  FabricPerson,
  FabricLine,
  KinEdge,
  GapSite,
  HistoryEvent,
  AssertionResult,
  FabricWorld,
  GenerateWorldOpts,
  FabricApi,
} from './fabric-api-types';

import type { FabricApi, FabricPerson, FabricWorld } from './fabric-api-types';

/** Prefer Forge facade first; index fallback last. No dead fabric/ folder. */
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

/**
 * Normalize a Forge world/person shape into Probe's FabricWorld.
 * PersonDraft already matches FabricPerson; this is a thin pass-through
 * that fills missing optional arrays so metrics never see undefined as FAIL.
 */
export function normalizeWorld(raw: unknown, seedFallback = 0): FabricWorld {
  const w = (raw ?? {}) as Partial<FabricWorld> & { people?: unknown[] };
  const people: FabricPerson[] = Array.isArray(w.people)
    ? w.people.map((p, i) => {
        const person = (p ?? {}) as Partial<FabricPerson>;
        return {
          id: typeof person.id === 'string' ? person.id : `unknown-${i}`,
          fingerprint:
            typeof person.fingerprint === 'string'
              ? person.fingerprint
              : `fp-missing-${i}`,
          vector: person.vector,
          lines: person.lines,
        };
      })
    : [];
  return {
    seed: typeof w.seed === 'number' ? w.seed : seedFallback,
    fingerprint:
      typeof w.fingerprint === 'string' && w.fingerprint.length > 0
        ? w.fingerprint
        : `wf-missing-${seedFallback}`,
    people,
    lines: w.lines,
    history: w.history,
    historyCoherence: w.historyCoherence,
    kinEdges: w.kinEdges,
    gapSites: w.gapSites,
    assertions: w.assertions,
  };
}

function wrapGenerateWorld(
  fn: NonNullable<FabricApi['generateWorld']>,
): NonNullable<FabricApi['generateWorld']> {
  return (opts) => {
    const out = fn(opts);
    if (out && typeof (out as Promise<FabricWorld>).then === 'function') {
      return (out as Promise<FabricWorld>).then((w) =>
        normalizeWorld(w, opts.seed),
      );
    }
    return normalizeWorld(out, opts.seed);
  };
}

function pickApi(mod: Record<string, unknown>): FabricApi | null {
  const api: FabricApi = {};

  if (isFunction(mod.createFabric)) {
    api.createFabric = mod.createFabric as FabricApi['createFabric'];
  }
  if (isFunction(mod.createWorldFabric)) {
    api.createWorldFabric = mod.createWorldFabric as FabricApi['createWorldFabric'];
  }
  if (isFunction(mod.generateWorld)) {
    api.generateWorld = wrapGenerateWorld(
      mod.generateWorld as NonNullable<FabricApi['generateWorld']>,
    );
  }
  if (isFunction(mod.generatePeople)) {
    api.generatePeople = mod.generatePeople as FabricApi['generatePeople'];
  }
  if (isFunction(mod.generatePersonDraft)) {
    api.generatePersonDraft =
      mod.generatePersonDraft as FabricApi['generatePersonDraft'];
  }
  if (isFunction(mod.interpolateLine)) {
    api.interpolateLine = mod.interpolateLine as FabricApi['interpolateLine'];
  }
  if (isFunction(mod.assertVoice)) {
    api.assertVoice = mod.assertVoice as FabricApi['assertVoice'];
  }
  if (isFunction(mod.runFabricAssertions)) {
    api.runFabricAssertions =
      mod.runFabricAssertions as FabricApi['runFabricAssertions'];
  }

  // Usable when we can produce a world or a people sample.
  if (api.generateWorld || api.generatePeople || api.generatePersonDraft) {
    return api;
  }
  // Or a fabric factory we can call later once shape is known
  if (api.createFabric || api.createWorldFabric) {
    return api;
  }

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
