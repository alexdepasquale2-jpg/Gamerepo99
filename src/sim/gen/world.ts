/** Seeded world stub for Probe Fabric bots. Pure; no dyn/ imports. */

import { createRng } from '../rng';
import { generatePeople, type PersonDraft } from './people';

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
};

function fpHex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function chainKin(people: PersonDraft[]): KinEdge[] {
  const edges: KinEdge[] = [];
  for (let i = 0; i < people.length - 1; i++) {
    edges.push({ from: people[i]!.id, to: people[i + 1]!.id, kind: 'kin' });
  }
  if (people.length >= 3) {
    edges.push({
      from: people[people.length - 1]!.id,
      to: people[0]!.id,
      kind: 'friend',
    });
  }
  return edges;
}

function gapSitesFor(seed: number): GapSite[] {
  return [
    { id: `gap_village_${seed}`, gap01: 0 },
    { id: `gap_mid_${seed}`, gap01: 0.5 },
    { id: `gap_city_${seed}`, gap01: 1 },
  ];
}

function historyFor(seed: number, people: PersonDraft[]): HistoryEvent[] {
  const ids = people.map((p) => p.id);
  return [
    { id: `hist_${seed}_founding`, at: 1, tags: ['founding'], personIds: ids.slice(0, 1) },
    { id: `hist_${seed}_kin`, at: 2, tags: ['kin'], personIds: ids.slice(0, 2) },
    { id: `hist_${seed}_rift`, at: 4, tags: ['rift'], personIds: ids },
  ];
}

/** Deterministic stub world: ≥3 people, kin chain, gap [0,1], ordered history. */
export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const seed = opts.seed >>> 0;
  const peopleCount = Math.max(3, opts.peopleCount ?? 3);
  const people = generatePeople({ seed, count: peopleCount });
  const kinEdges = chainKin(people);
  const gapSites = gapSitesFor(seed);
  const history = historyFor(seed, people);
  const lines = people.flatMap((p) => p.lines ?? []);

  // Mix seed + people fingerprints so distinct seeds diverge.
  const rng = createRng(seed ^ 0xa5a5a5a5);
  const mix = people.reduce(
    (acc, p) => (acc ^ Math.imul(p.fingerprint.length + 1, rng.int(1, 1e6))) >>> 0,
    seed,
  );
  const fingerprint = `wf-${fpHex(mix)}-${people.length}`;

  return {
    seed,
    fingerprint,
    people,
    lines,
    history,
    historyCoherence: 1,
    kinEdges,
    gapSites,
    assertions: [{ ok: true }, { ok: true }],
  };
}
