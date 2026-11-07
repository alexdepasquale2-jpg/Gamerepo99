/**
 * Road distance for carried mail: shortest chain of economy routes between two towns, in whole
 * days. Pure and deterministic (ties broken by route id). A courier's position is derived from
 * elapsed days along the chain, so mail is always somewhere on a real road.
 */

import type { SimState } from './types/runtime';

export type RoadLeg = { routeId: string; from: string; to: string; days: number };
export type RoadJourney = { legs: RoadLeg[]; days: number };
export type RoadPosition = { routeId: string; from: string; to: string; f: number };

/** Days a courier needs for one road: poor repair slows it, a broken road is a slog on foot. */
export function legDays(route: { days: number; condition: number; broken: boolean }): number {
  const repair = Math.min(1, Math.max(0.5, route.condition));
  return Math.max(1, Math.ceil(Math.max(1, route.days) / repair)) * (route.broken ? 2 : 1);
}

/** Cheapest road chain from `from` to `to`, or null when the towns are not joined by any road. */
export function planRoad(state: SimState, from: string, to: string): RoadJourney | null {
  if (from === to) return { legs: [], days: 0 };
  const routes = [...(state.economyRoutes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const best = new Map<string, number>([[from, 0]]);
  const via = new Map<string, RoadLeg>();
  const done = new Set<string>();
  for (;;) {
    let at: string | undefined;
    for (const [id, d] of best) if (!done.has(id) && (at === undefined || d < best.get(at)! || (d === best.get(at) && id < at))) at = id;
    if (at === undefined || at === to) break;
    done.add(at);
    for (const r of routes) {
      const other = r.fromTownId === at ? r.toTownId : r.toTownId === at ? r.fromTownId : undefined;
      if (!other || done.has(other)) continue;
      const days = legDays(r);
      const total = best.get(at)! + days;
      if (total < (best.get(other) ?? Infinity)) {
        best.set(other, total);
        via.set(other, { routeId: r.id, from: at, to: other, days });
      }
    }
  }
  if (!best.has(to)) return null;
  const legs: RoadLeg[] = [];
  for (let at = to; at !== from; ) {
    const leg = via.get(at)!;
    legs.unshift(leg);
    at = leg.from;
  }
  return { legs, days: best.get(to)! };
}

/** The same chain walked backwards (for a reply riding home). */
export function reverseLegs(legs: RoadLeg[]): RoadLeg[] {
  return [...legs].reverse().map((l) => ({ routeId: l.routeId, from: l.to, to: l.from, days: l.days }));
}

/** Where a courier is after `elapsed` days on `legs`; f runs 0..1 from leg.from to leg.to. */
export function positionOnLegs(legs: RoadLeg[], elapsed: number): RoadPosition | undefined {
  if (!legs.length) return undefined;
  let left = Math.max(0, elapsed);
  for (const l of legs) {
    if (left < l.days) return { routeId: l.routeId, from: l.from, to: l.to, f: left / l.days };
    left -= l.days;
  }
  const last = legs[legs.length - 1]!;
  return { routeId: last.routeId, from: last.from, to: last.to, f: 1 };
}
