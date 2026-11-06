/** Sample shapes for fabric quality metrics (Probe). */

export type FabricPersonSample = {
  id: string;
  fingerprint: string;
  vector?: Record<string, number>;
  lines?: LineSample[];
};

export type LineSample = {
  id: string;
  text: string;
};

export type KinEdgeSample = { from: string; to: string; kind?: string };

export type GapSiteSample = { id: string; gap01: number };

export type HistoryEventSample = {
  id: string;
  at?: number;
  tags?: string[];
  personIds?: string[];
};

export type AssertionSample = {
  ok: boolean;
  violationId?: string;
  message?: string;
};

export type FabricWorldSample = {
  seed: number;
  fingerprint: string;
  people: FabricPersonSample[];
  lines?: LineSample[];
  history?: HistoryEventSample[];
  historyCoherence?: number;
  kinEdges?: KinEdgeSample[];
  gapSites?: GapSiteSample[];
  assertions?: AssertionSample[];
};
