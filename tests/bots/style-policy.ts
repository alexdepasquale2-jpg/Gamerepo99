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
  savage: { savage: 10, mixed: 2, kind: 1, noop: 0.1 },
  kind: { kind: 10, mixed: 2, savage: 1, noop: 0.1 },
  mixed: { mixed: 10, savage: 3, kind: 3, noop: 0.1 },
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
      const maxW = Math.max(...scored.map((s) => s.w));
      const top = scored.filter((s) => s.w === maxW);
      const idx = Math.min(top.length - 1, Math.floor(rng() * top.length));
      return top[idx]!.id;
    },
  };
}
