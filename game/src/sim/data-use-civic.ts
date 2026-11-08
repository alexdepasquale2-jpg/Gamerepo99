/**
 * Data-use tracker for the economy / civic / polity / realm / history tables: every row records itself
 * here at the code path where it takes effect (a site founded, a zone applied, a tier reached, a deal
 * offered, a history beat told ...). scripts/coverage-civic.mts boots whole worlds and fails on any id
 * that never shows up, so "in the data" always means "in the game". Write-only for the sim: nothing
 * reads it back to decide anything, so determinism is untouched. Keys are `${file}#${id}`.
 */
const used = new Set<string>();

/** Row `id` of data file `file` (path under game/src/data, no extension) just did its work. */
export function noteUse(file: string, id: string): void {
  used.add(`${file}#${id}`);
}

/** Every `${file}#${id}` seen since load (or the last reset). */
export const usedIds = (): ReadonlySet<string> => used;
export const resetUses = (): void => used.clear();
