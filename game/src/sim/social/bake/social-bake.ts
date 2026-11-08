/**
 * OFFLINE bake entry: writes social-web.json + social-centrality.json for a seed
 * (03 §Order steps 2, 7, 8). Run: `npm run bake:social`.
 * Runtime modules must not import this file (enforced in tests/sim/social). The
 * pure builder it wraps lives in ../social-web-build so that a new world can
 * build its own web at boot.
 */
export {
  betweenness,
  buildSocialWeb as bakeSocialWeb,
  computeCentrality,
  DEFAULT_GEN_COUNT,
  DEFAULT_SOCIAL_SEED,
  eigenvector,
  INFLUENTIAL_QUANTILE,
} from '../social-web-build';
