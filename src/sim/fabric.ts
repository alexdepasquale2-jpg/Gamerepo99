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
} from './gen/people';

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
  createPlaySession,
  type WorldDump,
  type InspectSnapshot,
  type InspectSession,
  type CreatePlaySessionOpts,
} from './fabric/world-dump';

