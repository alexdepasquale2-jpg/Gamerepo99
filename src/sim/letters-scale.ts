/**
 * M4 Task D: letters and rumors at scale. Families split between city and village; letters
 * travel real route distance, thin with it, and ride the social web. Surfacing is juice only
 * (letter.deliver / rumor.spread); a dawn arrival sets the 'letter_arrived' circumstance tag
 * so Blessings and Burdens can come to pass. Deterministic: deriveRng, sorted iteration.
 */

import type { DataTables } from './load-data';
import { pushDelta } from './legacy/state';
import { pushJuice } from './packets';
import { deriveRng } from './rng';
import { createSocialGraph, walkCascade, type SocialGraph } from './social/social-graph';
import { DEFAULT_SOCIAL_PROPAGATION, type SocialEdge, type SocialWebTable } from './social/social-types';
import type { SimState } from './types/runtime';

export const MAX_PACKETS_PER_DAWN = 5;
const DEFAULT_DAYS = 2;

export type LetterPacket = {
  id: string;
  templateId: string;
  fromPersonId: string;
  toPersonId: string;
  packetType: string;
};

type Flight = LetterPacket & { kind: 'letter' | 'rumor'; days: number; fromTownId: string; toTownId: string };
type Pending = { kind: 'letter' | 'rumor'; fromPersonId: string; outcomeId: string };

export type LettersState = {
  pending: Pending[];
  flight: Flight[];
  seq: number;
  seenGrowth: number;
  seenHollow: number;
};

type Template = { id: string; packetType: string; edgeKind: string | null; title: string; body: string };
type CrossTown = {
  onGenuineGrowthChance?: number;
  emitPacketType?: string;
  preferLinksWithTags?: string[];
  onHollownessChance?: number;
  emitPressureType?: string;
};

type Tables = { templates: Template[]; ambient: number; crossTown: CrossTown; web?: SocialWebTable; falloff: number };

function tables(state: SimState): Tables {
  const d = (state.data ?? {}) as Partial<DataTables>;
  return {
    templates: ((d.letters as { templates?: Template[] } | undefined)?.templates ?? []) as Template[],
    ambient: (d.letters as { ambientDawnChance?: number } | undefined)?.ambientDawnChance ?? 0,
    crossTown: ((d.ripples as { crossTown?: CrossTown } | undefined)?.crossTown ?? {}) as CrossTown,
    web: d.socialWeb,
    falloff: d.socialPropagation?.falloff ?? DEFAULT_SOCIAL_PROPAGATION.falloff,
  };
}

export function ensureLetters(state: SimState): LettersState {
  return (state.letters ??= { pending: [], flight: [], seq: 0, seenGrowth: 0, seenHollow: 0 });
}

/** Queue a letter/rumor (called when a Blessing/Burden comes to pass); flushed at the next dawn. */
export function enqueueLetter(state: SimState, p: Pending): void {
  ensureLetters(state).pending.push(p);
}

/** Baked social web plus this seed's Fabric kin edges (generated people are not in the baked web). */
function edgesOf(state: SimState, web?: SocialWebTable): SocialEdge[] {
  const kin: SocialEdge[] = (state.kinEdges ?? []).map((k) => ({
    id: `kin_${k.from}__${k.to}`,
    a: k.from,
    b: k.to,
    kind: k.kind === 'kin' ? 'kin' : 'friendship',
    weight: 0.5,
    tags: [k.kind === 'kin' ? 'cousin' : 'pen_pal'],
  }));
  return [...(web?.edges ?? []), ...kin];
}

function townOf(state: SimState, id: string): string | undefined {
  return state.people[id]?.townId;
}

function routeDays(state: SimState, a: string, b: string): number {
  for (const r of state.economyRoutes ?? []) {
    if ((r.fromTownId === a && r.toTownId === b) || (r.fromTownId === b && r.toTownId === a)) {
      return Math.max(1, r.days);
    }
  }
  return DEFAULT_DAYS;
}

function pickTemplate(ts: Template[], packetType: string, edge?: SocialEdge): Template | undefined {
  const of = ts.filter((t) => t.packetType === packetType);
  const kinds = edge ? [...(edge.tags ?? []), edge.kind] : [];
  return of.find((t) => t.edgeKind !== null && kinds.includes(t.edgeKind)) ?? of.find((t) => t.edgeKind === null);
}

function launch(state: SimState, ls: LettersState, f: Omit<Flight, 'id' | 'days' | 'fromTownId' | 'toTownId'>): Flight | null {
  const from = townOf(state, f.fromPersonId);
  const to = townOf(state, f.toPersonId);
  if (!from || !to || from === to) return null;
  const out: Flight = { ...f, id: `ltr_${ls.seq++}_${state.day}`, days: routeDays(state, from, to), fromTownId: from, toTownId: to };
  ls.flight.push(out);
  pushDelta(state, { t: 'letter', day: state.day, packet: { id: out.id, kind: out.kind, templateId: out.templateId, packetType: out.packetType, fromPersonId: out.fromPersonId, toPersonId: out.toPersonId, fromTownId: out.fromTownId, toTownId: out.toTownId, days: out.days } });
  return out;
}

/**
 * Batch of cross-town letters from ripple chances (0.4 growth / 0.25 hollowness), then the
 * unspoken backlog (walkCascade picks the far relative). At most MAX_PACKETS_PER_DAWN new packets.
 */
export function rollCrossTownLetters(
  state: SimState,
  rng: { next(): number },
  opts: { genuineGrowth?: boolean; hollowness?: boolean },
): LetterPacket[] {
  const ls = ensureLetters(state);
  const t = tables(state);
  const out: LetterPacket[] = [];
  const add = (f: Flight | null) => {
    if (f) out.push({ id: f.id, templateId: f.templateId, fromPersonId: f.fromPersonId, toPersonId: f.toPersonId, packetType: f.packetType });
  };
  const edges = edgesOf(state, t.web);
  const cross = edges
    .filter((e) => {
      const a = townOf(state, e.a);
      const b = townOf(state, e.b);
      return !!a && !!b && a !== b && e.kind !== 'rival';
    })
    .sort((x, y) => (x.id < y.id ? -1 : 1));
  const prefer = t.crossTown.preferLinksWithTags ?? [];
  const ordered = [...cross.filter((e) => e.tags?.some((g) => prefer.includes(g))), ...cross.filter((e) => !e.tags?.some((g) => prefer.includes(g)))];

  const fromEdge = (packetType: string) => {
    if (ordered.length === 0) return;
    const e = ordered[Math.floor(rng.next() * Math.min(ordered.length, 3))]!;
    const flip = rng.next() < 0.5;
    const tpl = pickTemplate(t.templates, packetType, e);
    if (!tpl) return;
    add(launch(state, ls, { kind: 'letter', templateId: tpl.id, packetType, fromPersonId: flip ? e.b : e.a, toPersonId: flip ? e.a : e.b }));
  };
  // Ambient kin correspondence: split families keep writing even in quiet weeks.
  if (rng.next() < t.ambient) fromEdge(t.crossTown.emitPacketType ?? 'proof_packet');
  if (opts.genuineGrowth && rng.next() < (t.crossTown.onGenuineGrowthChance ?? 0)) fromEdge(t.crossTown.emitPacketType ?? 'proof_packet');
  if (opts.hollowness && rng.next() < (t.crossTown.onHollownessChance ?? 0)) fromEdge(t.crossTown.emitPressureType ?? 'relapse_pressure');

  if (!ls.pending.length || out.length >= MAX_PACKETS_PER_DAWN) return out;
  // Built only when the backlog needs a cascade walk (graph construction is O(edges) per dawn).
  const g = createSocialGraph(edges);
  const prop = { ...DEFAULT_SOCIAL_PROPAGATION, falloff: t.falloff };
  while (ls.pending.length && out.length < MAX_PACKETS_PER_DAWN) {
    const p = ls.pending.shift()!;
    const here = townOf(state, p.fromPersonId);
    const hit = walkCascade(g, p.fromPersonId, { baseStrength: 1, polarity: 'good' }, prop).find((h) => {
      const tt = townOf(state, h.personId);
      return !!tt && tt !== here;
    });
    if (!hit) continue;
    const packetType = p.kind === 'rumor' ? 'rumor' : (t.crossTown.emitPacketType ?? 'proof_packet');
    const edge = g.edgesBetween(hit.via, hit.personId)[0];
    const tpl = p.kind === 'rumor' ? undefined : pickTemplate(t.templates, packetType, edge);
    add(launch(state, ls, { kind: p.kind, templateId: tpl?.id ?? 'rumor', packetType, fromPersonId: p.fromPersonId, toPersonId: hit.personId }));
  }
  return out;
}

function markStacks(state: SimState, markId: string): number {
  let n = 0;
  for (const p of Object.values(state.people)) for (const m of p.marks ?? []) if (m.markId === markId) n += m.stacks;
  return n;
}

function render(tpl: Template | undefined, state: SimState, f: Flight): { title?: string; body?: string } {
  if (!tpl) return {};
  const name = (id: string) => (state.people[id] as { name?: string } | undefined)?.name ?? id;
  const sub: Record<string, string> = { fromName: name(f.fromPersonId), toName: name(f.toPersonId), fromTown: f.fromTownId };
  return { title: tpl.title, body: tpl.body.replace(/\{(\w+)\}/g, (_, k: string) => sub[k] ?? '') };
}

/** One dawn: deliver in-flight (distance thins them), then roll new batch. Returns delivered ids. */
export function tickLetters(state: SimState): string[] {
  const ls = ensureLetters(state);
  const t = tables(state);
  const delivered: string[] = [];
  const tags = ((state.flags.circumstanceTags as string[] | undefined) ?? []).filter((x) => x !== 'letter_arrived');
  const keep: Flight[] = [];
  for (const f of ls.flight) {
    if (f.days > 1) {
      keep.push({ ...f, days: f.days - 1 });
      continue;
    }
    // Long roads thin letters: survival falls off per day travelled beyond the first.
    const total = routeDays(state, f.fromTownId, f.toTownId);
    if (deriveRng(state.seed, 'letter-thin', f.id).next() >= Math.pow(t.falloff, Math.max(0, total - 1))) continue;
    delivered.push(f.id);
    const payload = { letterId: f.id, templateId: f.templateId, packetType: f.packetType, fromPersonId: f.fromPersonId, toPersonId: f.toPersonId, ...render(t.templates.find((x) => x.id === f.templateId), state, f) };
    pushJuice(state, f.kind === 'rumor' ? 'rumor.spread' : 'letter.deliver', payload);
  }
  ls.flight = keep;
  if (delivered.length) tags.push('letter_arrived');
  state.flags.circumstanceTags = tags;

  const growth = markStacks(state, 'genuine_growth');
  const hollow = markStacks(state, 'hollowness');
  const opts = { genuineGrowth: growth > ls.seenGrowth, hollowness: hollow > ls.seenHollow };
  ls.seenGrowth = growth;
  ls.seenHollow = hollow;
  rollCrossTownLetters(state, deriveRng(state.seed, 'letters', state.day), opts);
  return delivered;
}
