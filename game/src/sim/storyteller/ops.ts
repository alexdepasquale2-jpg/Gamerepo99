/**
 * What an incident does to the world: each op reaches into a system that already exists (town despair and
 * stock, the food ledger, people's flames, the player's spark and satchel, roads, visitors who stay,
 * district feuds, the happenings table, packs in the wilds). Losses scale with `intensity`; gains do not.
 * Pure + deterministic (the caller's rng).
 */
import { districtName, liveId, relationOf } from '../civic/district-relations';
import { foodCover, foodNeed, takeFood } from '../economy/food-stock';
import { roleFoodItem } from '../economy/town-roles';
import { supplyTown } from '../economy/village-economy';
import { FLAME_MAX } from '../effects';
import { addItem } from '../goods/inventory';
import { burnAt, litShare } from '../happening-world';
import { happeningRows, startHappening } from '../happenings';
import { neighbours } from '../map/districts';
import { pushJuice } from '../packets';
import { activeDistrict, refId } from '../realm';
import type { Rng } from '../rng';
import type { SimState } from '../types/runtime';
import { residentsOf, settleVisitor, spawnVisitor } from '../visitors';
import type { Op, ResolveWhen } from './data';
import type { ActiveIncident } from './state';

export type OpCtx = { townId: string; intensity: number; rng: Rng; active?: ActiveIncident };
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A neighbouring district for an incident that looks over the border (its name fills {other}). */
export function neighbourDistrict(state: SimState, rng: Rng): string | undefined {
  const here = activeDistrict(state);
  const ns = neighbours(here.col, here.row).map(refId).sort();
  return ns.length ? ns[rng.int(0, ns.length)] : undefined;
}

function shuffled<T>(rng: Rng, xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

export function applyOps(state: SimState, ops: readonly Op[], c: OpCtx, other?: string): void {
  const town = state.towns?.[c.townId];
  if (!town) return;
  const here = state.player.townId === c.townId;
  const hurt = (n: number): number => (n < 0 ? n * c.intensity : n);
  for (const op of ops) {
    switch (op.op) {
      case 'despair':
        // Despair scales gently with intensity (its root): a late-game raid is harder to rout, not a death sentence.
        town.despair = clamp(town.despair + (op.add > 0 ? op.add * Math.sqrt(c.intensity) : op.add), 0, 1);
        break;
      case 'food': {
        const need = Math.max(foodNeed(state, c.townId), residentsOf(state, c.townId).length * 0.5, 2);
        if (op.days > 0) supplyTown(state, c.townId, roleFoodItem(state.seed, c.townId), Math.ceil(need * op.days));
        else takeFood(state, c.townId, Math.ceil(need * -hurt(op.days)));
        break;
      }
      case 'stock': {
        const mul = op.mul < 1 ? Math.max(0.2, 1 - (1 - op.mul) * Math.min(1.5, c.intensity)) : op.mul;
        for (const res of Object.keys(town.stock ?? {}).sort()) {
          const have = town.stock[res] ?? 0, next = Math.max(0, Math.round(have * mul));
          if (next < have && c.active) (c.active.taken ??= {})[res] = (c.active.taken[res] ?? 0) + (have - next);
          town.stock[res] = next;
        }
        break;
      }
      case 'restore':
        for (const [res, n] of Object.entries(c.active?.taken ?? {})) town.stock[res] = (town.stock[res] ?? 0) + n;
        if (c.active) delete c.active.taken;
        break;
      case 'flame': {
        const line = burnAt(state);
        const pool = residentsOf(state, c.townId).filter((id) => {
          const f = state.people[id]!.flame;
          return op.pick === 'any' || (op.pick === 'lit' ? f >= line : f < line);
        });
        const n = Math.ceil(pool.length * op.share);
        for (const id of shuffled(c.rng, pool).slice(0, n)) {
          const p = state.people[id]!;
          p.flame = clamp(Math.round(p.flame + hurt(op.add)), 0, FLAME_MAX);
        }
        break;
      }
      case 'spark': {
        if (!here) break;
        const before = state.player.spark;
        // A tale never takes the last of your spark.
        state.player.spark = op.add < 0 ? Math.max(Math.min(before, 1), before + op.add) : before + op.add;
        if (state.player.spark < before) pushJuice(state, 'spark.spend', { amount: before - state.player.spark, reason: 'story' });
        break;
      }
      case 'coin':
        if (here) addItem(state, 'coin', op.add);
        break;
      case 'item':
        if (here) addItem(state, op.id, op.qty);
        break;
      case 'route': {
        const mine = (state.economyRoutes ?? []).filter((r) => r.fromTownId === c.townId || r.toTownId === c.townId).sort((a, b) => a.id.localeCompare(b.id));
        if (op.break) {
          const open = mine.filter((r) => !r.broken);
          // Never the last road out: a town cut off entirely is a different tale.
          if (open.length < 2) break;
          const r = open[c.rng.int(0, open.length)]!;
          r.broken = true;
          r.condition = Math.min(r.condition ?? 1, 0.15);
          pushJuice(state, 'route.break', { routeId: r.id, townId: c.townId });
        } else if (op.mend) {
          const worst = [...mine].sort((a, b) => Number(b.broken) - Number(a.broken) || (a.condition ?? 1) - (b.condition ?? 1))[0];
          if (worst) { worst.broken = false; worst.condition = 1; }
        }
        break;
      }
      case 'settle':
        for (let i = 0; i < op.n; i++) {
          const id = spawnVisitor(state, { kind: 'refugee', source: 'story', reason: 'came in off the road and stayed', townId: c.townId, stayDays: 2, ...(op.flame !== undefined ? { flame: op.flame } : {}) });
          if (id) settleVisitor(state, id, c.townId);
        }
        break;
      case 'feud': {
        if (!other) break;
        const r = relationOf(state, liveId(state), other);
        r.feud = clamp(r.feud + op.add, 0, 100);
        break;
      }
      case 'happening': {
        const ev = happeningRows(state).find((e) => e.id === op.id);
        const running = state.happenings?.active.some((a) => a.eventId === op.id && a.townId === c.townId && a.endsDay > state.day);
        if (ev && !running && residentsOf(state, c.townId).length > 1) startHappening(state, ev, c.townId, c.rng);
        break;
      }
      case 'pressure':
        if (c.active) { c.active.family = op.family; c.active.need = Math.max(1, Math.round(op.need * c.intensity)); c.active.routed = 0; }
        break;
    }
  }
}

/** Does the town stand as an incident's good ending asks? */
export function holds(state: SimState, townId: string, when: ResolveWhen | undefined): boolean {
  if (!when) return false;
  if (when.foodCoverAtLeast !== undefined && !(foodCover(state, townId) >= when.foodCoverAtLeast)) return false;
  if (when.litAtLeast !== undefined && !(litShare(state, townId) >= when.litAtLeast)) return false;
  if (when.despairBelow !== undefined && !((state.towns?.[townId]?.despair ?? 1) < when.despairBelow)) return false;
  return true;
}

export const otherName = (state: SimState, id: string | undefined): string => (id ? districtName(state, id) : 'the next land');
