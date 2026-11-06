export type StyleId = 'savage' | 'kind' | 'mixed';

export type ActionOption = {
  id: string;
  family?: string;
};

export type StylePolicy = {
  pick(actions: ActionOption[], rng: () => number): string | null;
};

/** Family weight tables — higher weight = preferred. No archetype branches. */
const WEIGHTS: Record<StyleId, Record<string, number>> = {
  savage: { savage: 10, mixed: 2, kind: 1, rest: 2, travel: 2, noop: 0.1 },
  kind: { kind: 10, mixed: 2, savage: 1, rest: 5, travel: 3, noop: 0.1 },
  mixed: { mixed: 10, savage: 3, kind: 3, rest: 3, travel: 3, noop: 0.1 },
};

function weightFor(style: StyleId, family: string | undefined): number {
  const table = WEIGHTS[style];
  if (!family) return 1;
  return table[family] ?? 1;
}

export function createStylePolicy(style: StyleId): StylePolicy {
  return {
    pick(actions, rng) {
      if (actions.length === 0) return null;
      const scored = actions.map((a) => ({
        id: a.id,
        w: weightFor(style, a.family),
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
    },
  };
}
