export { createRng } from './rng';
export type { Rng } from './rng';
export { deriveRng } from './rng';
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

/** M4 dawn economy LOD (packet-01). */
export { tickEconomyLod } from './economy';
export type {
  CaravanDawnHook,
  DoctrineSupplyHook,
  EconomyLodHooks,
  EconomyLodResult,
  TownEconomyState,
} from './economy';

/** Social graph 05: prebaked web, centrality table, falloff walk (no runtime ML). */
export {
  createSocialGraph,
  introduce,
  meanHopDistance,
  pickRumorNext,
  preferInfluential,
  shortestPath,
  walkCascade,
  weaveSocialWeb,
  createUnspokenState,
  encodeUnspokenForState,
  tickUnspokenDawn,
  witnessOutcome,
} from './social';
export type { UnspokenInstance, UnspokenState, UnspokenTables } from './social';
export type {
  CascadeHit,
  CascadePayload,
  CentralityTable,
  SocialEdge,
  SocialEdgeKind,
  SocialGraph,
  SocialPropagation,
} from './social';

export { townsFromDump } from './towns-from-dump';
export type { TownMarker } from './towns-from-dump';
export { getWorldRenderSnapshot } from './world-render-snapshot';
export type { WorldRenderSnapshot } from './world-render-snapshot';


export {
  resolveScenarioPerson,
  siteKindFromSiteId,
} from './scenario/scenario-resolve';
export type {
  ScenarioPersonQuery,
  ScenarioPersonView,
  ScenarioPeopleSource,
} from './scenario/scenario-resolve';
export type { PlayMetrics, PlayLastResolve } from './play-session/play-session-types';

/** Interaction model (spec: interaction migration) + method→interaction compat. */
export {
  createInteractionRuntime,
  resolveInteraction,
  REIGNITE_MIN_KINDS,
  createCompatRuntime,
  expandMethodAct,
  loadMigrationMap,
  loadInteractionTables,
} from './interaction';
export type {
  InteractionDef,
  InteractionResult,
  InteractionRuntime,
  InteractionRuntimeInit,
  InteractionScoring,
  InteractionTouch,
  MarkAdd,
  InteractionPerson,
  PromiseStatus,
  CompatRuntime,
  InteractionTables,
  MigrationTable,
} from './interaction';

/** Map TileSource seam (stamp now; native later). */
export { fingerprintHex } from './map/fingerprint';
export { createStampRasterSource } from './map/stamp-raster';
export { chunksAround } from './map/chunks-around';
export { layoutWorld } from './map/world-layout';
export type { WorldLayout, LayoutSettlement, LayoutRoute } from './map/world-layout';
export { CHUNK_SIZE, TILE_PX, TILES_PER_MINUTE, WALK_MINUTES_SPINE } from './map/constants';
export type { TileSource } from './map/tile-source';
export type {
  ChunkCoord,
  ChunkTiles,
  FacilityRenderView,
  TileRenderView,
} from './map/types';
export { tickCaravans, loadCaravanSchedules } from './caravans';
export type { CaravanMobile, CaravanScheduleRow, CaravanHeading } from './caravans-types';
export { tickHoardDawn, addNotoriety, detectEnding, applyStashAct, rollAttractors, ensureHoard } from './hoard';
export type { HoardState, StashRuntime } from './hoard';
export { pickHeir, carryItOn, letItRest, offerSuccession, exportWorld, importWorld, buildImprint, assembleFromImprint } from './legacy';
export type { HearthWorldFile, ProtagonistImprint, WorldDelta } from './legacy';
