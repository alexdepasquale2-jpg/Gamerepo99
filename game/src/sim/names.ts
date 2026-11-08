/**
 * Which names a town's folk carry. Home towns use the authored pool (data/people/names.json); a generated
 * district town (`d<col>_<row>_t<i>`) uses its district's naming culture (data/world/districts.json), so
 * people born, arriving or met there sound like the place. Pure and deterministic: the culture is a function
 * of (seed, col, row) via districtAt.
 */
import { noteUse } from './data-use-people';
import namesJson from '../data/people/names.json';
import { cultureById, districtAt, districtOfTown } from './map/districts';

export type NamePool = { given: string[]; family: string[] };

const HOME: NamePool = namesJson as NamePool;
/** Culture id per (seed, district): districtAt also places towns, so do it once per district. */
const cultureCache = new Map<string, NamePool>();

/**
 * The given and family name pools for folk of `townId` (home pool when the town is not a generated one).
 * Given several towns (a road's two ends), the first generated one decides, so a road into a district
 * sounds like the district whichever end is listed first.
 */
export function namePool(seed: number | { seed: number }, townId: string | undefined | readonly (string | undefined)[]): NamePool {
  const ids = Array.isArray(townId) ? townId : [townId];
  const d = ids.map((t) => (t ? districtOfTown(t) : null)).find((x) => x) ?? null;
  if (!d) return HOME;
  const s = typeof seed === 'number' ? seed : seed.seed;
  const key = `${s}:${d.col}:${d.row}`;
  let pool = cultureCache.get(key);
  if (!pool) {
    const c = cultureById(districtAt(s, d.col, d.row).character.culture);
    pool = c?.people.length && c.family?.length ? { given: c.people, family: c.family } : HOME;
    if (cultureCache.size > 64) cultureCache.clear();
    cultureCache.set(key, pool);
  }
  return pool;
}

/**
 * The set a full name must be unique within: a whole generated district (folk travel between its towns, so two
 * "Kit Medlar"s a day apart read as one person), else the single town (home towns keep their authored repeats).
 */
export function nameScope(townId: string | undefined): string {
  const d = townId ? districtOfTown(townId) : null;
  return d ? `d${d.col}_${d.row}` : townId ?? '';
}

/**
 * A full name `<given> <family>` not yet in `used`. `roll(k)` is the caller's seeded given-name index for try k
 * (so the first try keeps the name it always had); after a few tries it walks the pool from the first roll, which
 * guarantees a free name whenever one exists. The family name never changes: kin keep their surname.
 */
export function distinctName(given: readonly string[], family: string, used: ReadonlySet<string>, roll: (k: number) => number): string {
  const nameAt = (i: number) => `${given[((i % given.length) + given.length) % given.length]!} ${family}`;
  for (let k = 0; k < 8; k++) { const n = nameAt(roll(k)); if (!used.has(n)) return named(n, family); }
  const start = roll(0);
  for (let j = 1; j < given.length; j++) { const n = nameAt(start + j); if (!used.has(n)) return named(n, family); }
  return named(nameAt(start), family);
}

/** A home-pool name given to someone: it is on their name plate from now on (proof-of-use). */
function named(full: string, family: string): string {
  const g = full.slice(0, full.length - family.length - 1);
  if (HOME.given.includes(g)) noteUse('people/names', `given.${g}`);
  if (HOME.family.includes(family)) noteUse('people/names', `family.${family}`);
  return full;
}
