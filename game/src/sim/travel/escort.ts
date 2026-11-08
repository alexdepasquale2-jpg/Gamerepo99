/**
 * Escort a cart (G5): walk beside a village cart (sim/economy/logistics) from wherever it is on the road to
 * the town it is bound for. Every day is a real world day (opts.runDay: the dawn pipeline moves the cart and
 * rolls its hazard, cut by `escortedBy`); the road gives you its +2 spark a day and rolls its encounters as
 * on any journey (sim/travel/journey helpers), with help hired at a waystation on the cart's road. A cart
 * that comes in whole earns the carter's thanks and lifts the town a little. Pure sim: no Phaser/DOM.
 */
import { cartPosition, tickLogistics } from '../economy/logistics';
import { noteRoadNews } from '../economy/roads';
import { takeRoadHelp } from '../economy/waystations';
import { addItem, itemName } from '../goods/inventory';
import { pushJuice } from '../packets';
import { deriveRng } from '../rng';
import { applyEffects, isQuiet, rollEncounter, tableFor, type JourneyOpts, type JourneyResult } from './journey';
import { clamp01 } from './road-trades';
import { loadEncounterTables } from './travel-tables';
import type { TravelSimState } from './travel-types';

export const ESCORT = {
  /** The carter's thanks, and the lift of a day's work that mattered. */
  thanksCoin: 2,
  sparkLift: 3,
  townDespairRelief: 0.02,
};

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Walk beside the cart to its town. Fails (nothing changes) when the cart is gone. */
export function runEscort(state: TravelSimState, cartId: string, opts: JourneyOpts = {}): JourneyResult {
  const startDay = state.day;
  const log = state.logistics;
  const cart = log?.carts.find((c) => c.id === cartId);
  const at = cart && cartPosition(cart);
  if (!log || !cart || !at) {
    return { ok: false, reason: 'not_on_offer', routeId: '', days: 0, startDay, endDay: startDay, paidSpark: 0, paidCoin: 0, encounters: [], lines: [] };
  }
  const name = (id: string): string => opts.nameOf?.(id) ?? id;
  const from = state.player.townId ?? cart.fromTownId;
  const to = cart.toTownId;
  const sparkMax = typeof state.player.sparkMax === 'number' ? state.player.sparkMax : 100;
  const rng = deriveRng(state.seed, 'escort', startDay, cartId);
  const tables = state.encounterTables ?? loadEncounterTables();
  const help = takeRoadHelp(state, at.routeId);
  const encounters: JourneyResult['encounters'] = [];
  const what = `${cart.qty} ${itemName(cart.itemId).toLowerCase()}`;
  cart.escortedBy = 'player';

  let days = 0;
  let cooldown = 0;
  let lostOn: number | undefined;
  // A cart is never more than its road days out; a little slack for a road that broke under it.
  const most = cart.daysLeft + 4;
  while (log.carts.includes(cart) && days < most) {
    const routeId = cartPosition(cart)?.routeId ?? at.routeId;
    const before = state.player.spark;
    const deliveredBefore = log.delivered;
    if (opts.runDay) opts.runDay(state);
    else { state.day += 1; tickLogistics(state); }
    days += 1;
    state.player.spark = Math.min(sparkMax, Math.min(state.player.spark, before) + 2);
    pushJuice(state, 'route.travel_step', { routeId, step: days, daysEff: cart.roadDays, day: state.day, escort: cartId });
    if (!log.carts.includes(cart)) {
      // Gone from the road: delivered (its request filled), or lost to the road.
      const req = log.requests.find((r) => r.id === cart.requestId);
      if (req ? req.status !== 'filled' : log.delivered === deliveredBefore) lostOn = state.day;
      break;
    }

    const route = (state.routes ?? []).find((r) => r.id === routeId);
    if (!route) continue;
    const cond = clamp01(state.economyRoutes?.find((x) => x.id === routeId)?.condition ?? 1);
    const entry = rollEncounter(state, tableFor(route, tables), rng, { route, cond, cooldown: cooldown > 0, escortMul: help.escortMul, reroll: help.reroll });
    if (cooldown > 0) cooldown -= 1;
    if (!entry) continue;
    const quiet = isQuiet(entry);
    if (!quiet) cooldown = 1;
    applyEffects(state, entry, route, cart.fromTownId, to, sparkMax);
    encounters.push({ day: state.day, id: entry.id, quiet, blurb: entry.blurb });
    pushJuice(state, 'encounter.spawn', { routeId, encounterId: entry.id, blurb: entry.blurb, prism: entry.prism, quiet, townId: to, line: entry.heard });
  }

  const lines: string[] = [];
  if (lostOn !== undefined) {
    lines.push(`Day ${lostOn}: the road took the cart for all your watching. You walked the rest to ${name(to)} with nothing to show.`);
  } else {
    lines.push(`${plural(days, 'day')} beside the cart to ${name(to)}. The load came in whole: ${what}.`);
    addItem(state, 'coin', ESCORT.thanksCoin);
    state.player.spark = Math.min(sparkMax, state.player.spark + ESCORT.sparkLift);
    const town = state.towns?.[to];
    if (town) town.despair = clamp01(town.despair - ESCORT.townDespairRelief);
    lines.push(`The carter presses ${ESCORT.thanksCoin} coin on you. Your spark steadies: that mattered.`);
    // The last leg ends at the cart's town: its far end is where the cart came in from.
    noteRoadNews(state, { routeId: cart.legs[cart.legs.length - 1]?.routeId ?? at.routeId, kind: 'escort', by: 'player', townId: to });
  }
  for (const e of encounters.filter((x) => !x.quiet && x.blurb)) lines.push(`Day ${e.day}: ${e.blurb}`);
  lines.push(...help.lines);
  if (log.carts.includes(cart) && cart.escortedBy === 'player') delete cart.escortedBy;
  state.player.townId = to;
  return {
    ok: true, routeId: at.routeId, fromId: from, toId: to, days, startDay, endDay: state.day,
    paidSpark: 0, paidCoin: 0, encounters, lines,
  };
}
