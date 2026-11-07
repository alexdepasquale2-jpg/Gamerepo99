/** Async legacy world file: export/import as pure functions (no server, no DOM I/O). */

import { bootPlayState } from '../play-session/play-session-state';
import type { SimState } from '../types/runtime';
import { applyDeltas, contentHash, digestOf, isKnownDelta, reduceDeltas, sanitizeDeltas, sanitizeImprint, stateDigest } from './delta-log';
import { placeLegend } from './npc';
import { CURRENT_WORLD_VERSION, ensureLegacy, legacyTable } from './state';
import type { HearthWorldFile, WorldDelta } from './types';

const DAY_MS = 86_400_000;

/** Pure migrations: migrations[v] upgrades a version-v file to v+1. */
export const migrations: Record<number, (f: HearthWorldFile) => HearthWorldFile> = {};

export function exportWorld(state: SimState, opts: { exporterName?: string; createdAt?: string; compatible?: boolean } = {}): HearthWorldFile {
  const lg = ensureLegacy(state);
  const deltas: WorldDelta[] = [...lg.deltas, { t: 'day', day: state.day }];
  const packs = [...legacyTable().contentPackIds];
  return {
    format: 'hearthfall.world',
    version: CURRENT_WORLD_VERSION,
    // Deterministic by default: sim-time, not wall-clock. The UI adapter may pass a real timestamp.
    createdAt: opts.createdAt ?? new Date(state.day * DAY_MS).toISOString(),
    ...(opts.exporterName ? { exporterName: opts.exporterName } : {}),
    seed: state.seed,
    contentHash: contentHash(state.seed, packs, deltas),
    contentPackIds: packs,
    deltas,
    imprint: lg.lastImprint,
    ...(opts.compatible ? { compatible: true } : {}),
    worldDigest: digestOf(reduceDeltas(deltas)),
  };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function importWorld(raw: unknown): { state: SimState; legends: string[] } | { error: string } {
  if (!isRec(raw) || raw.format !== 'hearthfall.world') return { error: 'Not a Hearthfall world file.' };
  if (typeof raw.version !== 'number' || typeof raw.seed !== 'number' || !Array.isArray(raw.deltas) || !Array.isArray(raw.contentPackIds)) {
    return { error: 'World file is malformed.' };
  }
  if (raw.version > CURRENT_WORLD_VERSION) return { error: `World file version ${raw.version} is newer than this game understands.` };
  if (raw.version < 1) return { error: 'World file version is invalid.' };
  let file = raw as unknown as HearthWorldFile;
  for (let v = file.version; v < CURRENT_WORLD_VERSION; v++) {
    const m = migrations[v];
    if (!m) return { error: `No migration from world file version ${v}.` };
    file = { ...m(file), version: v + 1 };
  }
  const known = new Set(legacyTable().contentPackIds);
  const missing = file.contentPackIds.filter((p) => !known.has(p));
  if (missing.length) return { error: `Missing content pack: ${missing.join(', ')}.` };
  if (contentHash(file.seed, file.contentPackIds, file.deltas) !== file.contentHash) return { error: 'World file hash mismatch (edited or corrupt).' };
  const rawDeltas: WorldDelta[] = [];
  for (const d of file.deltas) {
    if (isKnownDelta(d)) rawDeltas.push(d);
    else if (!file.compatible) return { error: `Unknown delta kind "${String((d as { t?: unknown })?.t)}"; this world file is not marked compatible.` };
  }

  const { state } = bootPlayState(file.seed, legacyTable().defaultImportArchetypeId) as { state: SimState };
  const deltas = sanitizeDeltas(state, rawDeltas);
  const imprint = sanitizeImprint(state, file.imprint);
  applyDeltas(state, deltas);
  const expected = reduceDeltas(deltas);
  if (file.worldDigest !== undefined && (file.worldDigest !== digestOf(expected) || stateDigest(state, expected) !== digestOf(expected))) {
    return { error: 'World replay did not reproduce the recorded world.' };
  }
  const lg = ensureLegacy(state);
  lg.deltas = deltas.at(-1)?.t === 'day' ? deltas.slice(0, -1) : deltas;
  lg.lastImprint = imprint;
  const legends = imprint ? placeLegend(state, imprint) : [];
  return { state, legends };
}
