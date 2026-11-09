/**
 * Two ends to walk toward besides industry, trade and war:
 *   feast    lay feast platters from your yard before a whole town: despair falls, everyone's flame rises,
 *            and a vassal that has feasted will not rise against you for a season. (Hearth arc.)
 *   voyage   fly an airship from a sky dock past the edge of the map, three voyages in turn, each needing
 *            rations and charcoal; the third finds the Far Spark. (Sky arc.)
 * Pure + deterministic.
 */
import { addItem } from '../goods/inventory';
import type { SimState } from '../types/runtime';
import { TUNING, VOYAGES, plural } from './data';
import { eatRation, rationsIn } from './lines';
import { addStock, bump, depotAt, hasBuilding, hereOf, news, stockOf, take, townName, worksIfAny, worksOf } from './state';
import type { Result } from './types';
import { statsOf, vehicleById } from './vehicles';

export function feast(state: SimState, townId: string): Result {
  const w = worksOf(state);
  if (!depotAt(state, townId)) return { ok: false, line: 'A feast is laid from your own yard in the town.' };
  if (hereOf(state) !== townId) return { ok: false, line: 'You have to be there to host it.' };
  const n = TUNING.feastPlatters;
  const have = stockOf(state, townId).feast_platter ?? 0;
  if (have < n) return { ok: false, line: `A town feast takes ${n} feast platters. The yard has ${have}.` };
  addStock(state, townId, 'feast_platter', -n);
  const t = state.towns?.[townId];
  if (t) t.despair = Math.max(0, t.despair - TUNING.feastDespair);
  let guests = 0;
  for (const p of Object.values(state.people)) if (p.townId === townId) { p.flame = Math.min(100, p.flame + TUNING.feastFlame); guests++; }
  const v = w.vassals.find((x) => x.townId === townId);
  if (v) v.feastUntil = state.day + 20;
  bump(w, 'feasts');
  if (!w.fedTowns.includes(townId)) w.fedTowns.push(townId);
  return { ok: true, line: `Tables down the middle of ${townName(state, townId)}, and ${plural(guests, 'person')} sit to eat. Somebody starts singing.`, hours: 3 };
}

export type VoyageCheck = { vehicleId?: string; leg: number; short: string[] };
export function voyageCheck(state: SimState, townId: string): VoyageCheck {
  const w = worksIfAny(state);
  const leg = (w?.stats.voyages ?? 0) + 1;
  const ship = (w?.vehicles ?? []).find((v) => v.townId === townId && v.job === 'idle' && statsOf(v).flies);
  const short: string[] = [];
  if (leg > VOYAGES.length) short.push('nowhere further to go');
  if (w?.voyage) short.push('a voyage already in the air');
  if (!hasBuilding(state, townId, 'sky_dock')) short.push('a sky dock in this yard');
  if (!ship) short.push('an airship moored here');
  const r = rationsIn(state, townId);
  if (r < TUNING.voyageRations) short.push(`${TUNING.voyageRations - r} more rations`);
  const c = stockOf(state, townId).charcoal ?? 0;
  if (c < TUNING.voyageFuel) short.push(`${TUNING.voyageFuel - c} more charcoal`);
  return { ...(ship ? { vehicleId: ship.id } : {}), leg, short };
}

export function launch(state: SimState, townId: string): Result {
  const c = voyageCheck(state, townId);
  if (c.short.length) return { ok: false, line: `The voyage needs ${c.short.join(', ')}.` };
  const w = worksOf(state);
  for (let i = 0; i < TUNING.voyageRations; i++) eatRation(state, townId);
  take(state, townId, { charcoal: TUNING.voyageFuel }, false);
  const v = vehicleById(state, c.vehicleId!)!;
  v.job = 'voyage';
  w.voyage = { vehicleId: v.id, leg: c.leg, daysLeft: TUNING.voyageDays * c.leg };
  return { ok: true, line: `${v.name} slips her mooring and climbs, bound for ${VOYAGES[c.leg - 1]!.name}. ${plural(w.voyage.daysLeft, 'day')} out and back.` };
}

export function tickVoyage(state: SimState): void {
  const w = worksIfAny(state);
  const vy = w?.voyage;
  if (!w || !vy) return;
  vy.daysLeft--;
  if (vy.daysLeft > 0) return;
  const v = vehicleById(state, vy.vehicleId);
  const row = VOYAGES[vy.leg - 1]!;
  w.voyage = undefined;
  if (v) v.job = 'idle';
  bump(w, 'voyages');
  addItem(state, 'coin', row.coin);
  news(state, `${v?.name ?? 'The airship'} is home from ${row.name}. ${row.line} (${row.coin} coin in the hold.)`, undefined, v?.townId);
}
