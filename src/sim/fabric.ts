/** Public Fabric API facade — gen shape + dyn voice; bake lines on worldgen path. */

export {
  generateWorld,
  generatePeople,
  generatePersonDraft,
} from './fabric/fabric-bake';

export type {
  FabricWorld,
  GenerateWorldOpts,
  KinEdge,
  GapSite,
  HistoryEvent,
  AssertionResult,
} from './gen/world';

export type {
  PersonDraft,
  GeneratePeopleOpts,
  GeneratePersonDraftOpts,
} from './gen/society/people';

export {
  interpolateLine,
  assertVoice,
  runFabricAssertions,
  type FabricLine,
} from './dyn/voice';

export {
  assertLineCandidate,
  assertWorldCoherence,
  personMemoryTags,
  type LinePerson,
  type LineFragment,
  type VoiceConstraintsInput,
  type CoherenceWorld,
  type WorldCoherenceResult,
} from './dyn/coherence';

export {
  dumpWorld,
  type WorldDump,
  type InspectSnapshot,
  type InspectSession,
} from './fabric/world-dump';

export {
  createPlaySession,
  type CreatePlaySessionOpts,
  type PlaySession,
  type PlaySnapshot,
  type PlayAction,
  type PlayEvent,
} from './play-session';
