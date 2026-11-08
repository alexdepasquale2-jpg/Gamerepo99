/**
 * Waystations and roadside inns (G8). Every road without a waystation of its own gets a roadside inn, a
 * facility of kind 'waystation' placed beside the road like the others (seeded, never saved), with a hostler
 * dealt from the road's towns. At a waystation you can:
 *   rest       a bed for the night (a coin; the hayloft if you have none), a little spark on top of the night
 *   hear talk  once a day: what came down the road (your letters and replies, happenings in the towns, carts,
 *              the state of the roads, the old stories), from the hostler's own mouth
 *   hire help  a guide (guide_local) or a watch (escort_watch) from travel-trades.json for your next road
 *              along this one; a watch also guards the carts on it for a few days
 * A journey can stop the night at a waystation partway (sim/travel/journey: opts.stopAt). Pure + deterministic.
 */
import { addItem, inventoryOf, itemName } from '../goods/inventory';
import { happeningLine, happeningTownName } from '../happenings';
import { noteCoinSpend } from '../hoard/events';
import { gistOf } from '../history-voice';
import type { LayoutRoute, WorldLayout } from '../map/world-layout';
import { namePool } from '../names';
import { deriveRng } from '../rng';
import { loadTravelTrades, roadVoice, tradePrice, tradeTrust } from '../travel/road-trades';
import type { TravelSimState } from '../travel/travel-types';
import type { SimState } from '../types/runtime';
import { besideRoad, facilityById, facilityPlaces, type FacilityPlace } from './facilities';
import { cartPosition } from './logistics';
import { guardCarts, roadWord, roadwayOf, type RoadHelp } from './roads';

export const INNS = {
  restCoin: 1,
  /** Spark on top of the night for a bed; the hayloft gives less. */
  bedSpark: 3,
  loftSpark: 1,
  /** A night at a waystation on a journey: this instead of the road's +2. */
  stopSpark: 5,
  watchDays: 4,
  helpDays: 3,
  hireTrades: ['guide_local', 'escort_watch'] as const,
};
export type HireTrade = (typeof INNS.hireTrades)[number];

const INN_NAMES = [
  'The Halfway House', "The Drover's Rest", 'The Milestone', 'The Lantern', 'The Wayfarer', 'The Crossed Keys',
  "The Carter's Arms", 'The Ember', 'The Oak and Ox', 'The Last Lamp', 'The Mended Wheel', 'The Ford House',
];

/** A roadside inn on every road that has no waystation yet (beside the road, a third of the way along). */
export function placeRoadsideInns(layout: WorldLayout, seed: number, placed: FacilityPlace[]): FacilityPlace[] {
  const used = new Set(placed.map((p) => p.name));
  const out: FacilityPlace[] = [];
  for (const route of layout.routes as LayoutRoute[]) {
    if (placed.some((p) => p.routeId === route.id && p.kind === 'waystation')) continue;
    const id = `inn_${route.id}`;
    const rng = deriveRng(seed, 'roadside-inn', route.id);
    const progress = rng.next() < 0.5 ? 0.32 : 0.68;
    const start = Math.floor(rng.next() * INN_NAMES.length);
    let name = INN_NAMES.map((_, i) => INN_NAMES[(start + i) % INN_NAMES.length]!).find((n) => !used.has(n));
    name ??= `${INN_NAMES[start]} ${used.size + 1}`;
    used.add(name);
    out.push({
      id, townId: null, routeId: route.id, staffedMul: 1, outputs: [], inputs: [],
      name, kind: 'waystation', workTags: ['meaning'], prism: 'facility.work.waystation',
      townIds: [route.from, route.to], ...besideRoad(seed, route, progress, id),
    });
  }
  return out;
}

export const isWaystation = (state: SimState, facilityId: string): FacilityPlace | undefined => {
  const p = facilityById(state, facilityId);
  return p?.kind === 'waystation' ? p : undefined;
};

/** Waystations on a road, in a stable order. */
export const waystationsOn = (state: SimState, routeId: string): FacilityPlace[] =>
  facilityPlaces(state).filter((p) => p.kind === 'waystation' && p.routeId === routeId).sort((a, b) => a.id.localeCompare(b.id));

/** The hostler's first name (the first of the crew), or a stand-in. */
export function hostName(state: SimState, place: FacilityPlace): { id?: string; name: string } {
  const id = state.facilityStaff?.[place.id]?.crew.find((c) => !!c && !!state.people[c]) ?? undefined;
  const name = id ? state.people[id]?.name?.split(' ')[0] : undefined;
  return name ? { id, name } : { name: 'The hostler' };
}

const coinOf = (state: SimState): number => Math.max(0, inventoryOf(state).coin ?? 0);
const town = (id: string): string => happeningTownName(id);
const say = (who: string, how: string, line: string): string => `${who} ${how}: “${line}”`;

/** A bed for the night. The scene then plays the night (the 'rest' verb), as at a hearth. */
export function restAtInn(state: SimState, facilityId: string): { ok: boolean; line: string } {
  const place = isWaystation(state, facilityId);
  if (!place) return { ok: false, line: 'There is no bed to be had here.' };
  const host = hostName(state, place).name;
  const max = typeof state.player.sparkMax === 'number' ? state.player.sparkMax : 100;
  roadwayOf(state).rested = { day: state.day, facilityId };
  if (coinOf(state) >= INNS.restCoin) {
    addItem(state, 'coin', -INNS.restCoin);
    noteCoinSpend(state, INNS.restCoin);
    state.player.spark = Math.min(max, state.player.spark + INNS.bedSpark);
    return { ok: true, line: `${host} takes your coin and shows you to a bed above the stable at ${place.name}. A fire, a blanket, a door that shuts.` };
  }
  state.player.spark = Math.min(max, state.player.spark + INNS.loftSpark);
  return { ok: true, line: `No coin? ${host} points you up the ladder to the hayloft. It is dry, at least.` };
}

/** Everything the talk at this waystation could be about today, most pressing first. */
export function rumoursAt(state: SimState, place: FacilityPlace): string[] {
  const out: string[] = [];
  const onRoad = (legs?: { routeId: string }[]) => !!legs?.some((l) => l.routeId === place.routeId);
  const ls = state.letters;
  for (const f of ls?.flight ?? []) {
    if (f.fromPersonId !== state.player.id || !onRoad(f.legs)) continue;
    const who = state.people[f.toPersonId]?.name?.split(' ')[0] ?? 'someone';
    out.push(`A courier came through with a letter of yours for ${who}, bound for ${town(f.toTownId)}. ${f.days} dawn${f.days === 1 ? '' : 's'} out, yet.`);
  }
  for (const r of ls?.replies ?? []) {
    if (r.status !== 'travelling' || !onRoad(r.legs)) continue;
    const who = state.people[r.fromPersonId]?.name?.split(' ')[0] ?? 'someone';
    out.push(`There is a rider on this road with a letter for you, from ${who} in ${town(r.fromTownId)}.`);
  }
  for (const a of state.happenings?.active ?? []) {
    if (a.endsDay <= state.day) continue;
    const news = happeningLine(state, a, 'news');
    if (news) out.push(place.townIds.includes(a.townId) ? news : `Travellers from ${town(a.townId)} say it: ${news}`);
  }
  for (const c of state.logistics?.carts ?? []) {
    if (cartPosition(c)?.routeId !== place.routeId) continue;
    out.push(`A cart of ${c.qty} ${itemName(c.itemId).toLowerCase()} went by for ${town(c.toTownId)}${c.escortedBy ? ', with someone walking beside it' : ''}.`);
  }
  for (const r of state.economyRoutes ?? []) {
    const near = place.townIds.includes(r.fromTownId) || place.townIds.includes(r.toTownId);
    if (!near) continue;
    const w = roadWord(r);
    if (r.id === place.routeId) { if (w !== 'good') out.push(`This road? It is ${w}.${w === 'fair' ? '' : ' Stone and timber would do it good.'}`); }
    else if (w === 'broken' || w === 'failing') out.push(`The road between ${town(r.fromTownId)} and ${town(r.toTownId)} is ${w}, they say. Carters are going round.`);
  }
  const history = state.history ?? [];
  if (history.length) {
    const beat = history[deriveRng(state.seed, 'inn-history', place.id, state.day).int(0, history.length)]!;
    out.push(`Old drovers through here still talk of ${gistOf(beat)}.`);
  }
  if (!out.length) out.push('Nothing much. Weather, and the price of oats.');
  return out;
}

/** Hear the talk (once a day at each waystation): one piece of news from the hostler. */
export function hearTalk(state: SimState, facilityId: string): { ok: boolean; line: string } {
  const place = isWaystation(state, facilityId);
  if (!place) return { ok: false, line: 'Nobody here to talk to.' };
  const host = hostName(state, place).name;
  const heard = (roadwayOf(state).heard ??= {});
  const h = heard[facilityId];
  if (h?.day === state.day) return { ok: false, line: `${host} has told you all they know today. Come back tomorrow.` };
  const all = rumoursAt(state, place);
  const n = h?.n ?? 0;
  heard[facilityId] = { day: state.day, n: n + 1 };
  return { ok: true, line: say(host, 'leans on the counter', all[n % all.length]!) };
}

/** Today's price for hiring a trade at this waystation (coin only: they are not travelling with you to sell). */
export function hirePrice(state: SimState, place: FacilityPlace, tradeId: HireTrade): number | null {
  const trade = loadTravelTrades().find((t) => t.id === tradeId);
  const route = (state as TravelSimState).routes?.find((r) => r.id === place.routeId);
  if (!trade || !route) return null;
  return Math.max(1, tradePrice(trade, tradeTrust(state as TravelSimState, trade, route), 1).coin);
}

export const hiredOn = (state: SimState, routeId: string, tradeId: string): RoadHelp | undefined =>
  state.roadway?.help?.find((h) => h.routeId === routeId && h.tradeId === tradeId);

/** Hire a guide or a watch for your next road along this one. A watch guards the road's carts too. */
export function hireHelp(state: SimState, facilityId: string, tradeId: HireTrade): { ok: boolean; line: string } {
  const place = isWaystation(state, facilityId);
  if (!place) return { ok: false, line: 'Nobody here for hire.' };
  const price = hirePrice(state, place, tradeId);
  if (price === null) return { ok: false, line: 'Nobody here for hire today.' };
  const role = roadVoice().roles[tradeId === 'guide_local' ? 'guide' : 'escort'] ?? 'help';
  if (hiredOn(state, place.routeId, tradeId)) return { ok: false, line: `You have ${role} waiting already.` };
  if (coinOf(state) < price) return { ok: false, line: `${role[0]!.toUpperCase()}${role.slice(1)} wants ${price} coin. You have ${coinOf(state)}.` };
  addItem(state, 'coin', -price);
  noteCoinSpend(state, price);
  const rng = deriveRng(state.seed, 'inn-hire', state.day, facilityId, tradeId);
  const GIVEN = namePool(state, place.townIds).given; // a road into a district hires its culture's names
  const name = GIVEN[Math.floor(rng.next() * GIVEN.length)]!;
  const rw = roadwayOf(state);
  (rw.help ??= []).push({ tradeId, name, routeId: place.routeId, day: state.day, facilityId });
  const [a, b] = place.townIds.map(town);
  if (tradeId === 'escort_watch') {
    (rw.watches ??= {})[place.routeId] = { name, until: state.day + INNS.watchDays };
    guardCarts(state);
    return { ok: true, line: `${name} takes ${price} coin and a lantern. The carts between ${a} and ${b} go guarded for ${INNS.watchDays} days, and ${name} will walk your next road along it.` };
  }
  return { ok: true, line: `${name} takes ${price} coin. "I know every rut between ${a} and ${b}. Next time you take this road, I'm with you."` };
}

/**
 * Help waiting for a journey on this road (used up by it): a watch thins out the highwaymen, a guide steers
 * you once away from trouble. `lines` say who came along.
 */
export function takeRoadHelp(state: SimState, routeId: string): { escortMul: number; reroll: boolean; lines: string[] } {
  const rw = state.roadway;
  const help = (rw?.help ?? []).filter((h) => h.routeId === routeId && state.day - h.day <= INNS.helpDays);
  if (!rw || !help.length) return { escortMul: 1, reroll: false, lines: [] };
  rw.help = (rw.help ?? []).filter((h) => !help.includes(h));
  const trades = loadTravelTrades();
  let escortMul = 1, reroll = false;
  const lines: string[] = [];
  for (const h of help) {
    const t = trades.find((x) => x.id === h.tradeId);
    if (t?.highwaymanWeightMul !== undefined) escortMul = Math.min(escortMul, t.highwaymanWeightMul);
    if (t?.encounterRerollBad) reroll = true;
    const where = facilityById(state, h.facilityId)?.name ?? 'the waystation';
    lines.push(`${h.name}, hired at ${where}, walked the road with you.`);
  }
  return { escortMul, reroll, lines };
}

/**
 * A night at a waystation partway down a journey: costs the bed, gives a proper night (`spark` in place of
 * the road's +2), keeps the night safe, and you hear the talk. Null when there is no such waystation.
 */
export function innStop(state: SimState, routeId: string, facilityId: string): { spark: number; line: string } | null {
  const place = isWaystation(state, facilityId);
  if (!place || place.routeId !== routeId) return null;
  const paid = coinOf(state) >= INNS.restCoin;
  if (paid) { addItem(state, 'coin', -INNS.restCoin); noteCoinSpend(state, INNS.restCoin); }
  const all = rumoursAt(state, place);
  const talk = all[deriveRng(state.seed, 'inn-stop', state.day, facilityId).int(0, all.length)]!;
  const host = hostName(state, place).name;
  roadwayOf(state).rested = { day: state.day, facilityId };
  return {
    spark: paid ? INNS.stopSpark : INNS.loftSpark + 2,
    line: `You stopped the night at ${place.name}${paid ? '' : ', in the hayloft'}. ${say(host, 'said over supper', talk)}`,
  };
}
