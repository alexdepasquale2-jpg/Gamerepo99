/** Public Fabric API facade — re-exports from gen/ and dyn/ only; no logic. */

export {
  generateWorld,
  type FabricWorld,
  type GenerateWorldOpts,
  type KinEdge,
  type GapSite,
  type HistoryEvent,
  type AssertionResult,
} from './gen/world';

export {
  generatePeople,
  generatePersonDraft,
  type PersonDraft,
  type GeneratePeopleOpts,
  type GeneratePersonDraftOpts,
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
