/** World delta log: reduce/digest for verification, replay onto a seed with per-day RNG reset. Pure. */

import { fingerprintHex } from '../map/fingerprint';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { placeGrave } from './npc';
import type { WorldDelta } from './types';

const KNOWN = new Set(['day', 'reignite', 'doctrine', 'route', 'letter', 'grave', 'custom']);
export const isKnownDelta = (d: unknown): d is WorldDelta => typeof d === 'object' && d !== null && KNOWN.has((d as { t?: string }).t ?? '');

export type Reduced = { day: number; people: Record<string, { flame: number; marks: string[] }>; graves: string[] };

/** The delta-covered end state, computed from the log alone. */
export function reduceDeltas(deltas: WorldDelta[]): Reduced {
  const out: Reduced = { day: 1, people: {}, graves: [] };
  for (const d of deltas) {
    if (d.t === 'day') out.day = d.day;
    else if (d.t === 'reignite') out.people[d.personId] = { flame: Number.isFinite(d.flame) ? Math.max(0, Math.min(100, d.flame as number)) : -1, marks: [...(d.marks ?? [])] };
    else if (d.t === 'grave' && !out.graves.includes(`${d.personId}@${d.day}`)) out.graves.push(`${d.personId}@${d.day}`);
  }
  return out;
}

/** Digest of the same fields read back from a (replayed) state. */
export function stateDigest(state: SimState, expect: Reduced): string {
  const people = Object.fromEntries(
    Object.keys(expect.people).sort().map((id) => {
      const p = state.people[id];
      const marks = (p?.marks ?? []).filter((m) => m.stacks > 0).map((m) => `${m.markId}:${m.stacks}`).sort();
      return [id, { flame: p?.flame ?? -1, marks }];
    }),
  );
  const graves = (state.legacy?.graves ?? []).map((g) => `${g.personId}@${g.day}`);
  return fingerprintHex([JSON.stringify({ day: state.day, people, graves })]);
}

export function digestOf(r: Reduced): string {
  const people = Object.fromEntries(Object.keys(r.people).sort().map((id) => [id, { flame: r.people[id]!.flame, marks: [...r.people[id]!.marks].sort() }]));
  return fingerprintHex([JSON.stringify({ day: r.day, people, graves: r.graves })]);
}

export function contentHash(seed: number, packs: string[], deltas: WorldDelta[]): string {
  return fingerprintHex([String(seed), packs.join(','), JSON.stringify(deltas)]);
}

/** Replay deltas in order; the RNG is reset at every day boundary so same file => same world. */
export function applyDeltas(state: SimState, deltas: WorldDelta[]): void {
  for (const d of deltas) {
    if (d.t === 'day') {
      state.day = d.day;
      state.rng = deriveRng(state.seed, 'day', d.day);
    } else if (d.t === 'reignite') {
      const p = state.people[d.personId];
      if (!p) continue;
      if (Number.isFinite(d.flame)) p.flame = Math.max(0, Math.min(100, d.flame as number));
      p.marks = (d.marks ?? []).map((m) => {
        const [markId, stacks] = m.split(':');
        return { markId: markId!, stacks: Number(stacks ?? 1) };
      });
    } else if (d.t === 'grave') {
      placeGrave(state, { personId: d.personId, name: d.name ?? d.personId, townId: d.townId, epitaphId: d.epitaphId, day: d.day });
    } else if (d.t === 'doctrine') {
      for (const m of Object.values(state.doctrines ?? {})) if (m.townId === d.townId) Object.assign(m, d.patch);
    } else if (d.t === 'route') {
      const r = state.economyRoutes?.find((x) => x.id === d.routeId);
      if (r) Object.assign(r, { ...(d.broken !== undefined && { broken: d.broken }), ...(d.condition !== undefined && { condition: d.condition }) });
    } else if (d.t === 'letter') {
      state.packets.push(d.packet as never);
    }
  }
}
