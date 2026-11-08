/**
 * Which names a town's folk carry. Home towns use the authored pool (data/people/names.json); a generated
 * district town (`d<col>_<row>_t<i>`) uses its district's naming culture (data/world/districts.json), so
 * people born, arriving or met there sound like the place. Pure and deterministic: the culture is a function
 * of (seed, col, row) via districtAt.
 */
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
