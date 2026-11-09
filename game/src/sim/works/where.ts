/**
 * Where the Works stands in the world, for the actors area to draw: convoys on the road (a road position
 * per leg, eased between dawns like the village carts), vehicles parked in their yards, and the war band:
 * a column on the road while it marches, or a camp in the town it holds. Soldiers away from their own
 * town with the band are not in its streets (awayWithBand). Pure: no Phaser/DOM.
 */
import { positionOnLegs, type RoadPosition } from '../road-journey';
import type { SimState } from '../types/runtime';
import { DESIGN_BY_ID } from './data';
import { worksIfAny } from './state';
import type { Stock } from './types';

export type ConvoyView = { id: string; vehicleId: string; design: string; name: string; at: RoadPosition; load: Stock; dir: 'out' | 'back'; to: string; flies: boolean };
export type ParkedView = { vehicleId: string; design: string; name: string; townId: string; index: number; flies: boolean };
export type BandView = {
  soldiers: string[];
  vehicles: { id: string; design: string; name: string }[];
  /** On the road: where the head of the column is, and the town it marches on. */
  march?: { at: RoadPosition; target: string; hostile: boolean };
  /** In camp: the town. */
  townId?: string;
};

const flies = (design: string): boolean => !!DESIGN_BY_ID.get(design)?.flies;

/** A position along a road chain after this share (0..1) of it. */
function along(legs: { routeId: string; from: string; to: string; days: number }[], share: number): RoadPosition | undefined {
  const total = legs.reduce((n, l) => n + l.days, 0);
  return positionOnLegs(legs, Math.max(0, Math.min(1, share)) * total);
}

export function convoysOnRoad(state: SimState): ConvoyView[] {
  const w = worksIfAny(state);
  const out: ConvoyView[] = [];
  for (const r of w?.routes ?? []) {
    const leg = r.leg;
    const v = w!.vehicles.find((x) => x.id === r.vehicleId);
    if (!leg?.legs?.length || !v) continue;
    const days = Math.max(1, leg.days ?? leg.daysLeft);
    const at = along(leg.legs, (days - leg.daysLeft) / days);
    if (at) out.push({ id: r.id, vehicleId: v.id, design: v.design, name: v.name, at, load: leg.load, dir: leg.dir, to: leg.dir === 'out' ? r.to : r.from, flies: flies(v.design) });
  }
  return out;
}

/** Vehicles standing in a yard: idle ones, and convoy vehicles waiting to load at dawn. */
export function parkedVehicles(state: SimState): ParkedView[] {
  const w = worksIfAny(state);
  const seen = new Map<string, number>();
  const out: ParkedView[] = [];
  for (const v of w?.vehicles ?? []) {
    if (v.job === 'voyage' || v.job === 'band') continue;
    if (v.job === 'convoy' && w!.routes.some((r) => r.vehicleId === v.id && r.leg)) continue;
    const index = seen.get(v.townId) ?? 0;
    seen.set(v.townId, index + 1);
    out.push({ vehicleId: v.id, design: v.design, name: v.name, townId: v.townId, index, flies: flies(v.design) });
  }
  return out;
}

export function bandView(state: SimState): BandView | null {
  const w = worksIfAny(state);
  const b = w?.band;
  if (!b || (!b.soldiers.length && !b.vehicles.length)) return null;
  const vehicles = b.vehicles.map((id) => w!.vehicles.find((v) => v.id === id)).filter((v) => !!v).map((v) => ({ id: v!.id, design: v!.design, name: v!.name }));
  const m = b.march;
  if (m?.legs?.length) {
    const days = Math.max(1, m.days ?? m.daysLeft);
    const at = along(m.legs, (days - m.daysLeft) / days);
    const hostile = !w!.depots[m.target] && !w!.vassals.some((x) => x.townId === m.target);
    if (at) return { soldiers: b.soldiers, vehicles, march: { at, target: m.target, hostile } };
  }
  return { soldiers: b.soldiers, vehicles, townId: b.townId };
}

/** True for a soldier who is out of their own town with the band (on the march, or holding another town). */
export function awayWithBand(state: SimState, personId: string): boolean {
  const b = worksIfAny(state)?.band;
  if (!b?.soldiers.includes(personId)) return false;
  return !!b.march || state.people[personId]?.townId !== b.townId;
}
