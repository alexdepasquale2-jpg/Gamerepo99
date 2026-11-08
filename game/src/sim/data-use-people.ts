/**
 * Proof-of-use tracker for the people / voice / hooks / systems data (game/scripts/coverage-people.mts).
 * A row counts as used only when the code path where it takes effect runs: a fallback key picked and
 * spoken, a fragment chosen for a line, a hook fired, a deed resolved, an event / doctrine / mark applied.
 * Importing or parsing a file never counts.
 *
 * It is a write-only side channel: nothing in the sim reads it back, so it cannot change an outcome and
 * saves / replays stay deterministic. The browser exposes it as window.__hearth.dev.uses().
 */

const used = new Map<string, Set<string>>();

/** Record that `id` of data file `file` (path under game/src/data, no .json) just took effect. */
export function noteUse(file: string, id: string | undefined | null): void {
  if (!id) return;
  let s = used.get(file);
  if (!s) used.set(file, (s = new Set()));
  s.add(id);
}

/** Every id noted so far, by file. */
export function usedIds(): ReadonlyMap<string, ReadonlySet<string>> {
  return used;
}

/** Plain-object copy (for the dev hook and the coverage report). */
export function usedSnapshot(): Record<string, string[]> {
  return Object.fromEntries([...used].map(([f, s]) => [f, [...s].sort()]));
}

export function resetUses(): void {
  used.clear();
}

/**
 * A read-through view of a keyed dialogue table (section -> key -> lines) that notes `section.key` when a
 * line group is looked up by key: the moment a line from it is being picked. `sections` limits tracking to
 * the keyed groups (scalars and config read through untouched). Values come back as-is. Callers must read
 * a group by key, not enumerate it, or every key would count (enumerations take the raw `table` instead).
 */
export function trackedTable<T extends object>(file: string, table: T, sections: readonly string[]): T {
  const wrapped = new Map<string, object>();
  return new Proxy(table, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv) as unknown;
      if (typeof prop !== 'string' || !sections.includes(prop) || !v || typeof v !== 'object' || Array.isArray(v)) return v;
      let w = wrapped.get(prop);
      if (!w) {
        w = new Proxy(v as object, {
          get(t2, k, r2) {
            const out = Reflect.get(t2, k, r2) as unknown;
            if (typeof k === 'string' && out !== undefined) noteUse(file, `${prop}.${k}`);
            return out;
          },
        });
        wrapped.set(prop, w);
      }
      return w;
    },
  });
}
