/** Async legacy world file: export/import as pure functions (no server, no DOM I/O). */

import archetypesJson from '../../data/people/archetypes.json';
import { bootPlayState } from '../play-session/play-session-state';
import type { SimState } from '../types/runtime';
import { applyDeltas, contentHash, digestOf, isKnownDelta, reduceDeltas, sanitizeDeltas, sanitizeImprint, stateDigest } from './delta-log';
import { describeArrival, type Arrival } from './arrival';
import { placeLegend } from './npc';
import { CURRENT_WORLD_VERSION, ensureLegacy, legacyTable } from './state';
import type { HearthWorldFile, ProtagonistImprint, WorldDelta } from './types';

const DAY_MS = 86_400_000;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** v1 files did not name the archetype; it is recoverable when exactly one archetype has the imprint's body and species. */
function inferArchetypeId(im: ProtagonistImprint): string | undefined {
  const tags = [...(Array.isArray(im.speciesTags) ? im.speciesTags : [])].sort().join(',');
  const hits = (archetypesJson.archetypes as { id: string; speciesTags?: string[]; embodimentTraitId?: string }[]).filter(
    (a) => a.embodimentTraitId === im.embodimentTraitId && [...(a.speciesTags ?? [])].sort().join(',') === tags,
  );
  return hits.length === 1 ? hits[0]!.id : undefined;
}

/**
 * Pure migrations: migrations[v] upgrades a version-v file to v+1 (the loop in importWorld stamps the version).
 * Integrity is checked on the file exactly as it was written, before any migration runs, so contentHash keeps
 * meaning "these bytes were not edited". A migration must leave the hashed fields (seed, packs, deltas) alone;
 * one that ever has to rewrite them must recompute contentHash and worldDigest itself.
 */
export const migrations: Record<number, (f: HearthWorldFile) => HearthWorldFile> = {
  // v1 -> v2: imprints learn their archetype and generation. Generation defaults to the number of lives laid
  // to rest in the log (each ending writes one grave, this imprint's own included); archetype is inferred.
  1: (f) => {
    if (!isRec(f.imprint)) return { ...f, imprint: null };
    const im = f.imprint;
    const graves = new Set(f.deltas.filter((d) => isRec(d) && d.t === 'grave').map((d) => (d as { personId?: unknown }).personId)).size;
    const archetypeId = im.archetypeId ?? inferArchetypeId(im);
    return { ...f, imprint: { ...im, generation: im.generation ?? Math.max(1, graves), ...(archetypeId ? { archetypeId } : {}) } };
  },
};

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

export type ImportedWorld = {
  state: SimState;
  /** Legend rumor lines placed into the world (lg.legends). */
  legends: string[];
  /** The names that came across (legend + graves), with diegetic lines for the import screen. */
  arrival: Arrival;
  /** Format version of the file as written, before migration. */
  fromVersion: number;
};

export function importWorld(raw: unknown): ImportedWorld | { error: string } {
  if (!isRec(raw) || raw.format !== 'hearthfall.world') return { error: 'Not a Hearthfall world file.' };
  if (typeof raw.version !== 'number' || typeof raw.seed !== 'number' || !Array.isArray(raw.deltas) || !Array.isArray(raw.contentPackIds) || !raw.contentPackIds.every((p) => typeof p === 'string')) {
    return { error: 'World file is malformed.' };
  }
  if (raw.version > CURRENT_WORLD_VERSION) {
    return { error: `This world file was made by a newer version of the game (format ${raw.version}; this one reads up to ${CURRENT_WORLD_VERSION}). Update the game to open it.` };
  }
  if (!Number.isInteger(raw.version) || raw.version < 1) return { error: 'World file version is invalid.' };
  // Integrity first, on the file as written (see `migrations`).
  if (contentHash(raw.seed, raw.contentPackIds as string[], raw.deltas as WorldDelta[]) !== raw.contentHash) {
    return { error: 'World file hash mismatch: it was edited or damaged after it was made, so nothing was imported.' };
  }
  const fromVersion = raw.version;
  let file = raw as unknown as HearthWorldFile;
  for (let v = file.version; v < CURRENT_WORLD_VERSION; v++) {
    const m = migrations[v];
    if (!m) return { error: `No migration from world file version ${v}.` };
    file = { ...m(file), version: v + 1 };
  }
  const known = new Set(legacyTable().contentPackIds);
  const missing = file.contentPackIds.filter((p) => !known.has(p));
  if (missing.length) return { error: `Missing content pack: ${missing.join(', ')}.` };
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
  return { state, legends, arrival: describeArrival(state, imprint, deltas), fromVersion };
}
