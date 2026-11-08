import type { HoardState } from './hoard/state';
import type { LegacyState, ProtagonistImprint } from './legacy/types';
import type { UnspokenState } from './social/unspoken-types';
import { dataForSeed, loadData, type DataTables } from './load-data';
import type { SimState } from './types/runtime';
import type { TravelSimState } from './travel/travel';
import { tickCaravans } from './caravans';
import { doctrineSupplyHook } from './doctrine-tick';
import { createEventBus } from './event-bus';
import { generateWorld } from './fabric/fabric-bake';
import { carryHistory } from './history-voice';
import { createRng } from './rng';
import { loadBiomeTerrainMuls, loadEncounterTables, loadSizeTravelMuls, toTravelRoutes } from './travel/travel';
import { installPlayReactions } from './play-session/play-session-act';
import { bootPlayState } from './play-session/play-session-state';
import { rescalePoint } from './map/tile-edits';
import { backfillSeededWounds } from './social/seeded-wounds';
import { inventoryOf } from './goods/inventory';

/** Pure save blob helpers — no DOM I/O (persistence adapter lives in ui/). */

/**
 * Save format version. History (each step has an entry in `saveMigrations`):
 * - 1: thin blob (seed, day, coin and a few top-level fields), no `sim`.
 * - 2: full sim in `sim`, on the old map scale.
 * - 3: full sim on the 40x world (WORLD_SCALE).
 *
 * When to bump: only when the meaning or shape of something already saved changes (a field is renamed,
 * rescaled, split). Adding a new optional field to SimState never needs a bump: saveState writes every
 * non-transient key, loadState restores whatever keys `sim` holds, and the code that owns the field creates
 * it lazily (`state.x ??= ...`), so older saves simply lack it. To bump: raise SAVE_VERSION, add
 * `saveMigrations[old]` (old -> old + 1), and add a fixture to game/scripts/save-fixtures.
 */
export const SAVE_VERSION = 3;

export type SaveBlob = {
  /** See SAVE_VERSION. Older versions are upgraded step by step by `migrateSave` on load. */
  version: number;
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
  /** v2+: every other persisted runtime field of SimState (player, people, flags, towns, ...). */
  sim?: Record<string, unknown>;
  /** v2+: main rng stream position. */
  rngState?: number;
};

/** Top-level blob fields (not duplicated inside `sim`). */
const TOP_KEYS = ['seed', 'unspoken', 'hoard', 'legacy', 'patronDeals'];
/** Derived / static / non-serializable: rebuilt by loadState, never saved. */
const TRANSIENT_KEYS = [
  'data', 'bus', 'rng', 'reactionLineSelector', 'economyHooks', 'kinEdges',
  'routes', 'encounterTables', 'biomeTerrainMuls', 'sizeTravelMuls', 'history',
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

type GeneratedWorld = ReturnType<typeof generateWorld>;

/** What a migration may need besides the blob: the static tables, the inhabitant, and the save's world (built once, lazily). */
export type SaveMigrationContext = { data: DataTables; archetypeId: string; world: () => GeneratedWorld };

/**
 * Stepwise migrations: saveMigrations[v] upgrades a version-v blob to v + 1 (migrateSave stamps the version).
 * Each step takes and returns a JSON-safe blob and must not mutate its input.
 */
export const saveMigrations: Record<number, (blob: SaveBlob, ctx: SaveMigrationContext) => SaveBlob> = {
  // v1 -> v2: the thin blob becomes a full sim. Boot the seed's world fresh and overlay what v1 carried
  // (day, coin; the top-level fields ride along untouched). A fresh boot has no ground items, so the
  // v2 -> v3 rescale that follows has nothing to move.
  1: (blob, ctx) => {
    const state = bootPlayState(blob.seed, ctx.archetypeId, ctx.data).state;
    if (blob.tick > 0) state.day = blob.tick;
    if (typeof blob.coin === 'number') state.player.coin = inventoryOf(state).coin = blob.coin;
    const fresh = saveState(state);
    const carried = Object.fromEntries(Object.entries(blob).filter(([, v]) => v !== undefined)) as Partial<SaveBlob>;
    return { ...fresh, ...carried, sim: fresh.sim, rngState: fresh.rngState, tick: state.day, coin: state.player.coin };
  },
  // v2 -> v3: the world grew 40x (WORLD_SCALE). Things set down on the ground move with their nearest settlement.
  2: (blob, ctx) => {
    const sim = clone(blob.sim ?? {}) as { groundItems?: { x: number; y: number }[] };
    const settlements = sim.groundItems?.length ? (ctx.world().settlements ?? []) : [];
    for (const g of sim.groundItems ?? []) Object.assign(g, rescalePoint(settlements, blob.seed, g.x, g.y));
    return { ...blob, sim: sim as Record<string, unknown> };
  },
};

/** Upgrade a blob to SAVE_VERSION one step at a time. Throws on a newer or unknown version (validateSave words it for players). */
export function migrateSave(blob: SaveBlob, ctx: SaveMigrationContext): SaveBlob {
  if (blob.version > SAVE_VERSION) throw new Error(`Save version ${blob.version} is newer than this game (${SAVE_VERSION}).`);
  let out = blob;
  for (let v = blob.version; v < SAVE_VERSION; v++) {
    const step = saveMigrations[v];
    if (!step) throw new Error(`No save migration from version ${v}.`);
    out = { ...step(out, ctx), version: v + 1 };
  }
  return out;
}

/** True when every step from `version` up to SAVE_VERSION exists. */
function hasMigrationPath(version: number): boolean {
  for (let v = version; v < SAVE_VERSION; v++) if (!saveMigrations[v]) return false;
  return true;
}

/** The one load path: blob (+ static data) -> migrated to SAVE_VERSION -> SimState with derived parts rebuilt. */
export function loadState(raw: SaveBlob, data: DataTables = loadData(), archetypeId = 'marrow'): SimState {
  // The save's own world: its social web follows its seed, whatever world `data` came from.
  data = dataForSeed(data, raw.seed);
  let world: GeneratedWorld | undefined;
  const worldOf = (): GeneratedWorld => (world ??= generateWorld({ seed: raw.seed, includeAnchors: true, peopleCount: 60 }));
  const blob = migrateSave(raw, { data, archetypeId, world: worldOf });
  const w = worldOf();
  // Keys in `sim` this build does not know (fields from a newer branch) are carried as they are.
  const state: TravelSimState = {
    ...(clone(blob.sim ?? {}) as unknown as TravelSimState),
    seed: blob.seed,
    data,
    bus: { lastIds: [], ...createEventBus() },
    rng: createRng(blob.seed),
    routes: toTravelRoutes(w.routes ?? []),
    kinEdges: w.kinEdges ?? [],
    encounterTables: loadEncounterTables(),
    biomeTerrainMuls: loadBiomeTerrainMuls(),
    sizeTravelMuls: loadSizeTravelMuls(),
    history: carryHistory(w.history),
  };
  state.economyHooks = { caravan: (s) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
  installPlayReactions(state);
  for (const k of ['unspoken', 'hoard', 'legacy', 'patronDeals'] as const) {
    if (blob[k] !== undefined) (state as Record<string, unknown>)[k] = clone(blob[k]);
  }
  // B12: saves from before seeded wounds give generated villagers the wound a fresh boot would.
  backfillSeededWounds(state);
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

/** Friendly validation: rejects non-objects, newer versions and versions with no migration path; v1 optional fields stay optional. */
export function validateSave(raw: unknown): SaveCheck {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'That save could not be read.' };
  const b = raw as Record<string, unknown>;
  if (typeof b.version !== 'number') return { ok: false, error: 'That save has no version and cannot be read.' };
  if (b.version > SAVE_VERSION) return { ok: false, error: `That save is from a newer version (${b.version}) than this game understands.` };
  if (!Number.isInteger(b.version) || b.version < 1 || !hasMigrationPath(b.version)) return { ok: false, error: 'That save has an unknown version.' };
  if (typeof b.seed !== 'number' || typeof b.tick !== 'number') return { ok: false, error: 'That save is missing its world.' };
  if (b.version >= 2 && (typeof b.sim !== 'object' || b.sim === null)) return { ok: false, error: 'That save is missing its world state.' };
  return { ok: true, blob: { ...(b as unknown as SaveBlob), npcs: Array.isArray(b.npcs) ? (b.npcs as SaveBlob['npcs']) : [] } };
}

export function parseAndValidateSave(raw: string): SaveCheck {
  try {
    return validateSave(JSON.parse(raw));
  } catch {
    return { ok: false, error: 'That save could not be read.' };
  }
}
