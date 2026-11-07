/**
 * M4 Task C: doctrine legitimacy, collapse cascade and competition.
 * Real delivery is tracked apart from perceived delivery; legitimacy follows belief,
 * propaganda widens the gap, exposure triggers collapse. Pure + deterministic (no RNG needed:
 * ids are iterated in sorted order). Never touches player spark.
 */

import type { DataTables } from './load-data';
import { pushJuice } from './packets';
import type { SimState } from './types/runtime';
import type { DoctrineSupplyHook } from './economy/economy-lod-types';

export type DoctrineMeters = {
  realDelivery: number;
  perceivedDelivery: number;
  propaganda: number;
  control: number;
  exposure: number;
  legitimacy: number;
};

export type DoctrineState = DoctrineMeters & { id: string; townId: string; collapsed?: boolean };

const GAP_MIN = 0.25;
const EXPOSURE_MIN = 0.4;
const COLLAPSE_BELOW = 0.15;
const DESPAIR_ON_COLLAPSE = 0.05;
const CASCADE_EXPOSURE = 0.05;
const STEAL = 0.02;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** formulas.legitimacy */
export function legitimacyOf(m: Pick<DoctrineMeters, 'perceivedDelivery' | 'control'>): number {
  return clamp01(0.15 + 0.7 * m.perceivedDelivery + 0.15 * m.control);
}

/** formulas.collapse */
export function applyCollapse(
  m: Pick<DoctrineMeters, 'perceivedDelivery' | 'realDelivery' | 'exposure' | 'legitimacy'>,
): number {
  const gap = Math.abs(m.perceivedDelivery - m.realDelivery);
  return gap > GAP_MIN && m.exposure > EXPOSURE_MIN ? m.legitimacy * (1 - 2.5 * gap * gap) : m.legitimacy;
}

type DoctrineRow = { id: string; townId: string; start: DoctrineMeters };

/** Lazily seed SimState.doctrines from doctrines.json (idempotent). */
export function ensureDoctrines(state: SimState): Record<string, DoctrineState> {
  if (state.doctrines) return state.doctrines;
  const rows = ((state.data as DataTables | undefined)?.doctrines as { doctrines?: DoctrineRow[] } | undefined)
    ?.doctrines;
  const out: Record<string, DoctrineState> = {};
  for (const r of rows ?? []) out[r.id] = { id: r.id, townId: r.townId, ...r.start };
  return (state.doctrines = out);
}

/** Broken supply erodes what a town's doctrines actually deliver; belief is untouched. */
export const doctrineSupplyHook: DoctrineSupplyHook = (state, { townId, deltaRealDelivery }) => {
  if (!(deltaRealDelivery > 0)) return;
  for (const d of Object.values(ensureDoctrines(state))) {
    if (d.townId === townId && !d.collapsed) d.realDelivery = clamp01(d.realDelivery - deltaRealDelivery);
  }
};

type ActRow = { id: string; requiresTargetTagsAny?: string[]; effects?: { target: string; op: string; value: number }[] };

/** Apply a doctrines.json act (by id) to the doctrine held in the target person's town. */
export function applyDoctrineAct(state: SimState, actId: string, personId: string): string | undefined {
  const act = ((state.data as DataTables | undefined)?.doctrines as { acts?: ActRow[] } | undefined)?.acts?.find(
    (a) => a.id === actId,
  );
  const person = state.people[personId];
  const townId = person?.townId;
  if (!act || !townId) return undefined;
  const need = act.requiresTargetTagsAny;
  if (need?.length && !need.some((t) => person.tags?.includes(t))) return undefined;
  const all = ensureDoctrines(state);
  const rows = ((state.data as DataTables | undefined)?.doctrines as { doctrines?: { id: string; leaderPersonId?: string }[] } | undefined)?.doctrines ?? [];
  const live = Object.keys(all).sort().filter((k) => all[k]!.townId === townId && !all[k]!.collapsed);
  const id = live.find((k) => rows.find((r) => r.id === k)?.leaderPersonId === personId) ?? live[0];
  if (!id) return undefined;
  const d = all[id]!;
  for (const e of act.effects ?? []) {
    const m = e.target.startsWith('doctrine.') ? e.target.slice(9) : '';
    if (e.op === 'add' && m in d && typeof (d as Record<string, unknown>)[m] === 'number') {
      (d as unknown as Record<string, number>)[m] = clamp01((d as unknown as Record<string, number>)[m]! + e.value);
    }
  }
  if (act.effects?.some((e) => e.target === 'doctrine.exposure')) {
    pushJuice(state, 'doctrine.exposed', { doctrineId: id, townId, personId, exposure: d.exposure });
  }
  return id;
}

function linked(state: SimState, a: string, b: string): boolean {
  return (state.economyRoutes ?? []).some(
    (r) =>
      (r.fromTownId === a && r.toTownId === b) || (r.fromTownId === b && r.toTownId === a),
  );
}

/** One dawn of doctrine pressure. */
export function tickDoctrines(state: SimState): { collapsed: string[]; competed: string[] } {
  const all = ensureDoctrines(state);
  const ids = Object.keys(all).sort();
  const result = { collapsed: [] as string[], competed: [] as string[] };

  // Competition: route-linked rivals; higher propaganda steals perceived from lower.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = all[ids[i]!]!;
      const b = all[ids[j]!]!;
      if (a.collapsed || b.collapsed || a.propaganda === b.propaganda) continue;
      if (a.townId === b.townId || !linked(state, a.townId, b.townId)) continue;
      const [win, lose] = a.propaganda > b.propaganda ? [a, b] : [b, a];
      const take = Math.min(STEAL, lose.perceivedDelivery);
      lose.perceivedDelivery -= take;
      win.perceivedDelivery = clamp01(win.perceivedDelivery + take);
      if (!result.competed.includes(lose.id)) result.competed.push(lose.id);
    }
  }

  // Legitimacy + collapse (single pass; cascade exposure applies next dawn, so it is finite).
  const newlyCollapsed: DoctrineState[] = [];
  for (const id of ids) {
    const d = all[id]!;
    if (d.collapsed) continue;
    d.legitimacy = applyCollapse({ ...d, legitimacy: legitimacyOf(d) });
    if (d.legitimacy < COLLAPSE_BELOW) {
      d.collapsed = true;
      newlyCollapsed.push(d);
      result.collapsed.push(id);
      const town = state.towns?.[d.townId];
      if (town) town.despair = clamp01(town.despair + DESPAIR_ON_COLLAPSE);
      pushJuice(state, 'doctrine.collapse', { doctrineId: id, townId: d.townId });
    }
  }
  // Cascade: each collapse nudges linked surviving doctrines' exposure once.
  for (const c of newlyCollapsed) {
    for (const id of ids) {
      const n = all[id]!;
      if (!n.collapsed && linked(state, c.townId, n.townId)) n.exposure = clamp01(n.exposure + CASCADE_EXPOSURE);
    }
  }
  return result;
}
