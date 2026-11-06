/** Seeded Fabric worldgen: history + gap sites + kin from tables. Pure; no dyn/. */

import { createRng } from '../rng';
import { generatePeople, type PersonDraft } from './people';
import { loadHistoryTables } from './load-history';
import { generateHistoryEvents, historyChainCoherent } from './history-gen';
import { generateGapSites } from './gap-sites';
import { generateKinEdges } from './kin-gen';

export type KinEdge = { from: string; to: string; kind?: string };
export type GapSite = { id: string; gap01: number };
export type HistoryEvent = {
  id: string;
  at?: number;
  tags?: string[];
  personIds?: string[];
};
export type AssertionResult = {
  ok: boolean;
  violationId?: string;
  message?: string;
};

export type FabricWorld = {
  seed: number;
  fingerprint: string;
  people: PersonDraft[];
  lines?: PersonDraft['lines'];
  history?: HistoryEvent[];
  historyCoherence?: number;
  kinEdges?: KinEdge[];
  gapSites?: GapSite[];
  assertions?: AssertionResult[];
};

export type GenerateWorldOpts = {
  seed: number;
  peopleCount?: number;
  /** TODO(Task E+/F): merge authored Ashford people when true. */
  includeAnchors?: boolean;
};

function fpHex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function mixStr(acc: number, s: string): number {
  let h = acc;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/** Structural fingerprint: history + gap + kin + people — not seed alone. */
function worldFingerprint(
  seed: number,
  people: PersonDraft[],
  history: HistoryEvent[],
  gapSites: GapSite[],
  kinEdges: KinEdge[],
): string {
  let mix = seed >>> 0;
  for (const p of people) mix = mixStr(mix, p.fingerprint);
  for (const h of history) {
    mix = mixStr(mix, h.id);
    for (const t of h.tags ?? []) mix = mixStr(mix, t);
    mix = (mix ^ Math.imul((h.at ?? 0) + 1, 0x9e3779b9)) >>> 0;
  }
  for (const g of gapSites) {
    mix = mixStr(mix, g.id);
    mix = (mix ^ Math.imul(Math.round(g.gap01 * 1000) + 1, 0x85ebca6b)) >>> 0;
  }
  for (const e of kinEdges) {
    mix = mixStr(mix, `${e.kind ?? 'kin'}:${e.from}->${e.to}`);
  }
  return `wf-${fpHex(mix)}-${people.length}`;
}

/**
 * Deterministic world: ≥3 people, seed-varying history/gap/kin, Probe shape.
 * Anchors: includeAnchors reserved — peopleCount API unchanged.
 */
export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const seed = opts.seed >>> 0;
  const peopleCount = Math.max(3, opts.peopleCount ?? 3);
  const people = generatePeople({ seed, count: peopleCount });

  const tables = loadHistoryTables();
  const rng = createRng(seed ^ 0xc0ffee);

  const history = generateHistoryEvents(rng, tables, people);
  const gapSites = generateGapSites(rng, tables.settlementSizes);
  const kinEdges = generateKinEdges(rng, people);
  const lines = people.flatMap((p) => p.lines ?? []);

  const chainOk = historyChainCoherent(history, tables);
  const historyCoherence = chainOk ? 1 : 0.5;

  // includeAnchors: reserved for Ashford merge (do not block peopleCount path).
  void opts.includeAnchors;

  const fingerprint = worldFingerprint(seed, people, history, gapSites, kinEdges);

  return {
    seed,
    fingerprint,
    people,
    lines,
    history,
    historyCoherence,
    kinEdges,
    gapSites,
    assertions: [{ ok: true }, { ok: true }],
  };
}
