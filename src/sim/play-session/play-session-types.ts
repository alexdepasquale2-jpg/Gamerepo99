import type { UnspokenState } from '../social/unspoken-types';
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
  /** Social graph 06: Blessings and Burdens state (deep copy). */
  unspoken?: UnspokenState;
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
  /** Presentation read: subscribe to every juice event (id + payload). Returns unsubscribe. */
  onJuice(handler: (id: string, payload: unknown) => void): () => void;
  /** Presentation read: per-town despair 0..1 (copy). */
  townDespair(): Record<string, number>;
  /** Succession screen data; null while the run is not at a succession offer. */
  successionOffer(): import('../legacy/flow').SuccessionOffer | null;
  /** Succession buttons: delegate to legacy carryItOn / letItRest. */
  chooseSuccession(choice: 'continue' | 'quit'): import('../legacy/flow').SuccessionResult;
};
export type CreatePlaySessionOpts =
  | { mode: 'inspect'; seed: number; peopleCount?: number }
  | {
      mode: 'play';
      seed: number;
      archetypeId?: string;
      peopleCount?: number;
      /**
       * @deprecated Interaction compat is always on: method acts resolve via resolveInteraction
       * (legacy commitMethod spark-spend path removed). Accepted for callers that still pass `true`.
       */
      interactionCompat?: boolean;
    };
