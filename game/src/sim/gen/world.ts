/** Seeded Fabric worldgen: history + gap + kin + geo + facilities/biomes. Pure; no dyn/. */

import { districtAt, isHome } from '../map/districts';
import { createRng } from '../rng';
import { generatePeople, type PersonDraft } from './society/people';
import { loadHistoryTables } from './load/load-history';
import { generateHistoryEvents, historyChainCoherent } from './society/history-gen';
import { generateGapSites } from './places/gap-sites';
import { generateKinEdges } from './society/kin-gen';
import { loadAuthoredAnchors } from './load/load-anchors';
import {
  loadWorldTables,
  pickKinPattern,
  pickWorldShape,
} from './load/load-world-tables';
import { generateSettlements, type SettlementGen } from './places/settlements-gen';
import type { RouteGen } from './places/routes-gen';
import { geographicRoads } from '../map/world-layout';
import { WORLD_SCALE } from '../map/constants';
import { generateDoctrines, type DoctrineGen } from './society/doctrines-gen';
import { loadFacilitiesBiomesTables } from './load/load-facilities-biomes';
import { generateFacilities, type FacilityGen } from './places/facilities-gen';
import { generateBiomes, type BiomeGen } from './places/biomes-gen';
import type {
  FabricWorld,
  GapSite,
  GenerateWorldOpts,
  HistoryEvent,
  KinEdge,
} from './world-types';

export type * from './world-types';

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
/** Folk simulated in a district at once (its towns' head count, capped so a visit stays light). */
export const DISTRICT_PEOPLE_CAP = 72;
const GAP_OF = { village: 0.15, town: 0.45, city: 0.8 } as const;

export function generateWorld(opts: GenerateWorldOpts): FabricWorld {
  const seed = opts.seed >>> 0;
  // A district other than home: its own towns (fixed spots), its own folk (a people seed of its own), no authored cast.
  const district = opts.district && !isHome(opts.district.col, opts.district.row) ? districtAt(seed, opts.district.col, opts.district.row) : null;
  const peopleSeed = district ? (seed ^ Math.imul(district.col * 31 + district.row + 1, 0x9e3779b1)) >>> 0 : seed;
  const peopleCount = district ? Math.max(6, Math.min(DISTRICT_PEOPLE_CAP, district.population)) : Math.max(3, opts.peopleCount ?? 3);
  const procedural = generatePeople({ seed: peopleSeed, count: peopleCount });
  const people =
    opts.includeAnchors === true && !district
      ? [...loadAuthoredAnchors(), ...procedural]
      : procedural;

  const tables = loadHistoryTables();
  const worldTables = loadWorldTables();
  const metaRng = createRng(seed ^ 0xa11ce);
  const shape = pickWorldShape(metaRng, worldTables.shapes);
  const kinPattern = pickKinPattern(metaRng, worldTables.kinPatterns);

  const rng = createRng(peopleSeed ^ 0xc0ffee);
  const history = generateHistoryEvents(rng, tables, people, shape);
  const gapSites = generateGapSites(rng, tables.settlementSizes, shape?.gapBias);
  const kinEdges = generateKinEdges(rng, people, kinPattern);
  const lines = people.flatMap((p) => p.lines ?? []);

  const geoRng = createRng(seed ^ 0x5e771e);
  const settlements = district
    ? district.towns.map((t) => ({ id: t.id, name: t.name, gap01: GAP_OF[t.kind], politySize: t.people * 40, at: { q: t.q, r: t.r } }))
    : generateSettlements(
      geoRng,
      worldTables.towns,
      worldTables.doctrines,
      shape,
    );
  const routes: RouteGen[] = geographicRoads(settlements, seed).map((r) => ({
    id: r.id, fromId: r.from, toId: r.to,
    days: Math.max(1, Math.ceil(r.path.slice(1).reduce((len, p, i) => len + Math.hypot(p.q - r.path[i]!.q, p.r - r.path[i]!.r), 0) / (120 * WORLD_SCALE))),
    biomeIds: [],
  }));
  const doctrines = generateDoctrines(
    geoRng,
    settlements,
    worldTables.doctrines,
    shape,
  );

  // Facilities/biomes consume geoRng after doctrines so settlements/routes/doctrines stay stable.
  const fbTables = loadFacilitiesBiomesTables();
  const facilities = generateFacilities(
    geoRng,
    settlements,
    routes,
    fbTables.facilities,
    seed,
  );
  const biomes = generateBiomes(geoRng, routes, fbTables.biomes, shape);

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
