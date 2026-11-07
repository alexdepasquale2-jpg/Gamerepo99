/**
 * M4 packet-02: scheduled caravans. Fills CaravanDawnHook (economy-lod).
 * Spawn on schedule, run outbound + return legs scaled by route condition,
 * freeze on broken routes, deliver cargo into town stock (opt-out towns included).
 * Pure + deterministic: no randomness.
 */

import type { CaravanMobile, CaravanScheduleRow } from './caravans-types';
import { ensureEconomyState } from './economy/economy-lod';
import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import type { SimState } from './types/runtime';
import scheduleJson from '../data/world/caravan-schedules.json';

export const DEFAULT_MAX_CONCURRENT = 2;

export function loadCaravanSchedules(): CaravanScheduleRow[] {
  return (scheduleJson.schedules as CaravanScheduleRow[]).map((s) => ({
    ...s,
    maxConcurrent: s.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
  }));
}

function deliver(state: SimState, townId: string, m: CaravanMobile, prism?: string): void {
  const town = state.towns?.[townId];
  if (town) town.stock[m.cargoResourceId] = (town.stock[m.cargoResourceId] ?? 0) + m.qty;
  const payload = { townId, routeId: m.routeId, resourceId: m.cargoResourceId, qty: m.qty };
  if (prism) pushJuice(state, prism, payload);
  pushJuice(state, (state.data as DataTables).economyLod.juice.deliver, payload);
}

/** One dawn of caravans. Returns live mobiles after the tick. */
export function tickCaravans(state: SimState, dawnIndex: number): CaravanMobile[] {
  ensureEconomyState(state);
  const data = state.data as DataTables | undefined;
  const routes = new Map((state.economyRoutes ?? []).map((r) => [r.id, r]));
  const schedules = data?.caravanSchedules ?? loadCaravanSchedules();
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const live = (state.caravans ??= []);
  const seen = (state.routeBreakJuiced ??= {});

  // Break edge: juice once per false->true transition; repair clears the latch.
  for (const r of routes.values()) {
    if (r.broken && !seen[r.id]) {
      seen[r.id] = true;
      pushJuice(state, data?.economyLod.juice.routeBreak ?? 'route.break', { routeId: r.id });
    } else if (!r.broken && seen[r.id]) seen[r.id] = false;
  }

  const next: CaravanMobile[] = [];
  for (const m of live) {
    const route = routes.get(m.routeId);
    const sched = byId.get(m.scheduleId);
    if (!route || !sched) continue;
    if (route.broken) {
      next.push(m); // freeze in place until repaired
      continue;
    }
    m.progress01 += (1 / Math.max(1, route.days)) * Math.min(1, Math.max(0, route.condition));
    if (m.progress01 < 1 - 1e-9) {
      next.push(m);
      continue;
    }
    if (m.heading === 'outbound') {
      deliver(state, route.toTownId, m, sched.prism);
      m.heading = 'return';
      m.progress01 = 0;
      next.push(m);
    } else {
      deliver(state, route.fromTownId, m, sched.prism);
    }
  }

  for (const s of schedules) {
    const route = routes.get(s.routeId);
    if (!route || route.broken || dawnIndex % s.periodDays !== s.departDawnMod) continue;
    if (next.filter((m) => m.scheduleId === s.id).length >= (s.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)) continue;
    next.push({
      id: `${s.id}@${dawnIndex}`,
      scheduleId: s.id,
      routeId: s.routeId,
      progress01: 0,
      heading: 'outbound',
      cargoResourceId: s.cargoResourceId,
      qty: s.qty,
      dawnSpawned: dawnIndex,
    });
    if (s.prism) pushJuice(state, s.prism, { routeId: s.routeId, scheduleId: s.id });
  }
  state.caravans = next;
  return next;
}
