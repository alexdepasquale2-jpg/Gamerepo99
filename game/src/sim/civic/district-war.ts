/**
 * What a war between districts does to the district you stand in (civic/district-relations decides the
 * war; this is its weight on people). While the live district is at war:
 *   - the levy: once per war, some adults march (they leave their town, like a traveller on the road, and
 *     the towns' despair rises as they go);
 *   - every dawn the levy is fed from the seat's food stock.
 * When that war is over (here, or while you were away and the district sat frozen), the levy walks home;
 * a seeded few do not, and are laid to rest through mortality like any death. Pure + deterministic.
 */
import { worldSeat } from '../doctrine-tick';
import { takeFood } from '../economy/food-stock';
import { laidToRest } from '../economy/mortality';
import { realmOf } from '../realm';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { ON_ROAD_TAG } from '../visitors';
import { bumpDespair, districtName, DPOL, ensurePolity, liveId, liveRelations, news, otherOf, pairOf, type DistrictRelation, type Levy } from './district-relations';

export const LEVY_TAG = 'levy';
const SPARED = ['leader', 'doctrine_voice', 'legacy_player', 'retired', LEVY_TAG];

/** Grown folk who could march: adults of the live towns, not the leader, not already gone, not visitors. */
function levyPool(state: SimState): string[] {
  return Object.keys(state.people).sort().filter((id) => {
    const p = state.people[id]!;
    const age = p.age ?? 30;
    return !!p.townId && !!state.towns?.[p.townId] && age >= 18 && age < 60 && !p.tags?.some((t) => SPARED.includes(t) || t.startsWith('visitor'));
  });
}

function raiseLevy(state: SimState, r: DistrictRelation, live: string): void {
  const pool = levyPool(state);
  const n = Math.min(DPOL.levyMax, Math.ceil(pool.length * DPOL.levyShare));
  if (n <= 0) return;
  const rng = deriveRng(state.seed, 'district-levy', r.a, r.b, r.since);
  const pick = [...pool];
  for (let i = pick.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [pick[i], pick[j]] = [pick[j]!, pick[i]!]; }
  const p = ensurePolity(state);
  for (const id of pick.slice(0, n)) {
    const person = state.people[id]!;
    p.levies.push({ personId: id, townId: person.townId!, district: live, pair: pairOf(r.a, r.b), since: r.since });
    // Off to the war: no town holds them, and like a traveller between towns (on_road) no re-bind of the
    // world hands them one back, so work, rings and residents skip them until they walk home.
    delete person.townId;
    person.tags = [...(person.tags ?? []), LEVY_TAG, ON_ROAD_TAG];
  }
  bumpDespair(state, live, DPOL.levyDespair);
  news(state, 'levy', { n: String(n), other: districtName(state, otherOf(r, live)) });
}

/** Levies of the live district whose war has ended walk home; a seeded few fell. */
function bringHome(state: SimState, live: string): void {
  const p = ensurePolity(state);
  // A district dropped from the frozen few is rebuilt from the seed when you return: its levy was never
  // raised there, so those records go (and the live sim's people are only touched while still tagged).
  const realm = realmOf(state);
  p.levies = p.levies.filter((l) => l.district === live || !!realm.frozen[l.district]);
  const done = (l: Levy): boolean => { const r = p.relations[l.pair]; return !r || r.state !== 'war' || r.since !== l.since; };
  const home = p.levies.filter((l) => l.district === live && done(l));
  if (!home.length) return;
  p.levies = p.levies.filter((l) => !home.includes(l));
  let back = 0, fell = 0;
  for (const l of home) {
    const person = state.people[l.personId];
    if (!person?.tags?.includes(LEVY_TAG)) continue;
    person.townId = l.townId;
    person.tags = person.tags.filter((t) => t !== LEVY_TAG && t !== ON_ROAD_TAG);
    if (deriveRng(state.seed, 'levy-fall', l.personId, l.since).next() < DPOL.levyFallChance && laidToRest(state, l.personId)) fell++;
    else back++;
  }
  const r = p.relations[home[0]!.pair];
  news(state, 'levy_home', { n: String(back), fallen: fell ? 'some' : 'none', other: r ? districtName(state, otherOf(r, live)) : '' });
}

/** One dawn of war for the live district (after the relations tick). */
export function tickLiveWar(state: SimState): void {
  const live = liveId(state);
  const p = ensurePolity(state);
  bringHome(state, live);
  for (const r of liveRelations(state)) {
    if (r.state !== 'war') continue;
    const other = otherOf(r, live);
    if (!p.levies.some((l) => l.district === live && l.pair === pairOf(r.a, r.b) && l.since === r.since)) {
      raiseLevy(state, r, live);
    }
    const seat = worldSeat(state);
    const took = seat ? takeFood(state, seat, DPOL.warFoodPerDay) : 0;
    if (took > 0 && (state.day - r.since) % DPOL.warFoodLineEvery === 2) news(state, 'war_food', { other: districtName(state, other) });
  }
}
