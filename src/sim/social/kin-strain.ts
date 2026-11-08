/**
 * Kin strain across the gap (The Drift). The people were once one fabric; city livelihoods drifted
 * from village life until kin could no longer recognise each other's lives. Every settlement sits on
 * the gap axis (gap01: 0 village … 1 city). A kin edge whose two ends live far apart on that axis
 * carries strain; a person's strain is the saturating sum of their strained ties, weighted by how far
 * apart the two lives are and how close the tie is.
 *
 * Derived, never saved: recomputed lazily each dawn, and whenever someone moves, is born or forms a
 * new tie (from state.people townIds, state.kinEdges and grown children's parents). Pure; deterministic.
 */
import { loadWorldTables } from '../gen/load/load-world-tables';
import { settlementKind, type SettlementKind } from '../map/world-layout';
import type { SimState } from '../types/runtime';

/** Below this gap difference two lives still recognise each other: no strain. */
export const GAP_NEAR = 0.3;
/** At or beyond this gap difference a tie carries its full strain. */
export const GAP_FAR = 0.75;
/** How much one fully strained close-kin tie contributes (saturating combine). */
export const TIE_STRAIN = 0.75;
/** People at or above this strain voice it (dialogue, dawn talk). */
export const STRAINED = 0.35;

/** How close the tie is. Introductions are new acquaintances, not family the drift pulled apart. */
const KIND_WEIGHT: Record<string, number> = { kin: 1, friend: 0.5, pen_pal: 0.4, introduced: 0 };
const kindWeight = (kind: string | undefined): number => KIND_WEIGHT[kind ?? 'kin'] ?? 0.5;

export type StrainTie = {
  otherId: string;
  kind: string;
  /** |gap01(mine) - gap01(theirs)|, 0..1. */
  gapDiff: number;
  /** This tie's 0..1 contribution before combining. */
  pull: number;
};

type TownGap = { gap01: number; name: string };
let townGaps: Map<string, TownGap> | undefined;

/** Settlement gap01 + display name by id, from the same town rows worldgen draws settlements from. */
function townGap(townId: string | undefined): TownGap | undefined {
  if (!townId) return undefined;
  townGaps ??= new Map(
    loadWorldTables().towns.map((t) => [
      t.id,
      { gap01: Math.round(t.gapAxis * 1000) / 1000, name: t.name.replace(/\s*\(.*\)\s*$/, '') },
    ]),
  );
  return townGaps.get(townId);
}

export function townGap01(townId: string | undefined): number | undefined {
  return townGap(townId)?.gap01;
}

export function townDisplayName(townId: string | undefined): string | undefined {
  return townGap(townId)?.name;
}

export function townKind(townId: string | undefined): SettlementKind | undefined {
  const g = townGap01(townId);
  return g === undefined ? undefined : settlementKind({ gap01: g });
}

/** 0..1 reach of a gap difference: 0 up to GAP_NEAR, ramps to 1 at GAP_FAR. */
export function gapReach(gapDiff: number): number {
  const t = (Math.abs(gapDiff) - GAP_NEAR) / (GAP_FAR - GAP_NEAR);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Saturating combine of tie pulls: 1 - Π(1 - TIE_STRAIN·pull), rounded for stable comparisons. */
export function combineStrain(pulls: number[]): number {
  let keep = 1;
  for (const p of pulls) keep *= 1 - TIE_STRAIN * Math.max(0, Math.min(1, p));
  return Math.round((1 - keep) * 1000) / 1000;
}

type Edge = { from: string; to: string; kind?: string };

function edgesOf(state: SimState): Edge[] {
  const out: Edge[] = [...(state.kinEdges ?? [])];
  // Grown children who became people keep their parents as kin.
  for (const c of state.kin?.children ?? []) {
    if (!c.personId) continue;
    for (const p of c.parents) out.push({ from: c.personId, to: p, kind: 'kin' });
  }
  return out;
}

/** Cheap fingerprint of everything strain depends on: day, ties, and where everyone lives. */
function cacheKey(state: SimState): string {
  let h = 2166136261;
  const mix = (x: string): void => {
    for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619) >>> 0;
  };
  for (const id in state.people) mix(`${id}@${state.people[id]?.townId ?? ''};`);
  for (const e of state.kinEdges ?? []) mix(`${e.from}>${e.to}:${e.kind ?? ''};`);
  for (const c of state.kin?.children ?? []) if (c.personId) mix(`${c.personId}<${c.parents.join(',')};`);
  return `${state.day}|${h}`;
}

type Cache = { key: string; ties: Map<string, StrainTie[]>; strain: Map<string, number> };
const cache = new WeakMap<SimState, Cache>();

function compute(state: SimState): Cache {
  const key = cacheKey(state);
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit;
  // One tie per pair: the strongest edge between the two wins (a kin edge outweighs an introduction).
  const best = new Map<string, { a: string; b: string; kind: string; gapDiff: number; pull: number }>();
  for (const e of edgesOf(state)) {
    if (e.from === e.to) continue;
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const ga = townGap01(state.people[a]?.townId);
    const gb = townGap01(state.people[b]?.townId);
    if (ga === undefined || gb === undefined) continue;
    const gapDiff = Math.round(Math.abs(ga - gb) * 1000) / 1000;
    const kind = e.kind ?? 'kin';
    const pull = kindWeight(kind) * gapReach(gapDiff);
    const pair = `${a}|${b}`;
    const prev = best.get(pair);
    if (pull > 0 && (!prev || pull > prev.pull)) best.set(pair, { a, b, kind, gapDiff, pull });
  }
  const ties = new Map<string, StrainTie[]>();
  const add = (id: string, t: StrainTie): void => void (ties.get(id) ?? ties.set(id, []).get(id)!).push(t);
  for (const { a, b, kind, gapDiff, pull } of best.values()) {
    add(a, { otherId: b, kind, gapDiff, pull });
    add(b, { otherId: a, kind, gapDiff, pull });
  }
  const strain = new Map<string, number>();
  for (const [id, list] of ties) {
    list.sort((x, y) => y.pull - x.pull || x.otherId.localeCompare(y.otherId));
    strain.set(id, combineStrain(list.map((t) => t.pull)));
  }
  const out = { key, ties, strain };
  cache.set(state, out);
  return out;
}

/** 0..1 kin strain for one person (0 when they have no ties across the gap). */
export function kinStrainOf(state: SimState, personId: string): number {
  return compute(state).strain.get(personId) ?? 0;
}

/** This person's strained ties, strongest first. */
export function strainedTiesOf(state: SimState, personId: string): StrainTie[] {
  return [...(compute(state).ties.get(personId) ?? [])];
}

/** Every person with strain > 0, by id. */
export function kinStrainMap(state: SimState): Record<string, number> {
  return Object.fromEntries([...compute(state).strain].sort(([a], [b]) => a.localeCompare(b)));
}
