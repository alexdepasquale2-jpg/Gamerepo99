/** Coherence / assertion layer — pure; gen/ never imports this. */

import { violatesConstraints, type Constraint } from './line-score';

export type LinePerson = {
  id?: string;
  marks?: { markId: string; stacks?: number }[];
  woundId?: string;
  tags?: string[];
  flags?: string[];
  alive?: boolean;
  /** Explicit memory tags (e.g. mark:hollowness, event:shame_resolved). */
  memory?: string[];
  events?: Array<string | { id: string; day?: number }>;
  vector?: Record<string, number>;
  trust?: number;
  day?: number;
};

export type LineFragment = {
  id?: string;
  text?: string;
  tags?: string[];
};

export type NeverContradictRule = {
  ifMemory: string;
  forbidFragmentTag: string;
};

export type VoiceConstraint = {
  id?: string;
  forbidTagsTogether?: string[][];
  neverContradict?: NeverContradictRule[];
};

export type VoiceConstraintsInput = {
  constraints?: VoiceConstraint[];
};

export type CoherenceFacility = {
  id: string;
  townId?: string;
  routeId?: string;
};

export type CoherenceWorld = {
  facilities?: CoherenceFacility[];
  towns?: Record<string, unknown> | Array<{ id: string }>;
  routes?: Array<{ id: string } | string>;
  gapSites?: Array<{ id?: string; gap01: number }>;
};

export type WorldCoherenceResult = {
  ok: boolean;
  violations: string[];
};

const VECTOR_KEYS = ['warmth', 'bite', 'piety', 'secrecy', 'weariness'] as const;

/** Build memory tag set from person marks, wound, events, and explicit memory. */
export function personMemoryTags(person: LinePerson): Set<string> {
  const out = new Set<string>();
  for (const m of person.memory ?? []) {
    if (typeof m === 'string' && m) out.add(m);
  }
  for (const mark of person.marks ?? []) {
    if (mark?.markId) out.add(`mark:${mark.markId}`);
  }
  if (person.woundId) out.add(`wound:${person.woundId}`);
  for (const ev of person.events ?? []) {
    const id = typeof ev === 'string' ? ev : ev?.id;
    if (id) out.add(`event:${id}`);
  }
  return out;
}

function isDead(person: LinePerson): boolean {
  if (person.alive === false) return true;
  return (person.flags ?? []).includes('dead');
}

function vectorOutOfBounds(vector: Record<string, number> | undefined): boolean {
  if (!vector) return false;
  for (const k of VECTOR_KEYS) {
    const v = vector[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return true;
  }
  for (const v of Object.values(vector)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return true;
  }
  return false;
}

/**
 * Returns true when the fragment is allowed for this person under constraints.
 * Fails closed on dead speakers, OOB vectors, neverContradict, and forbidTagsTogether.
 */
export function assertLineCandidate(
  person: LinePerson,
  fragment: LineFragment,
  constraints: VoiceConstraintsInput | null | undefined,
): boolean {
  if (isDead(person)) return false;
  if (vectorOutOfBounds(person.vector)) return false;

  const mem = personMemoryTags(person);
  const rules = (constraints?.constraints ?? []) as Constraint[];
  const frag = {
    id: fragment.id ?? 'candidate',
    text: fragment.text ?? '',
    tags: fragment.tags,
  };
  if (violatesConstraints(frag, mem, rules)) return false;
  return true;
}

function townIds(towns: CoherenceWorld['towns']): Set<string> {
  const out = new Set<string>();
  if (!towns) return out;
  if (Array.isArray(towns)) {
    for (const t of towns) {
      if (t?.id) out.add(t.id);
    }
    return out;
  }
  for (const id of Object.keys(towns)) out.add(id);
  return out;
}

function routeIds(routes: CoherenceWorld['routes']): Set<string> {
  const out = new Set<string>();
  for (const r of routes ?? []) {
    if (typeof r === 'string') out.add(r);
    else if (r?.id) out.add(r.id);
  }
  return out;
}

/** Thin world asserts until Task E — orphan facilities + gapAxis range. */
export function assertWorldCoherence(world: CoherenceWorld): WorldCoherenceResult {
  const violations: string[] = [];
  const towns = townIds(world.towns);
  const routes = routeIds(world.routes);

  for (const f of world.facilities ?? []) {
    const hasTown = Boolean(f.townId && towns.has(f.townId));
    const hasRoute = Boolean(f.routeId && routes.has(f.routeId));
    if (!hasTown && !hasRoute) {
      violations.push(`orphan_facility:${f.id}`);
    }
  }

  for (const g of world.gapSites ?? []) {
    const v = g.gap01;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      violations.push(`gap_out_of_range:${g.id ?? '?'}:${String(v)}`);
    }
  }

  return { ok: violations.length === 0, violations };
}
