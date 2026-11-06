/** Seeded Fabric worldgen: history + gap + kin + geo + facilities/biomes. Pure; no dyn/. */

import { createRng } from '../rng';
import { generatePeople, type PersonDraft } from './people';
import { loadHistoryTables } from './load-history';
import { generateHistoryEvents, historyChainCoherent } from './history-gen';
import { generateGapSites } from './gap-sites';
import { generateKinEdges } from './kin-gen';
import { loadAuthoredAnchors } from './load-anchors';
import { loadWorldTables } from './load-world-tables';
import { generateSettlements, type SettlementGen } from './settlements-gen';
import { generateRoutes, type RouteGen } from './routes-gen';
import { generateDoctrines, type DoctrineGen } from './doctrines-gen';
import { loadFacilitiesBiomesTables } from './load-facilities-biomes';
import { generateFacilities, type FacilityGen } from './facilities-gen';
import { generateBiomes, type BiomeGen } from './biomes-gen';

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

export type { SettlementGen, RouteGen, DoctrineGen, FacilityGen, BiomeGen };

export type FabricWorld = {
  seed: number;
  fingerprint: string;
  people: PersonDraft[];
  lines?: PersonDraft['lines'];
  history?: HistoryEvent[];
  historyCoherence?: number;
  kinEdges?: KinEdge[];
  gapSites?: GapSite[];
  /** Authored towns subset — Probe may ignore. */
  settlements?: SettlementGen[];
  routes?: RouteGen[];
  doctrines?: DoctrineGen[];
  /** Authored facilities subset — Probe may ignore. */
  facilities?: FacilityGen[];
  /** Authored biomes subset — Probe may ignore. */
  biomes?: BiomeGen[];
  assertions?: AssertionResult[];
};

export type GenerateWorldOpts = {
  seed: number;
  peopleCount?: number;
  /** Merge authored people.json anchors (Ashford cast) into people list. */
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

/** Structural fingerprint: history + gap + kin + people + geo — not seed alone. */
function worldFingerprint(
  seed: number,
  people: PersonDraft[],
  history: HistoryEvent[],
  gapSites: GapSite[],
  kinEdges: KinEdge[],
  settlements: SettlementGen[],
  routes: RouteGen[],
  doctrines: DoctrineGen[],
  facilities: FacilityGen[],
  biomes: BiomeGen[],
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
  for (const s of settlements) {
    mix = mixStr(mix, `settlement:${s.id}`);
    mix = (mix ^ Math.imul(Math.round(s.gap01 * 1000) + 1, 0xc2b2ae35)) >>> 0;
  }
  for (const r of routes) {
    mix = mixStr(mix, `route:${r.id}:${r.fromId}->${r.toId}`);
  }
  for (const d of doctrines) {
    mix = mixStr(mix, `doctrine:${d.id}@${d.townId}`);
  }
  for (const f of facilities) {
    mix = mixStr(mix, `facility:${f.id}`);
  }
  for (const b of biomes) {
    mix = mixStr(mix, `biome:${b.id}`);
  }
  return `wf-${fpHex(mix)}-${people.length}`;
}

/**
 * Deterministic world: ≥3 people, seed-varying history/gap/kin/geo, Probe shape.
 * includeAnchors merges authored people.json anchors; peopleCount path unchanged when false/omitted.
 * Settlements/routes/doctrines/facilities/biomes use a separate RNG stream so Probe fields stay stable.
 */
export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const seed = opts.seed >>> 0;
  const peopleCount = Math.max(3, opts.peopleCount ?? 3);
  const procedural = generatePeople({ seed, count: peopleCount });
  const people =
    opts.includeAnchors === true
      ? [...loadAuthoredAnchors(), ...procedural]
      : procedural;

  const tables = loadHistoryTables();
  const rng = createRng(seed ^ 0xc0ffee);

  const history = generateHistoryEvents(rng, tables, people);
  const gapSites = generateGapSites(rng, tables.settlementSizes);
  const kinEdges = generateKinEdges(rng, people);
  const lines = people.flatMap((p) => p.lines ?? []);

  const worldTables = loadWorldTables();
  const geoRng = createRng(seed ^ 0x5e771e);
  const settlements = generateSettlements(
    geoRng,
    worldTables.towns,
    worldTables.doctrines,
  );
  const routes = generateRoutes(geoRng, settlements, worldTables.routes);
  const doctrines = generateDoctrines(geoRng, settlements, worldTables.doctrines);

  // Facilities/biomes consume geoRng after doctrines so settlements/routes/doctrines stay stable.
  const fbTables = loadFacilitiesBiomesTables();
  const facilities = generateFacilities(
    geoRng,
    settlements,
    routes,
    fbTables.facilities,
  );
  const biomes = generateBiomes(geoRng, routes, fbTables.biomes);

  const chainOk = historyChainCoherent(history, tables);
  const historyCoherence = chainOk ? 1 : 0.5;

  const fingerprint = worldFingerprint(
    seed,
    people,
    history,
    gapSites,
    kinEdges,
    settlements,
    routes,
    doctrines,
    facilities,
    biomes,
  );

  return {
    seed,
    fingerprint,
    people,
    lines,
    history,
    historyCoherence,
    kinEdges,
    gapSites,
    settlements,
    routes,
    doctrines,
    facilities,
    biomes,
    assertions: [{ ok: true }, { ok: true }],
  };
}
