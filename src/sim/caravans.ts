/**
 * M4 packet-02: scheduled caravans. Fills CaravanDawnHook (economy-lod).
 * Spawn on schedule, run outbound + return legs scaled by route condition,
 * freeze on broken routes, deliver cargo into town stock (opt-out towns included).
 * Pure + deterministic: no randomness.
 */

import type { CaravanMobile, CaravanScheduleRow } from './caravans-types';
import { advanceVisit, beginVisit, isHalted } from './caravan-visit';
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
    // A wagon halted at a town finishes its stop (unload, trade, turn around) while the player rests.
    if (isHalted(m)) {
      if (!advanceVisit(state, m, Infinity)) next.push(m);
      continue;
    }
    if (route.broken) {
      next.push(m); // freeze in place until repaired
      continue;
    }
    const daily = (1 / Math.max(1, route.days)) * Math.min(1, Math.max(0, route.condition));
    m.progress01 += Math.max(0, daily - (m.travelCredit ?? 0));
    m.travelCredit = 0;
    if (m.progress01 < 1 - 1e-9) {
      next.push(m);
      continue;
    }
    beginVisit(state, m, m.heading === 'outbound' ? route.toTownId : route.fromTownId, sched.prism);
    if (!advanceVisit(state, m, Infinity)) next.push(m);
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

/**
 * Real-time caravan clock (overworld frames). Wagons roll along their road; on reaching a town they
 * halt, unload into real stock, trade, turn around and set off again, all in game-day fractions.
 * Dawn (tickCaravans) settles whatever is left, so resting never double-charges a day.
 * `stoppedId` is the wagon the player is talking to: it waits.
 */
export function advanceCaravanTravel(state: SimState, deltaDays: number, stoppedId?: string): void {
  ensureEconomyState(state);
  const dt = Math.max(0, deltaDays);
  const schedules = new Map(((state.data as DataTables | undefined)?.caravanSchedules ?? loadCaravanSchedules()).map((s) => [s.id, s]));
  const retired = new Set<string>();
  for (const m of state.caravans ?? []) {
    if (m.id === stoppedId) continue;
    if (isHalted(m)) {
      if (advanceVisit(state, m, dt)) retired.add(m.id);
      continue;
    }
    const r = state.economyRoutes?.find((r) => r.id === m.routeId);
    if (!r || r.broken) continue;
    if (m.progress01 < 1) {
      const daily = Math.min(1, Math.max(0, r.condition)) / Math.max(1, r.days);
      const step = Math.min(dt * daily, 1 - m.progress01);
      m.progress01 += step;
      m.travelCredit = (m.travelCredit ?? 0) + step;
    }
    if (m.progress01 >= 1 - 1e-9) {
      beginVisit(state, m, m.heading === 'outbound' ? r.toTownId : r.fromTownId, schedules.get(m.scheduleId)?.prism);
    }
  }
  if (retired.size) state.caravans = (state.caravans ?? []).filter((m) => !retired.has(m.id));
}
