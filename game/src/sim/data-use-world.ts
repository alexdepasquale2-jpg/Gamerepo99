/**
 * Dev-only proof that data rows are used, not just parsed (world, items, crafting, goods, crops, art).
 * Each row calls noteUse(file, id) at the exact code path where it takes effect: an item is gained or
 * spent, a recipe crafted, a prop verb run or a prop drawn, a crop field grown, a load lifted, a shop
 * settled. game/scripts/coverage-world.mts drives a headless session and fails on any row never noted;
 * the browser pass reads the same set through window.__hearth.dev.dataUse().
 *
 * It is a plain module Set, outside SimState on purpose: it never feeds back into the sim, so it cannot
 * change a seed's outcome or a save, and it costs one Set.add per use.
 */
const USED = new Set<string>();

/** `file` is the data file's short name (items, items.use, recipes, props, …); `id` its row id. */
export function noteUse(file: string, id: string): void {
  USED.add(`${file}:${id}`);
}

/** Every `file:id` noted since load (or the last reset), sorted. */
export const usedIds = (): string[] => [...USED].sort();

export function resetUse(): void {
  USED.clear();
}
