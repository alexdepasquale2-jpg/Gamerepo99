/** Pure fabric / worldgen quality metrics (Probe). No Forge imports. */

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

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function distinctRatio(keys: string[]): number {
  if (keys.length === 0) return 1;
  const unique = new Set(keys).size;
  // All collide → 0 (not 1/n); otherwise unique/n.
  if (unique === 1) return keys.length === 1 ? 1 : 0;
  return unique / keys.length;
}

function euclidean(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Mean pairwise normalized vector distance, or fingerprint distinct ratio. */
export function peopleDiversity(people: FabricPersonSample[]): number {
  if (people.length <= 1) return 1;
  const fps = people.map((p) => p.fingerprint);
  const fpRatio = distinctRatio(fps);
  if (fpRatio === 1) return 1;
  if (fpRatio === 0) {
    // all collide — try vectors
    const withVec = people.filter((p) => p.vector);
    if (withVec.length < 2) return 0;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < withVec.length; i++) {
      for (let j = i + 1; j < withVec.length; j++) {
        sum += euclidean(withVec[i]!.vector!, withVec[j]!.vector!);
        n++;
      }
    }
    // normalize by sqrt(dims) rough upper bound using first vector size
    const dims = Math.max(1, Object.keys(withVec[0]!.vector!).length);
    const mean = sum / n;
    return clamp01(mean / Math.sqrt(dims));
  }
  // mixed: blend fingerprint ratio with any vector signal
  return fpRatio;
}

/** Distinct world fingerprints / world count. */
export function worldDiversity(worlds: FabricWorldSample[]): number {
  if (worlds.length === 0) return 1;
  return distinctRatio(worlds.map((w) => w.fingerprint));
}

/**
 * History coherence in [0,1].
 * Prefers precomputed historyCoherence; else scores chronological order.
 */
export function historyCoherence(world: FabricWorldSample): number {
  if (typeof world.historyCoherence === 'number') {
    return clamp01(world.historyCoherence);
  }
  const events = world.history ?? [];
  if (events.length <= 1) return 1;
  const dated = events.filter((e) => typeof e.at === 'number');
  if (dated.length <= 1) return 1;
  let breaks = 0;
  for (let i = 1; i < dated.length; i++) {
    if ((dated[i]!.at as number) < (dated[i - 1]!.at as number)) breaks++;
  }
  const pairs = dated.length - 1;
  return clamp01(1 - breaks / pairs);
}

/**
 * Largest connected component size / people count (undirected kin graph).
 */
export function kinConnectedness(
  peopleIds: string[],
  edges: KinEdgeSample[],
): number {
  if (peopleIds.length <= 1) return 1;
  const adj = new Map<string, Set<string>>();
  for (const id of peopleIds) adj.set(id, new Set());
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  let largest = 0;
  const seen = new Set<string>();
  for (const start of peopleIds) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    let size = 0;
    while (stack.length) {
      const n = stack.pop()!;
      size++;
      for (const next of adj.get(n) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (size > largest) largest = size;
  }
  return largest / peopleIds.length;
}

/**
 * Spread along city↔village gap: (max - min) of gap01 values.
 * Collapsed poles → near 0; full span → near 1.
 */
export function gapSpread(sites: GapSiteSample[]): number {
  if (sites.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of sites) {
    const v = clamp01(s.gap01);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return clamp01(max - min);
}

export function assertionViolations(results: AssertionSample[]): number {
  return results.filter((r) => !r.ok).length;
}

export function assertionViolationRate(results: AssertionSample[]): number {
  if (results.length === 0) return 0;
  return assertionViolations(results) / results.length;
}

/** Structural deep-equal for determinism checks (JSON stable). */
export function determinismEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Fraction of lines that are duplicates of an earlier text
 * (extra copies beyond the first occurrence / total).
 */
export function repeatLineRate(lines: LineSample[]): number {
  if (lines.length === 0) return 0;
  const seen = new Set<string>();
  let dupes = 0;
  for (const line of lines) {
    const key = line.text;
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes / lines.length;
}
