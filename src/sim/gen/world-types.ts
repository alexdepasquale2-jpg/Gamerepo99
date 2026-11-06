/** Fabric worldgen shared types. Pure; no dyn/. */

import type { PersonDraft } from './people';
import type { SettlementGen } from './settlements-gen';
import type { RouteGen } from './routes-gen';
import type { DoctrineGen } from './doctrines-gen';
import type { FacilityGen } from './facilities-gen';
import type { BiomeGen } from './biomes-gen';

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
