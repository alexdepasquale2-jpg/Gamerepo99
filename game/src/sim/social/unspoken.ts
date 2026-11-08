/**
 * Blessings and Burdens runtime (spec 2026-11-06-social-graph/06 §4–§10).
 * Encode on interaction, decay + come-to-pass at dawn after tickEconomyLod.
 * Surfacing is indirect: a non-player carrier speaks via person.reaction / packet.emit.
 */

import { noteUse } from '../data-use-people';
import { deriveRng } from '../rng';
import { happeningTownName } from '../happenings';
import { enqueueLetter } from '../letters-scale';
import { pushJuice } from '../packets';
import type { SimState } from '../types/runtime';
import { getCentrality } from './centrality';
import { createSocialGraph, type SocialGraph } from './social-graph';
import type { CentralityTable, SocialWebTable } from './social-types';
import type {
  ComeToPassOutcome,
  ComeToPassResult,
  OutcomeKind,
  UnspokenClass,
  UnspokenInstance,
  UnspokenState,
  UnspokenTables,
} from './unspoken-types';

const FLAME_SCALE = 100;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function createUnspokenState(): UnspokenState {
  return { seq: 0, instances: [], tuning: {} };
}

function tuningFor(st: UnspokenState, classId: string) {
  return (st.tuning[classId] ??= { classId, pBias: 0, blessingBias: 0, samples: 0 });
}

function classMatches(c: UnspokenClass, interactionId: string, tags: readonly string[], reignited: boolean): boolean {
  const f = c.encodeFrom;
  const tagHit = !!f.tagsAny?.some((t) => tags.includes(t));
  if (f.requireReignite) return reignited && (f.tagsAny ? tagHit : true);
  if (f.interactionIds) return f.interactionIds.includes(interactionId);
  return tagHit;
}

/** Edges + people within maxHops of source (BFS, sorted for determinism). */
function depositPath(g: SocialGraph | undefined, source: string, maxHops: number) {
  const edgeIds = new Set<string>();
  const personIds = new Set<string>();
  if (!g) return { edgeIds: [], personIds: [] };
  let frontier = [source];
  const seen = new Set([source]);
  for (let h = 0; h < maxHops && frontier.length; h++) {
    const next: string[] = [];
    for (const u of frontier) {
      for (const n of g.neighbors(u)) {
        edgeIds.add(n.edge.id);
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        personIds.add(n.id);
        next.push(n.id);
      }
    }
    frontier = next.sort();
  }
  return { edgeIds: [...edgeIds].sort(), personIds: [...personIds].sort() };
}

export type EncodeCtx = {
  interactionId: string;
  sourcePersonId: string;
  placeTownId: string;
  day: number;
  seed: number;
  tags?: readonly string[];
  reignited?: boolean;
  situationMul?: number;
  graph?: SocialGraph;
};

/** §4: a successful interaction deposits an UnspokenInstance per matching class. */
export function encodeUnspoken(st: UnspokenState, t: UnspokenTables, ctx: EncodeCtx): UnspokenInstance[] {
  const made: UnspokenInstance[] = [];
  const rt = t.tuning.runtime;
  for (const c of t.classes) {
    if (!classMatches(c, ctx.interactionId, ctx.tags ?? [], ctx.reignited === true)) continue;
    const seq = ++st.seq;
    noteUse('people/unspoken/classes', c.id);
    const { edgeIds, personIds } = depositPath(ctx.graph, ctx.sourcePersonId, rt.maxDepositHops);
    const inst: UnspokenInstance = {
      id: `unspoken_${seq}_${ctx.seed >>> 0}`,
      classId: c.id,
      sourcePersonId: ctx.sourcePersonId,
      placeTownId: ctx.placeTownId,
      encodedDay: ctx.day,
      weight: c.baseWeight * (ctx.situationMul ?? 1),
      edgeIds,
      personIds,
      consumed: false,
      tuningSalt: deriveRng(ctx.seed, c.id, seq).int(0, 1 << 30),
    };
    st.instances.push(inst);
    made.push(inst);
    capPerSource(st, ctx.sourcePersonId, rt.maxActivePerSource);
  }
  return made;
}

/** Drop lowest-weight (then oldest) instances over the per-source cap. */
function capPerSource(st: UnspokenState, source: string, max: number): void {
  const mine = st.instances.filter((x) => x.sourcePersonId === source);
  if (mine.length <= max) return;
  const drop = new Set(
    [...mine]
      .sort((a, b) => a.weight - b.weight || a.encodedDay - b.encodedDay || a.id.localeCompare(b.id))
      .slice(0, mine.length - max)
      .map((x) => x.id),
  );
  st.instances = st.instances.filter((x) => !drop.has(x.id));
}

/** §5: one dawn of decay. Returns ids that faded (never came to pass). */
export function decayUnspoken(st: UnspokenState, t: UnspokenTables): string[] {
  const byId = new Map(t.classes.map((c) => [c.id, c]));
  const faded: string[] = [];
  st.instances = st.instances.filter((x) => {
    const hl = byId.get(x.classId)?.halfLifeDays ?? 1;
    x.weight *= 0.5 ** (1 / hl);
    if (x.weight >= t.tuning.runtime.epsilon && !x.consumed) return true;
    if (!x.consumed) faded.push(x.id);
    return false;
  });
  return faded;
}

export type ComeToPassCtx = {
  day: number;
  seed: number;
  playerId: string;
  circumstanceTags: readonly string[];
  peopleByTown?: Record<string, string[]>;
  graph?: SocialGraph;
  centrality?: CentralityTable;
  townDespair?: (townId: string) => number;
  /** Display name for a person id; absent/undefined falls back to a neutral phrase (never the raw id). */
  nameOf?: (id: string) => string | undefined;
  /** Test stub: replaces the derived rng's float. */
  roll?: () => number;
};

function pickCarrier(inst: UnspokenInstance, ctx: ComeToPassCtx, prefer?: string): string | undefined {
  const onPath = new Set(inst.personIds);
  const sameTown = new Set(ctx.peopleByTown?.[inst.placeTownId] ?? []);
  const cands = new Set([...inst.personIds, ...sameTown]);
  let best: string | undefined;
  let bestScore = -1;
  for (const c of [...cands].sort()) {
    if (c === ctx.playerId || c === inst.sourcePersonId) continue;
    const row = ctx.centrality ? getCentrality(ctx.centrality, c) : undefined;
    let score = (onPath.has(c) ? 1 : 0.5) * (1 + (row?.betweenness ?? 0));
    const hit =
      prefer === 'influential'
        ? !!row?.influential
        : prefer === 'same_town'
          ? sameTown.has(c)
          : !!prefer && !!ctx.graph?.edgesBetween(inst.sourcePersonId, c).some((e) => e.kind === prefer);
    if (hit) score *= 2;
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

const KIN_LABELS: Record<string, string> = { kin: 'cousin' };

function fillSlots(text: string, inst: UnspokenInstance, carrierId: string, ctx: ComeToPassCtx): string {
  const towns = ctx.peopleByTown ?? {};
  const carrierTown = Object.keys(towns).sort().find((t) => towns[t].includes(carrierId));
  const kinds = ctx.graph?.edgesBetween(inst.sourcePersonId, carrierId).map((e) => e.kind) ?? [];
  const slots: Record<string, string> = {
    carrier: ctx.nameOf?.(carrierId) ?? 'a neighbour',
    kinLabel: kinds.includes('kin') ? KIN_LABELS.kin : 'a friend',
    otherTown: inst.placeTownId && inst.placeTownId !== carrierTown ? happeningTownName(inst.placeTownId) : 'the next town over',
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

/** §6 + §8: roll each living instance; consumed ones are removed (exactly once). */
export function comeToPassUnspoken(st: UnspokenState, t: UnspokenTables, ctx: ComeToPassCtx): ComeToPassResult[] {
  const rt = t.tuning.runtime;
  const classes = new Map(t.classes.map((c) => [c.id, c]));
  const outcomes = new Map(t.outcomes.map((o) => [o.id, o]));
  const frags = new Map(t.fragments.map((f) => [f.id, f]));
  const out: ComeToPassResult[] = [];
  for (const inst of st.instances) {
    const c = classes.get(inst.classId);
    if (!c || inst.consumed || inst.weight < c.comeToPass.minWeight) continue;
    const req = c.comeToPass.requireTagsAny;
    if (req && !req.some((x) => ctx.circumstanceTags.includes(x))) continue;
    const rng = deriveRng(ctx.seed, inst.id, ctx.day, 'comeToPass');
    const roll = ctx.roll ?? rng.next;
    const tun = tuningFor(st, c.id);
    const lean = c.leaning === 'blessing' ? 0.25 : c.leaning === 'burden' ? -0.25 : (c.comeToPass.mixedBias ?? 0);
    const blessingP = clamp(0.5 + lean + tun.blessingBias, ...rt.blessingPClamp);
    const kind: OutcomeKind = roll() < blessingP ? 'blessing' : 'burden';
    const pool = (kind === 'blessing' ? c.comeToPass.blessingOutcomeIds : c.comeToPass.burdenOutcomeIds)
      .map((id) => outcomes.get(id))
      .filter((o): o is ComeToPassOutcome => !!o);
    if (!pool.length) continue;
    const outcome = pool[rng.int(0, pool.length)];
    const fragmentId = outcome.fragmentIds[rng.int(0, outcome.fragmentIds.length)];
    const carrierId = pickCarrier(inst, ctx, outcome.carrierPrefer);
    if (!carrierId) continue;
    const cent = ctx.centrality ? getCentrality(ctx.centrality, carrierId)?.betweenness ?? 0 : 0;
    const mod = 1 + tun.pBias + 0.1 * cent - 0.1 * (ctx.townDespair?.(inst.placeTownId) ?? 0);
    const p = clamp(c.comeToPass.baseP * (inst.weight / c.baseWeight) * mod, ...rt.comeToPassPClamp);
    if (roll() >= p) continue;
    inst.consumed = true;
    tun.samples += 1;
    out.push({
      instanceId: inst.id,
      classId: c.id,
      outcome,
      carrierId,
      sourcePersonId: inst.sourcePersonId,
      fragmentId,
      line: fragmentId && frags.get(fragmentId) ? fillSlots(frags.get(fragmentId)!.text, inst, carrierId, ctx) : undefined,
    });
  }
  st.instances = st.instances.filter((x) => !x.consumed);
  return out;
}

/** §9: player witnessed an outcome → nudge blessingBias, clamped to ±blessingBiasMax. */
export function witnessOutcome(st: UnspokenState, t: UnspokenTables, classId: string, kind: OutcomeKind): void {
  const tun = tuningFor(st, classId);
  const { blessingBiasMax: max, blessingBiasPerWitness: step } = t.tuning.caps;
  const d = (step / Math.sqrt(1 + tun.samples)) * (kind === 'blessing' ? 1 : -1);
  tun.blessingBias = clamp(tun.blessingBias + d, -max, max);
}

// ── SimState glue ──────────────────────────────────────────────────────────

type UnspokenData = { peopleById?: Record<string, { name?: unknown }>; unspoken?: UnspokenTables; socialWeb?: SocialWebTable; socialCentrality?: CentralityTable };
const graphCache = new WeakMap<SocialWebTable, SocialGraph>();

function graphOf(d: UnspokenData): SocialGraph | undefined {
  if (!d.socialWeb) return undefined;
  let g = graphCache.get(d.socialWeb);
  if (!g) graphCache.set(d.socialWeb, (g = createSocialGraph(d.socialWeb.edges)));
  return g;
}

function ctxFor(state: SimState, d: UnspokenData): ComeToPassCtx {
  const peopleByTown: Record<string, string[]> = {};
  for (const p of Object.values(state.people)) {
    const town = p.townId ?? state.player.townId;
    if (town) (peopleByTown[town] ??= []).push(p.id);
  }
  const tags = state.flags.circumstanceTags;
  return {
    day: state.day,
    seed: state.seed,
    playerId: state.player.id,
    circumstanceTags: Array.isArray(tags) ? (tags as string[]) : [],
    peopleByTown,
    graph: graphOf(d),
    centrality: d.socialCentrality,
    townDespair: (id) => state.towns?.[id]?.despair ?? 0,
    nameOf: (id) => {
      const n = state.people?.[id]?.name ?? d.peopleById?.[id]?.name;
      return typeof n === 'string' && n ? n : undefined;
    },
  };
}

function applyResult(state: SimState, t: UnspokenTables, r: ComeToPassResult): void {
  const e = r.outcome.effects;
  const carrier = state.people[r.carrierId];
  if (carrier) {
    carrier.flame = Math.max(0, carrier.flame + Math.round((e.flame01 ?? 0) * FLAME_SCALE));
    if (e.trust) carrier.trust = clamp((carrier.trust ?? 0) + e.trust, 0, 1);
    for (const { markId, stacks = 1 } of e.marksAdd ?? []) {
      const marks = (carrier.marks ??= []);
      const m = marks.find((x) => x.markId === markId);
      if (m) m.stacks += stacks;
      else marks.push({ markId, stacks });
    }
  }
  const townId = carrier?.townId;
  const town = townId ? state.towns?.[townId] : undefined;
  if (town && e.despair) town.despair = clamp(town.despair + e.despair, 0, 1);
  noteUse('people/unspoken/outcomes', r.outcome.id);
  noteUse('dialogue/fragments', r.fragmentId);
  pushJuice(state, 'person.reaction', {
    personId: r.carrierId,
    line: r.line,
    source: 'unspoken',
    outcomeId: r.outcome.id,
    instanceId: r.instanceId,
  });
  if (e.letterOrRumor) {
    pushJuice(state, 'packet.emit', { kind: e.letterOrRumor, fromPersonId: r.carrierId, outcomeId: r.outcome.id });
    enqueueLetter(state, { kind: e.letterOrRumor, fromPersonId: r.carrierId, outcomeId: r.outcome.id });
  }
  if (townId && townId === state.player.townId) witnessOutcome(state.unspoken!, t, r.classId, r.outcome.kind);
}

function runComeToPass(state: SimState, d: UnspokenData, t: UnspokenTables): void {
  for (const r of comeToPassUnspoken(state.unspoken!, t, ctxFor(state, d))) applyResult(state, t, r);
}

/** Interaction hook (§10): call after a successful resolveInteraction. */
export function encodeUnspokenForState(
  state: SimState,
  interactionId: string,
  personId: string,
  opts: { tags?: readonly string[]; reignited?: boolean } = {},
): UnspokenInstance[] {
  const d = (state.data ?? {}) as UnspokenData;
  const t = d.unspoken;
  if (!t) return [];
  state.unspoken ??= createUnspokenState();
  const made = encodeUnspoken(state.unspoken, t, {
    interactionId,
    sourcePersonId: personId,
    placeTownId: state.people[personId]?.townId ?? state.player.townId ?? '',
    day: state.day,
    seed: state.seed,
    tags: opts.tags,
    reignited: opts.reignited,
    graph: graphOf(d),
  });
  if (t.tuning.comeToPassAlsoOnInteractionIds.includes(interactionId)) runComeToPass(state, d, t);
  return made;
}

/** Dawn hook (§10): decay, then come-to-pass. Runs after tickEconomyLod. */
export function tickUnspokenDawn(state: SimState): void {
  const d = (state.data ?? {}) as UnspokenData;
  if (!d.unspoken || !state.unspoken?.instances.length) return;
  decayUnspoken(state.unspoken, d.unspoken);
  runComeToPass(state, d, d.unspoken);
}

/**
 * A reply letter is a circumstance in which a latent Blessing or Burden can come to pass: the
 * writer is the carrier, so the outcome (and its line) is theirs and lands in the reply.
 * Considers instances the writer started, sits on the path of, or that were placed in their town.
 * At most one surfaces per reply. `roll` replaces the derived rng (tests).
 */
export function surfaceUnspokenInReply(
  state: SimState,
  writerId: string,
  opts: { tags?: readonly string[]; roll?: () => number; rollKey?: string } = {},
): ComeToPassResult | undefined {
  const d = (state.data ?? {}) as UnspokenData;
  const t = d.unspoken;
  const st = state.unspoken;
  if (!t || !st?.instances.length) return undefined;
  const town = state.people[writerId]?.townId;
  const base = ctxFor(state, d);
  const rng = deriveRng(state.seed, 'reply-surface', opts.rollKey ?? writerId, state.day);
  const ctx: ComeToPassCtx = {
    ...base,
    circumstanceTags: [...base.circumstanceTags, ...(opts.tags ?? [])],
    peopleByTown: {},
    roll: opts.roll ?? (() => rng.next()),
  };
  const near = st.instances
    .filter((x) => !x.consumed && (x.sourcePersonId === writerId || x.personIds.includes(writerId) || (!!town && x.placeTownId === town)))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const inst of near) {
    // The writer is the only candidate carrier; when they started it themselves, the source slot is vacated.
    const probe: UnspokenInstance = { ...inst, personIds: [writerId], sourcePersonId: inst.sourcePersonId === writerId ? '' : inst.sourcePersonId };
    const [hit] = comeToPassUnspoken({ seq: st.seq, instances: [probe], tuning: st.tuning }, t, ctx);
    if (!hit) continue;
    st.instances = st.instances.filter((x) => x.id !== inst.id);
    applyResult(state, t, { ...hit, sourcePersonId: inst.sourcePersonId });
    return hit;
  }
  return undefined;
}
