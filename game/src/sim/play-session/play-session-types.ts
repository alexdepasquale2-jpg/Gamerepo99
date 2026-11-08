import type { SaveBlob } from '../save';
import type { HearthWorldFile } from '../legacy/types';
import type { SimState } from '../types/runtime';
import type { UnspokenState } from '../social/unspoken-types';
import type { FabricWorld } from '../gen/world-types';
/** Play session public types (soft-cap extract from play-session). */

import type { ScenarioPersonView } from '../scenario/scenario-resolve';

export type PlayAction = { id: string; family?: string; label?: string };
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
  /** Every act on offer (whole world); with `personId`, only that person's acts are built. */
  listActions(personId?: string): PlayAction[];
  /** Ring verbs for one target (a person, or a thing the scene hands over with its data). No legacy method ids. */
  listVerbs(target: import('./targets').Target): import('./verb-families').Verb[];
  /**
   * Resolve an act id: `<verb>@<personId>`, `<verb>@<kind>:<id>` (pass the scene's target for things),
   * advance:*, travel:*. Target acts return what happened (a line, ok); others return undefined.
   */
  act(actionId: string, target?: import('./targets').Target): import('./action-providers').ActOutcome | undefined;
  tick(): void;
  snapshot(): PlaySnapshot;
  events(): PlayEvent[];
  listRoutes(): string[];
  /** Walk a road: every road day runs the world's dawn (same as journey(routeId)). */
  travel(routeId: string): void;
  /** Roads out of the player's town with today's travellers for hire (seeded per seed/day/route). */
  roads(): import('../travel/journey').RoadView[];
  /**
   * Take a road on foot, or with one of today's travellers (tradeId). Moves the player to the far town.
   * `plan`: walk beside a cart to its town instead (escortCartId), or stop a night at a waystation (stopAt).
   */
  journey(routeId: string, tradeId?: string, plan?: Pick<import('../travel/journey').JourneyOpts, 'escortCartId' | 'stopAt'>): import('../travel/journey').JourneyResult | null;
  /** Trunk roads from the district you are in to each neighbouring district (seat to seat, days on the road). */
  trunkRoads(): ReturnType<typeof import('../realm').trunkRoads>;
  /** The district you are in. */
  district(): import('../realm').DistrictRef;
  /** Take a trunk road: its days pass here, then the district swaps (see enterDistrict). */
  journeyDistrict(to: import('../realm').DistrictRef): { ok: true; days: number; townId: string; name: string } | null;
  /** Leave this district for another: this one freezes, that one thaws (or is born from the seed); returns where you stand. */
  enterDistrict(to: import('../realm').DistrictRef): string | null;
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
  /** M6 saves: one full-state blob out (saveState). */
  saveBlob(): SaveBlob | null;
  /** M6 saves: load path — replaces state, rebuilds the interaction runtime. */
  loadBlob(blob: SaveBlob): void;
  /** M6 world files: export current world / adopt an imported SimState. */
  worldFile(opts?: { exporterName?: string; createdAt?: string }): HearthWorldFile | null;
  adoptState(state: SimState): void;
  /** Live sim state (render-side goods/nodes read + mutate through sim helpers). */
  getState(): SimState | undefined;
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
