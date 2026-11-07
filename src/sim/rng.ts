/** Mulberry32 seeded RNG — no Math.random. */

export type Rng = {
  next: () => number;
  /** Inclusive-exclusive integer in [min, max). Plan name. */
  int: (min: number, max: number) => number;
  /** Alias kept for M1 world/tick call sites. */
  nextInt: (min: number, max: number) => number;
  /** Raw stream position (save/load). */
  getState?: () => number;
  setState?: (s: number) => void;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max <= min) return min;
    return min + Math.floor(next() * (max - min));
  };

  return {
    next,
    int,
    nextInt: int,
    getState: () => state,
    setState: (s) => {
      state = s >>> 0;
    },
  };
}

/** Derive an independent stream from a seed + labels (FNV-1a over the parts). Pure. */
export function deriveRng(seed: number, ...parts: Array<string | number>): Rng {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return createRng(h);
}
