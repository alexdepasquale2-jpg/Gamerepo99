/** World delta log: reduce/digest for verification, replay onto a seed with per-day RNG reset. Pure. */

import { fingerprintHex } from '../map/fingerprint';
import { ensureDoctrines } from '../doctrine-tick';
import { ensureEconomyState } from '../economy/economy-lod';
import type { DataTables } from '../load-data';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';
import { placeGrave } from './npc';
import type { ProtagonistImprint, WorldDelta } from './types';

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
      for (const m of Object.values(state.doctrines ?? {})) {
        if (m.townId !== d.townId || (d.doctrineId !== undefined && m.id !== d.doctrineId)) continue;
        const { collapsed, ...meters } = d.patch;
        Object.assign(m, meters);
        if (collapsed !== undefined) m.collapsed = collapsed > 0;
      }
    } else if (d.t === 'route') {
      ensureEconomyState(state);
      const r = state.economyRoutes?.find((x) => x.id === d.routeId);
      if (r) Object.assign(r, { ...(d.broken !== undefined && { broken: d.broken }), ...(d.condition !== undefined && { condition: d.condition }) });
    } else if (d.t === 'letter') {
      state.packets.push(d.packet as never);
    }
  }
}

const num01 = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : undefined);
const METERS = ['realDelivery', 'perceivedDelivery', 'propaganda', 'control', 'exposure', 'legitimacy'];

/** Drop deltas naming unknown towns/doctrines/routes/templates/people; clamp meters and conditions to [0,1]. */
export function sanitizeDeltas(state: SimState, deltas: WorldDelta[]): WorldDelta[] {
  const doctrines = ensureDoctrines(state);
  ensureEconomyState(state);
  const routes = new Set((state.economyRoutes ?? []).map((r) => r.id));
  const templates = new Set(((state.data as DataTables | undefined)?.letters as { templates?: { id: string }[] } | undefined)?.templates?.map((t) => t.id) ?? []);
  const out: WorldDelta[] = [];
  for (const d of deltas) {
    if (d.t === 'doctrine') {
      const live = Object.values(doctrines).filter((x) => x.townId === d.townId && (d.doctrineId === undefined || x.id === d.doctrineId));
      if (!live.length || typeof d.patch !== 'object' || d.patch === null) continue;
      const patch: Record<string, number> = {};
      for (const k of [...METERS, 'collapsed']) {
        const v = num01(d.patch[k]);
        if (v !== undefined) patch[k] = k === 'collapsed' ? (v > 0 ? 1 : 0) : v;
      }
      out.push({ t: 'doctrine', townId: d.townId, ...(d.doctrineId !== undefined && { doctrineId: d.doctrineId }), patch, day: d.day });
    } else if (d.t === 'route') {
      if (!routes.has(d.routeId)) continue;
      const condition = num01(d.condition);
      out.push({ t: 'route', routeId: d.routeId, ...(typeof d.broken === 'boolean' && { broken: d.broken }), ...(condition !== undefined && { condition }), day: d.day });
    } else if (d.t === 'letter') {
      const k = (d.packet ?? {}) as Record<string, unknown>;
      const [templateId, fromPersonId, toPersonId, packetType] = [str(k.templateId), str(k.fromPersonId), str(k.toPersonId), str(k.packetType)];
      const days = typeof k.days === 'number' && Number.isFinite(k.days) ? Math.min(30, Math.max(1, Math.round(k.days))) : 1;
      if (!templateId || !fromPersonId || !toPersonId || !packetType || !state.people[fromPersonId] || !state.people[toPersonId]) continue;
      if (templateId !== 'rumor' && !templates.has(templateId)) continue;
      out.push({ t: 'letter', day: d.day, packet: { id: str(k.id) ?? `ltr_${out.length}`, kind: k.kind === 'rumor' ? 'rumor' : 'letter', templateId, packetType, fromPersonId, toPersonId, fromTownId: str(k.fromTownId), toTownId: str(k.toTownId), days } });
    } else out.push(d);
  }
  return out;
}

/** Imprint contents from a file: known refusal hooks only, tendencies/weights clamped to [0,1], stacks >= 0. */
export function sanitizeImprint(state: SimState, im: ProtagonistImprint | null): ProtagonistImprint | null {
  if (!im || typeof im !== 'object') return null;
  const hooks = (state.data as DataTables | undefined)?.hooksById;
  const tend: Record<string, number> = {};
  for (const [k, v] of Object.entries(im.methodTendencies ?? {})) tend[k] = num01(v) ?? 0;
  return {
    ...im,
    methodTendencies: tend,
    refusalHookIds: (Array.isArray(im.refusalHookIds) ? im.refusalHookIds : []).filter((h) => typeof h === 'string' && hooks?.get(h)?.kind === 'refusal'),
    bonds: (Array.isArray(im.bonds) ? im.bonds : []).filter((b) => str(b?.personId)).map((b) => ({ ...b, weight: num01(b.weight) ?? 0 })),
    marksLeft: (Array.isArray(im.marksLeft) ? im.marksLeft : []).filter((m) => str(m?.personId) && str(m?.markId)).map((m) => ({ ...m, stacks: Number.isFinite(m.stacks) ? Math.min(99, Math.max(0, Math.round(m.stacks))) : 0 })),
  };
}
