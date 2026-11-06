/**
 * Fabric / worldgen public API adapter (Probe).
 * Feature-detects Forge exports from src/sim/fabric.ts (file facade) and src/sim.
 * Returns null until enough surface exists to run generator quality bots.
 *
 * Types live in fabric-api-types.ts (soft-cap split). Forge PersonDraft /
 * FabricWorld already match Probe contracts (id, fingerprint, vector, lines,
 * history, kinEdges, gapSites, assertions) — no adapter normalize needed yet.
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

import type { FabricApi } from './fabric-api-types';

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

function pickApi(mod: Record<string, unknown>): FabricApi | null {
  const api: FabricApi = {};

  if (isFunction(mod.createFabric)) {
    api.createFabric = mod.createFabric as FabricApi['createFabric'];
  }
  if (isFunction(mod.createWorldFabric)) {
    api.createWorldFabric = mod.createWorldFabric as FabricApi['createWorldFabric'];
  }
  if (isFunction(mod.generateWorld)) {
    api.generateWorld = mod.generateWorld as FabricApi['generateWorld'];
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
