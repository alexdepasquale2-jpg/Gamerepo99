export type StyleId = 'savage' | 'kind' | 'mixed';

export type ActionOption = {
  id: string;
  family?: string;
};

export type PickContext = {
  spark?: number;
};

export type StylePolicy = {
  pick(actions: ActionOption[], rng: () => number, ctx?: PickContext): string | null;
};

/** Family weight tables — higher weight = preferred. No archetype branches. */
const WEIGHTS: Record<StyleId, Record<string, number>> = {
  savage: { savage: 10, mixed: 2, kind: 1, rest: 2, travel: 2, noop: 0.1 },
  kind: { kind: 10, mixed: 2, savage: 1, rest: 5, travel: 3, noop: 0.1 },
  mixed: { mixed: 10, savage: 3, kind: 3, rest: 3, travel: 3, noop: 0.1 },
};

const REST_TRAVEL = new Set(['rest', 'travel']);

function sparkBoost(spark: number | undefined, family: string | undefined): number {
  if (spark === undefined || !family || !REST_TRAVEL.has(family)) return 1;
  if (spark <= 20) return 20;
  if (spark <= 40) return 8;
  return 1;
}

function weightFor(style: StyleId, family: string | undefined, spark?: number): number {
  const table = WEIGHTS[style];
  const base = !family ? 1 : (table[family] ?? 1);
  return base * sparkBoost(spark, family);
}

function weightedPick(
  actions: ActionOption[],
  rng: () => number,
  style: StyleId,
  spark?: number,
): string {
  const scored = actions.map((a) => ({
    id: a.id,
    w: weightFor(style, a.family, spark),
  }));
  const total = scored.reduce((sum, s) => sum + s.w, 0);
  if (total <= 0) return scored[0]!.id;
  let roll = rng() * total;
  if (roll < 0) roll = 0;
  if (roll >= total) roll = total - Number.EPSILON;
  for (const s of scored) {
    roll -= s.w;
    if (roll < 0) return s.id;
  }
  return scored[scored.length - 1]!.id;
}

export function createStylePolicy(style: StyleId): StylePolicy {
  return {
    pick(actions, rng, ctx) {
      if (actions.length === 0) return null;
      const spark = ctx?.spark;
      // Ember survival: hard prefer rest before succession/burnout (≤25).
      if (spark !== undefined && spark <= 25) {
        const restOnly = actions.filter((a) => a.family === 'rest');
        if (restOnly.length > 0) {
          return weightedPick(restOnly, rng, style, spark);
        }
      }
      return weightedPick(actions, rng, style, spark);
    },
  };
}
