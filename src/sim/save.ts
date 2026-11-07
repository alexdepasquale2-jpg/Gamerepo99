import type { HoardState } from './hoard/state';
import type { LegacyState, ProtagonistImprint } from './legacy/types';
import type { UnspokenState } from './social/unspoken-types';
import type { DataTables } from './load-data';
import type { SimState } from './types/runtime';
import type { TravelSimState } from './travel/travel';
import { tickCaravans } from './caravans';
import { doctrineSupplyHook } from './doctrine-tick';
import { createEventBus } from './event-bus';
import { generateWorld } from './fabric/fabric-bake';
import { createRng } from './rng';
import { loadBiomeTerrainMuls, loadEncounterTables, loadSizeTravelMuls, toTravelRoutes } from './travel/travel';
import { installPlayReactions } from './play-session/play-session-act';
import { bootPlayState } from './play-session/play-session-state';

/** Pure save blob helpers — no DOM I/O (persistence adapter lives in ui/). */

export const SAVE_VERSION = 2 as const;

export type SaveBlob = {
  /** 2 = full sim in `sim`; 1 = legacy thin blob (still parsed, loaded best-effort). */
  version: 1 | 2;
  seed: number;
  tick: number;
  npcs: Array<{ id: string; x: number; y: number }>;
  /** Social graph 06: Blessings and Burdens instances + tuning. */
  unspoken?: UnspokenState;
  /** Hoarder path: carried coin + hoard state (notoriety, stashes, peakCoin, reigniteCount). */
  coin?: number;
  hoard?: HoardState;
  /** Legacy: reserved protagonist imprint + bond/grave/lineage state (M5 Task C). */
  imprint?: ProtagonistImprint | null;
  legacy?: LegacyState;
  patronDeals?: Record<string, import('./patrons/types').PatronDeal>;
  /** v2: every other persisted runtime field of SimState (player, people, flags, towns, ...). */
  sim?: Record<string, unknown>;
  /** v2: main rng stream position. */
  rngState?: number;
};

/** Top-level blob fields (not duplicated inside `sim`). */
const TOP_KEYS = ['seed', 'unspoken', 'hoard', 'legacy', 'patronDeals'];
/** Derived / static / non-serializable: rebuilt by loadState, never saved. */
const TRANSIENT_KEYS = [
  'data', 'bus', 'rng', 'reactionLineSelector', 'economyHooks', 'kinEdges',
  'routes', 'encounterTables', 'biomeTerrainMuls', 'sizeTravelMuls',
];

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** The one save path: SimState -> JSON-safe blob. */
export function saveState(state: SimState): SaveBlob {
  const skip = new Set<string>([...TOP_KEYS, ...TRANSIENT_KEYS]);
  const sim: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (!skip.has(k) && typeof v !== 'function' && v !== undefined) sim[k] = clone(v);
  }
  return {
    version: SAVE_VERSION,
    seed: state.seed,
    tick: state.day,
    npcs: [],
    unspoken: clone(state.unspoken),
    coin: state.player.coin,
    hoard: clone(state.hoard),
    imprint: clone(state.legacy?.lastImprint ?? null),
    legacy: clone(state.legacy),
    patronDeals: clone(state.patronDeals),
    sim,
    rngState: (state.rng as { getState?: () => number } | undefined)?.getState?.(),
  };
}

/** The one load path: blob (+ static data) -> SimState with derived parts rebuilt. */
export function loadState(blob: SaveBlob, data: DataTables, archetypeId = 'marrow'): SimState {
  let state: TravelSimState;
  if (blob.sim) {
    const world = generateWorld({ seed: blob.seed, includeAnchors: true, peopleCount: 60 });
    state = {
      ...(clone(blob.sim) as unknown as TravelSimState),
      seed: blob.seed,
      data,
      bus: { lastIds: [], ...createEventBus() },
      rng: createRng(blob.seed),
      routes: toTravelRoutes(world.routes ?? []),
      kinEdges: world.kinEdges ?? [],
      encounterTables: loadEncounterTables(),
      biomeTerrainMuls: loadBiomeTerrainMuls(),
      sizeTravelMuls: loadSizeTravelMuls(),
    };
    state.economyHooks = { caravan: (s) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
    installPlayReactions(state);
  } else {
    // v1 thin blob: fresh boot, overlay what v1 carried.
    state = bootPlayState(blob.seed, archetypeId).state;
    state.day = blob.tick > 0 ? blob.tick : state.day;
    if (blob.coin !== undefined) state.player.coin = blob.coin;
  }
  for (const k of ['unspoken', 'hoard', 'legacy', 'patronDeals'] as const) {
    if (blob[k] !== undefined) (state as Record<string, unknown>)[k] = clone(blob[k]);
  }
  if (typeof blob.rngState === 'number') (state.rng as { setState?: (s: number) => void }).setState?.(blob.rngState);
  return state;
}

export function serializeSave(blob: SaveBlob): string {
  return JSON.stringify(blob);
}

export function parseSave(raw: string): SaveBlob | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as SaveBlob;
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch {
    return null;
  }
}

export type SaveCheck = { ok: true; blob: SaveBlob } | { ok: false; error: string };

/** Friendly validation: rejects non-objects and unknown versions; v1 optional fields stay optional. */
export function validateSave(raw: unknown): SaveCheck {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'That save could not be read.' };
  const b = raw as Record<string, unknown>;
  if (typeof b.version !== 'number') return { ok: false, error: 'That save has no version and cannot be read.' };
  if (b.version > SAVE_VERSION) return { ok: false, error: `That save is from a newer version (${b.version}) than this game understands.` };
  if (b.version !== 1 && b.version !== 2) return { ok: false, error: 'That save has an unknown version.' };
  if (typeof b.seed !== 'number' || typeof b.tick !== 'number') return { ok: false, error: 'That save is missing its world.' };
  if (b.version === 2 && (typeof b.sim !== 'object' || b.sim === null)) return { ok: false, error: 'That save is missing its world state.' };
  return { ok: true, blob: { ...(b as unknown as SaveBlob), npcs: Array.isArray(b.npcs) ? (b.npcs as SaveBlob['npcs']) : [] } };
}

export function parseAndValidateSave(raw: string): SaveCheck {
  try {
    return validateSave(JSON.parse(raw));
  } catch {
    return { ok: false, error: 'That save could not be read.' };
  }
}
