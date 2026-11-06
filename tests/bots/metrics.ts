export type TickTrace = {
  tick: number;
  fingerprint: string;
  actionCount: number;
  meaningfulChoices: number;
  methodId?: string;
  burnedOut: boolean;
  hollowCount: number;
  reignitedCount: number;
};

export type RunSummary = {
  burnedOut: boolean;
  hollowCount: number;
  reignitedCount: number;
};

export type Thresholds = {
  stuckTicks: number;
  boredomTicks: number;
  methodDominanceCap: number;
  defaultSeeds?: number[];
  maxTicksPerRun?: number;
};

/** Stuck: fingerprint unchanged for N consecutive ticks while actions empty or identical. */
export function detectStuck(traces: TickTrace[], thresholds: Thresholds): boolean {
  const N = thresholds.stuckTicks;
  if (traces.length < N) return false;
  for (let end = N - 1; end < traces.length; end++) {
    const window = traces.slice(end - N + 1, end + 1);
    const fp = window[0]!.fingerprint;
    const allSameFp = window.every((t) => t.fingerprint === fp);
    const noProgress = window.every(
      (t) => t.actionCount === 0 || t.actionCount === window[0]!.actionCount,
    );
    if (allSameFp && noProgress) return true;
  }
  return false;
}

/** Boredom: ≥ N ticks with meaningfulChoices ≤ 1. */
export function detectBoredom(traces: TickTrace[], thresholds: Thresholds): boolean {
  const N = thresholds.boredomTicks;
  if (traces.length < N) return false;
  for (let end = N - 1; end < traces.length; end++) {
    const window = traces.slice(end - N + 1, end + 1);
    if (window.every((t) => t.meaningfulChoices <= 1)) return true;
  }
  return false;
}

export function methodDominance(
  traces: TickTrace[],
  thresholds: Thresholds,
): { maxPickRate: number; dominantMethodId: string | null; breached: boolean } {
  const picks = traces.map((t) => t.methodId).filter((id): id is string => Boolean(id));
  if (picks.length === 0) {
    return { maxPickRate: 0, dominantMethodId: null, breached: false };
  }
  const counts = new Map<string, number>();
  for (const id of picks) counts.set(id, (counts.get(id) ?? 0) + 1);
  let dominantMethodId: string | null = null;
  let max = 0;
  for (const [id, n] of counts) {
    if (n > max) {
      max = n;
      dominantMethodId = id;
    }
  }
  const maxPickRate = max / picks.length;
  return {
    maxPickRate,
    dominantMethodId,
    breached: maxPickRate > thresholds.methodDominanceCap,
  };
}

export function burnoutRate(runs: RunSummary[]): number {
  if (runs.length === 0) return 0;
  return runs.filter((r) => r.burnedOut).length / runs.length;
}

export function hollowVsReignited(
  runs: RunSummary[],
): { hollow: number; reignited: number } {
  return runs.reduce(
    (acc, r) => ({
      hollow: acc.hollow + r.hollowCount,
      reignited: acc.reignited + r.reignitedCount,
    }),
    { hollow: 0, reignited: 0 },
  );
}
