/**
 * Fast roads (travel-trades.json fastRouteUnlocks): a road walks shorter once you are close to someone
 * who knows it (their bond with you, counted from the legacy bond ledger, reaches minBond). The friend
 * shows the way: the road menu names them, and every walk of that road takes daysMul of the days.
 * Pure + deterministic; reads state.legacy directly so travel.ts needs no legacy import.
 */
import tradesJson from '../../data/economy/travel-trades.json';
import { noteUse } from '../data-use-civic';
import type { TravelRoute, TravelSimState } from './travel-types';

type Unlock = { id: string; routeId: string; when: { minBondWithAny: string[]; minBond: number }; daysMul: number };
const UNLOCKS = ((tradesJson as { fastRouteUnlocks?: Unlock[] }).fastRouteUnlocks ?? []);

/** A person's bond with you: every bond event they hold in the ledger (talks that lifted them, reignites ...). */
function bondOf(state: TravelSimState, personId: string): number {
  const b = (state as { legacy?: { bonds?: Record<string, { events?: Record<string, number> }> } }).legacy?.bonds?.[personId];
  return Object.values(b?.events ?? {}).reduce((n, k) => n + k, 0);
}

/** The unlock that shortens this road for you now, with the friend who shows the way. */
export function fastRoad(state: TravelSimState, route: Pick<TravelRoute, 'id'>): { unlock: Unlock; friend: string } | undefined {
  for (const u of UNLOCKS) {
    if (u.routeId !== route.id) continue;
    const friend = u.when.minBondWithAny.find((p) => !!state.people?.[p] && bondOf(state, p) >= u.when.minBond);
    if (friend) return { unlock: u, friend };
  }
  return undefined;
}

/** Days multiplier for a road (1 unless a friend shows the shorter way). */
export function fastRoadMul(state: TravelSimState, route: Pick<TravelRoute, 'id'>): number {
  const hit = fastRoad(state, route);
  if (!hit) return 1;
  noteUse('economy/travel-trades', `unlock:${hit.unlock.id}`);
  return hit.unlock.daysMul;
}
