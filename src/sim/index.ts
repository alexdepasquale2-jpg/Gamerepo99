export { createRng } from './rng';
export type { Rng } from './rng';
export { createEventBus } from './event-bus';
export type { EventBus, EventHandler, Unsubscribe } from './event-bus';
export { createWorld } from './world';
export type { World } from './world';
export { tick } from './tick';
export type { Npc, Tile, WorldConfig } from './types';
export { serializeSave, parseSave } from './save';
export type { SaveBlob } from './save';

/** Fabric public surface (also via ./fabric.ts). */
export {
  generateWorld,
  generatePeople,
  generatePersonDraft,
  interpolateLine,
  assertVoice,
  runFabricAssertions,
  assertLineCandidate,
  assertWorldCoherence,
  dumpWorld,
  createPlaySession,
} from './fabric';
export type {
  FabricWorld,
  GenerateWorldOpts,
  PersonDraft,
  FabricLine,
  AssertionResult,
  LinePerson,
  LineFragment,
  CoherenceWorld,
  WorldCoherenceResult,
  WorldDump,
  InspectSnapshot,
  InspectSession,
  CreatePlaySessionOpts,
  PlaySession,
  PlaySnapshot,
  PlayAction,
  PlayEvent,
} from './fabric';

export { townsFromDump } from './towns-from-dump';
export type { TownMarker } from './towns-from-dump';
export { getWorldRenderSnapshot } from './world-render-snapshot';
export type { WorldRenderSnapshot } from './world-render-snapshot';


export {
  resolveScenarioPerson,
  siteKindFromSiteId,
} from './scenario-resolve';
export type {
  ScenarioPersonQuery,
  ScenarioPersonView,
  ScenarioPeopleSource,
} from './scenario-resolve';
export type { PlayMetrics, PlayLastResolve } from './play-session-types';
