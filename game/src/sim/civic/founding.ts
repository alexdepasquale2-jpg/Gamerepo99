/**
 * Founding: a generated district town (`d<col>_<row>_t<i>`) did not start the day the player arrived.
 * The first time its world is bound, it gets the buildings its tier implies already standing
 * (data/civic/zones.json preAged, oldest first, each on a zoned plot, owned by a resident of the
 * trade or by the eldest for the commons), dated years before day 1, and the chronicle gets the
 * backstory ("The granary at X went up the year of the long frost"), so the old folk can tell it.
 * Home towns start as they are. Idempotent (the town's civic record marks it founded).
 * Pure, deterministic (deriveRng), no Phaser/DOM.
 */
import { chronicleCivic } from '../chronicle';
import { BUILDING_BY_ID, stakePlan } from '../economy/build-plans';
import { jobOf } from '../goods/jobs';
import { districtOfTown } from '../map/districts';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { residentsOf, tierIndex, tierOf, TIERS, townPopulation, type Tier } from './tiers';
import { civicOf, townKind, yearName, ZONES } from './zoning';

/** Kinds the chronicle remembers raising (the rest are just more roofs). */
const NOTABLE = new Set(['granary', 'market', 'barracks', 'townhall', 'chapel', 'mill']);

/** Eldest first, then by id (the council's voice when nobody leads). */
export function eldestOf(state: SimState, ids: string[]): string | undefined {
  return [...ids].sort((a, b) => (state.people[b]?.age ?? 0) - (state.people[a]?.age ?? 0) || a.localeCompare(b))[0];
}

/** What a founding town can be: its kind caps it (a village never starts a city), its people decide. */
function foundingTier(state: SimState, townId: string): Tier {
  const cap = tierIndex(townKind(state, townId));
  const pop = townPopulation(state, townId);
  let best = TIERS[0]!;
  for (const t of TIERS) if (tierIndex(t.id) <= cap && pop >= t.pop) best = t;
  return best;
}

const firstName = (state: SimState, id: string): string => (state.people[id]?.name ?? 'Someone').split(' ')[0]!;

/** Place every unfounded district town's pre-aged buildings and backstory. */
export function foundCivicTowns(state: SimState): void {
  for (const townId of Object.keys(state.towns ?? {}).sort()) {
    if (!districtOfTown(townId)) continue;
    const civic = civicOf(state, townId);
    if (civic.founded) continue;
    const folk = residentsOf(state, townId);
    // Nobody home yet: found it on a later bind, once its people are.
    if (!folk.length) continue;
    civic.founded = true;
    const tier = foundingTier(state, townId);
    const kinds = ZONES.preAged[tier.id] ?? [];
    const elder = eldestOf(state, folk)!;
    const rng = deriveRng(state.seed, 'pre-aged', townId);
    const owners = new Set<string>();
    let yearsAgo = kinds.length * ZONES.yearsPerBuilding + rng.int(0, 3);
    let built = 0;
    for (const kind of kinds) {
      const def = BUILDING_BY_ID.get(kind);
      if (!def) continue;
      // Its trade's folk first; the commons fall to the eldest; anything else to whoever has nothing yet.
      const trade = folk.find((id) => !owners.has(id) && def.jobs.includes(jobOf(state, id).id));
      const owner = trade ?? (def.jobs.length ? folk.find((id) => !owners.has(id)) : undefined) ?? elder;
      const day = 1 - yearsAgo * ZONES.yearDays - rng.int(0, ZONES.yearDays);
      const year = yearName(state.seed, day);
      yearsAgo = Math.max(1, yearsAgo - ZONES.yearsPerBuilding);
      if (!stakePlan(state, owner, townId, kind, { built: true, day, founding: true })) continue;
      owners.add(owner);
      built += 1;
      if (NOTABLE.has(kind)) chronicleCivic(state, 'raised', kind, townId, { building: def.name, owner: firstName(state, owner), when: `the year of ${year}` }, day, [owner]);
      // The building that made it what it is: the year it became its tier.
      const now = tierOf(state, townId, undefined, built);
      if (tierIndex(now.id) > 0 && tierIndex(now.id) > tierIndex(civic.tier)) {
        civic.tier = now.id;
        chronicleCivic(state, 'tier', now.id, townId, { tier: now.name, when: `the year of ${year}` }, day);
      }
    }
    civic.tier = tierOf(state, townId).id;
  }
}
