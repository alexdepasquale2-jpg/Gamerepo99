/**
 * M4 Task C: doctrine legitimacy, collapse cascade and competition.
 * Real delivery is tracked apart from perceived delivery; legitimacy follows belief,
 * propaganda widens the gap, exposure triggers collapse. Pure + deterministic (no RNG needed:
 * ids are iterated in sorted order). Never touches player spark.
 */

import type { DataTables } from './load-data';
import { pushDelta } from './legacy/state';
import { findCrossTownKin, pushJuice } from './packets';
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

export type DoctrineState = DoctrineMeters & {
  id: string; townId: string; collapsed?: boolean; streaks?: Record<string, number>;
  /** Set on the doctrine a swap displaced: the winner that took its town will not chase it back (no ping-pong). */
  truceWith?: string;
};

const GAP_MIN = 0.25;
const EXPOSURE_MIN = 0.4;
const COLLAPSE_BELOW = 0.15;
const DESPAIR_ON_COLLAPSE = 0.05;
const CASCADE_EXPOSURE = 0.05;
const STEAL = 0.02;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Log a doctrine's absolute meters (and collapse) for the world-file delta log. */
function logDoctrine(state: SimState, d: DoctrineState): void {
  const { realDelivery, perceivedDelivery, propaganda, control, exposure, legitimacy } = d;
  pushDelta(state, { t: 'doctrine', townId: d.townId, doctrineId: d.id, day: state.day, patch: { realDelivery, perceivedDelivery, propaganda, control, exposure, legitimacy, ...(d.collapsed ? { collapsed: 1 } : {}) } });
}

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

type Rules = {
  challenger: { margin: number; dawns: number; suppressControl: number; suppressExposure: number };
  collapse: { relapseMulBase: number; shockSourceTownId: string; shockPerceived: number };
};
const rulesOf = (state: SimState): Rules =>
  ((state.data as DataTables | undefined)?.doctrines as { rules: Rules }).rules;

/** Collapse side effects: relapse_pressure packet along a kin edge; city collapse shocks linked villages. */
function collapseRipples(state: SimState, c: DoctrineState, all: Record<string, DoctrineState>, ids: string[]): void {
  const r = rulesOf(state).collapse;
  const gap = Math.abs(c.perceivedDelivery - c.realDelivery);
  for (const p of Object.keys(state.people).sort()) {
    if (state.people[p]!.townId !== c.townId) continue;
    const hit = findCrossTownKin(state, p);
    if (!hit) continue;
    const pkt = {
      id: `pkt_relapse_${c.id}_${state.day}`,
      days: 2,
      kind: 'relapse_pressure',
      fromTownId: c.townId,
      toTownId: hit.other.townId,
      relapseMulAdd: r.relapseMulBase + gap,
    };
    state.packets.push(pkt);
    pushJuice(state, 'packet.emit', { packetId: pkt.id, fromPersonId: p, toPersonId: hit.otherId, kind: pkt.kind, days: pkt.days });
    break;
  }
  if (c.townId !== r.shockSourceTownId) return;
  for (const id of ids) {
    const n = all[id]!;
    if (!n.collapsed && n.townId !== c.townId && linked(state, c.townId, n.townId)) {
      n.perceivedDelivery = clamp01(n.perceivedDelivery + r.shockPerceived);
    }
  }
}

/** Challenger legitimacy > incumbent + margin for N consecutive dawns => peaceful town swap (control suppresses). */
function challengerSwaps(state: SimState, all: Record<string, DoctrineState>, ids: string[]): void {
  const r = rulesOf(state).challenger;
  for (const a of ids.map((i) => all[i]!)) {
    for (const b of ids.map((i) => all[i]!)) {
      if (a === b || a.collapsed || b.collapsed || a.townId === b.townId || !linked(state, a.townId, b.townId)) continue;
      const streaks = (a.streaks ??= {});
      if (a.truceWith === b.id || !(b.legitimacy > a.legitimacy + r.margin)) {
        delete streaks[b.id];
        continue;
      }
      streaks[b.id] = (streaks[b.id] ?? 0) + 1;
      if (streaks[b.id]! < r.dawns) continue;
      delete streaks[b.id];
      if (a.control > r.suppressControl) {
        b.exposure = clamp01(b.exposure + r.suppressExposure);
        pushJuice(state, 'doctrine.suppressed', { doctrineId: a.id, challengerId: b.id });
      } else {
        [a.townId, b.townId] = [b.townId, a.townId];
        a.streaks = {};
        b.streaks = {};
        a.truceWith = b.id;
        pushJuice(state, 'doctrine.swap', { incumbentId: a.id, challengerId: b.id, townId: b.townId });
      }
    }
  }
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

/** Patron hook: nudge one meter of a live doctrine (clamped). Legitimacy is recomputed at the next dawn, never set. */
export function nudgeDoctrine(state: SimState, id: string, meter: 'realDelivery' | 'perceivedDelivery' | 'propaganda' | 'control' | 'exposure', add: number): void {
  const d = ensureDoctrines(state)[id];
  if (d && !d.collapsed) d[meter] = clamp01(d[meter] + add);
}

type ActRow = {
  id: string;
  requiresTargetTagsAny?: string[];
  requiresActorTagsAny?: string[]; effects?: { target: string; op: string; value: number }[] };

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
  const actor = act.requiresActorTagsAny;
  if (actor?.length && !actor.some((t) => state.player.statusTraits.includes(t))) return undefined;
  const all = ensureDoctrines(state);
  const rows = ((state.data as DataTables | undefined)?.doctrines as { doctrines?: { id: string; leaderPersonId?: string }[] } | undefined)?.doctrines ?? [];
  const live = Object.keys(all).sort().filter((k) => all[k]!.townId === townId && !all[k]!.collapsed);
  const id = live.find((k) => rows.find((r) => r.id === k)?.leaderPersonId === personId) ?? live[0];
  if (!id) return undefined;
  const d = all[id]!;
  for (const e of act.effects ?? []) {
    if (e.target === 'town.standing' && e.op === 'add') {
      // Towns without economy rows get an inert entry (opt-out, empty stock) so standing still lands.
      const town = ((state.towns ??= {})[townId] ??= { id: townId, economyOptIn: false, stock: {}, despair: 0 });
      town.standing = clamp01((town.standing ?? 0) + e.value);
      continue;
    }
    const m = e.target.startsWith('doctrine.') ? e.target.slice(9) : '';
    if (e.op === 'add' && m in d && typeof (d as Record<string, unknown>)[m] === 'number') {
      (d as unknown as Record<string, number>)[m] = clamp01((d as unknown as Record<string, number>)[m]! + e.value);
    }
  }
  logDoctrine(state, d);
  if (act.effects?.some((e) => e.target === 'doctrine.exposure')) {
    pushJuice(state, 'doctrine.exposed', { doctrineId: id, townId, personId, exposure: d.exposure });
  }
  if (act.effects?.some((e) => e.target === 'town.standing')) {
    pushJuice(state, 'doctrine.voice', { doctrineId: id, townId, personId, propaganda: d.propaganda });
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
  for (const c of newlyCollapsed) logDoctrine(state, c);
  for (const c of newlyCollapsed) collapseRipples(state, c, all, ids);
  challengerSwaps(state, all, ids);
  // Cascade: each collapse nudges linked surviving doctrines' exposure once.
  for (const c of newlyCollapsed) {
    for (const id of ids) {
      const n = all[id]!;
      if (!n.collapsed && linked(state, c.townId, n.townId)) n.exposure = clamp01(n.exposure + CASCADE_EXPOSURE);
    }
  }
  return result;
}
