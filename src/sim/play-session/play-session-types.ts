import type { FabricWorld } from '../gen/world-types';
/** Play session public types (soft-cap extract from play-session). */

import type { ScenarioPersonView } from '../scenario/scenario-resolve';

export type PlayAction = { id: string; family?: string };
export type PlayEvent = { type: string; methodId?: string };
export type PlaySnapshot = {
  tick: number;
  day: number;
  spark: number;
  burnedOut: boolean;
  townId: string;
  townCount: number;
  fingerprint: string;
  reignitedCount: number;
  hollowCount: number;
};
export type PlayMetrics = {
  firstChoiceAtTick?: number;
  firstConsequenceAtTick?: number;
};
export type PlayLastResolve = {
  flameDelta: number;
  sparkCost: number;
  kind: 'resolved' | 'refused';
  marks?: { markId: string; stacks: number }[];
  personId?: string;
  methodId?: string;
};
export type PlaySession = {
  start(opts?: { seed?: number; archetypeId?: string }): void;
  listActions(): PlayAction[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): PlaySnapshot;
  events(): PlayEvent[];
  listRoutes(): string[];
  travel(routeId: string): void;
  dump(): string;
  getWorld(): FabricWorld | null;
  getSeed(): number;
  listPeople(): ScenarioPersonView[];
  metrics(): PlayMetrics;
  lastResolve(): PlayLastResolve | undefined;
};
export type CreatePlaySessionOpts =
  | { mode: 'inspect'; seed: number; peopleCount?: number }
  | { mode: 'play'; seed: number; archetypeId?: string; peopleCount?: number };
