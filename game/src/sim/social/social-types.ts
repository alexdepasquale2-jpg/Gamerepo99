/** Social graph types (spec 2026-11-06-social-graph/01 + 02). Pure data shapes. */

export const SOCIAL_EDGE_KINDS = ['kin', 'trade', 'debt', 'friendship', 'rival'] as const;
export type SocialEdgeKind = (typeof SOCIAL_EDGE_KINDS)[number];

/**
 * Person↔person edge. Undirected for reach; for `debt`, a = debtor, b = creditor
 * (01: "directed creditor←debtor") — walkers treat it as undirected.
 */
export type SocialEdge = {
  id: string;
  a: string;
  b: string;
  kind: SocialEdgeKind;
  /** 0..1 */
  weight: number;
  tags?: string[];
  townBias?: string;
};

/** social-propagation.json (02 §Falloff). */
export type SocialPropagation = {
  falloff: number;
  maxHops: number;
  epsilon: number;
  /** Weight of a fresh `introduce` friendship edge. */
  introduceWeight: number;
};

export const DEFAULT_SOCIAL_PROPAGATION: SocialPropagation = {
  falloff: 0.55,
  maxHops: 6,
  epsilon: 0.02,
  introduceWeight: 0.3,
};

/** Prebaked web for one seed (social-web.json). */
export type SocialWebTable = {
  version: number;
  seed: number;
  meanHops: number;
  edges: SocialEdge[];
};

/** social-centrality.json row (01 §Centrality). Read-only at runtime. */
export type CentralityRow = {
  personId: string;
  betweenness: number;
  eigenvector: number;
  influential: boolean;
};

export type CentralityTable = {
  version?: number;
  seed?: number;
  /** Betweenness cut used for `influential` (top quantile). */
  threshold?: number;
  rows: CentralityRow[];
};

export type CascadePolarity = 'good' | 'bad';

export type CascadePayload = {
  baseStrength: number;
  polarity: CascadePolarity;
  /** Restrict walk to these edge kinds (e.g. bad grudge: rival+kin). Default: all. */
  kinds?: readonly SocialEdgeKind[];
};

export type CascadeHit = {
  personId: string;
  hop: number;
  /** Signed: good > 0, bad < 0. |strength| = base * falloff^hop * Πweights. */
  strength: number;
  /** Previous node on the best path. */
  via: string;
};
