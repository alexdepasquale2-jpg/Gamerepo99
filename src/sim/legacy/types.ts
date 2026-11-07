/** Generational legacy types (M5 Task C). Pure data shapes; no DOM/Phaser. */

import type { Inhabitant } from '../types/runtime';

export type WorldDelta =
  | { t: 'day'; day: number }
  | { t: 'reignite'; personId: string; methodId: string; marks?: string[]; flame?: number; day: number }
  | { t: 'doctrine'; townId: string; patch: Record<string, number>; day: number }
  | { t: 'route'; routeId: string; broken?: boolean; condition?: number; day: number }
  | { t: 'letter'; packet: Record<string, unknown>; day: number }
  | { t: 'grave'; personId: string; epitaphId?: string; townId?: string; name?: string; day: number }
  | { t: 'custom'; key: string; payload: unknown; day: number };

export type ProtagonistImprint = {
  slot: 'reserved';
  displayName: string;
  speciesTags: string[];
  embodimentTraitId?: string;
  methodTendencies: Record<string, number>;
  refusalHookIds: string[];
  notableChoices: { day: number; kind: string; summary: string }[];
  bonds: { personId: string; weight: number; lastMethod?: string }[];
  marksLeft: { personId: string; markId: string; stacks: number }[];
  legendSeed: string;
  /** Extension (hoarder spec 8b): ['hoard_legacy'] etc. */
  flags?: string[];
  /** Extension: ending id such as 'ash_hoard'. */
  ending?: string;
  /** Extension: where the legend lives on. */
  homeTownId?: string;
};

export type HearthWorldFile = {
  format: 'hearthfall.world';
  version: number;
  createdAt: string;
  exporterName?: string;
  seed: number;
  contentHash: string;
  contentPackIds: string[];
  deltas: WorldDelta[];
  imprint: ProtagonistImprint | null;
  /** True when unknown delta kinds may be skipped on import. */
  compatible?: boolean;
  /** Digest of delta-covered world state, verified after replay. */
  worldDigest?: string;
};

export type BondLedger = {
  events: Record<string, number>;
  resentment: number;
  lastMethod?: string;
  lastInteractionId?: string;
};

export type Grave = { personId: string; name: string; townId?: string; epitaphId?: string; day: number };

export type LegacyInhabitant = Inhabitant & {
  tags: string[];
  methodWeights: Record<string, number>;
  displayName: string;
};

export type LegacyState = {
  bonds: Record<string, BondLedger>;
  methodCounts: Record<string, number>;
  lastMethodDay: Record<string, number>;
  touchedTowns: string[];
  growthTowns: string[];
  choices: { day: number; kind: string; summary: string }[];
  deltas: WorldDelta[];
  townRep: Record<string, { fear: number; trust: number }>;
  graves: Grave[];
  legends: string[];
  npcs: Record<string, LegacyInhabitant>;
  lineage: { imprint: ProtagonistImprint; ending: 'carry' | 'rest'; heirPersonId?: string }[];
  lastImprint: ProtagonistImprint | null;
  playerName?: string;
  /** Genuine-growth acts by the current life since succession (inherited_dependence decay). */
  growthSinceSuccession: number;
};
