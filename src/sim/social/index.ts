/** Social graph runtime (spec 2026-11-06-social-graph 05). Bake helpers live in ./bake (offline). */
export {
  addEdge,
  createSocialGraph,
  hopDistancesFrom,
  introduce,
  mapLegacyKind,
  meanHopDistance,
  normalizeSocialEdge,
  shortestPath,
  walkCascade,
} from './social-graph';
export type { Neighbor, SocialGraph } from './social-graph';
export { getCentrality, isInfluential, pickRumorNext, preferInfluential } from './centrality';
export { weaveSocialWeb } from './worldgen-weave';
export type { WeaveOpts, WeaveResult } from './worldgen-weave';
export {
  comeToPassUnspoken,
  createUnspokenState,
  decayUnspoken,
  encodeUnspoken,
  encodeUnspokenForState,
  surfaceUnspokenInReply,
  tickUnspokenDawn,
  witnessOutcome,
} from './unspoken';
export type { ComeToPassCtx, EncodeCtx } from './unspoken';
export type {
  BlessingsBurdensTuning,
  ComeToPassOutcome,
  ComeToPassResult,
  UnspokenClass,
  UnspokenInstance,
  UnspokenState,
  UnspokenTables,
} from './unspoken-types';
export { DEFAULT_SOCIAL_PROPAGATION, SOCIAL_EDGE_KINDS } from './social-types';
export type {
  CascadeHit,
  CascadePayload,
  CascadePolarity,
  CentralityRow,
  CentralityTable,
  SocialEdge,
  SocialEdgeKind,
  SocialPropagation,
  SocialWebTable,
} from './social-types';
