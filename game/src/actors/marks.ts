/**
 * Marks read at a glance: the strongest mark's glyph by the name, and the body carries it too (a hollow
 * person slumps grey and slow, a resentful one goes ruddy and stiff, a grown one stands tall and warm).
 * And the doctrine leader of each town. Pure (no Phaser).
 */
import type { SimState } from '../sim/types/runtime';
import { ensureDoctrines } from '../sim/doctrine-tick';
import { leaderOf } from '../sim/contrib/power-page';

export type MarkTell = { markId: string; glyph: string; color: string };

/** One glyph + colour per mark. Order breaks stack ties: the heavier-to-carry mark shows first. */
const TELLS: readonly MarkTell[] = [
  { markId: 'dependence', glyph: '∞', color: '#e8a0c8' },
  { markId: 'resentment', glyph: '✕', color: '#d86a5a' },
  { markId: 'hollowness', glyph: '○', color: '#9aa0a8' },
  { markId: 'fragile_hope', glyph: '◇', color: '#f2d48a' },
  { markId: 'genuine_growth', glyph: '✦', color: '#f2b84b' },
];

/** The tell for the mark with the most stacks (ties by TELLS order); null when unmarked or unknown. */
export function strongestMarkTell(marks: readonly { markId: string; stacks: number }[] | undefined): MarkTell | null {
  let best: MarkTell | null = null;
  let bestStacks = 0;
  for (const t of TELLS) {
    const stacks = (marks ?? []).filter((m) => m.markId === t.markId).reduce((a, m) => a + m.stacks, 0);
    if (stacks > bestStacks) {
      best = t;
      bestStacks = stacks;
    }
  }
  return best;
}

/** How a mark sits in the body: tint (multiplied), height, lean (radians), tempo and breath. */
export type Posture = { tint: number; scaleY: number; lean: number; tempo: number; breath: number };
export const UPRIGHT: Posture = { tint: 0xffffff, scaleY: 1, lean: 0, tempo: 1, breath: 1 };

const POSTURE: Record<string, Posture> = {
  hollowness: { tint: 0xa8acb4, scaleY: 0.92, lean: 0.05, tempo: 0.7, breath: 0.4 },
  resentment: { tint: 0xffb8a8, scaleY: 1, lean: 0, tempo: 1.15, breath: 0.3 },
  dependence: { tint: 0xf4d0e4, scaleY: 0.96, lean: -0.07, tempo: 0.9, breath: 1 },
  fragile_hope: { tint: 0xfff0cc, scaleY: 1, lean: 0, tempo: 1, breath: 1.6 },
  genuine_growth: { tint: 0xfff2c8, scaleY: 1.05, lean: 0, tempo: 1.08, breath: 1.2 },
};

export const postureOf = (tell: MarkTell | null): Posture => (tell ? POSTURE[tell.markId] ?? UPRIGHT : UPRIGHT);

/** Every person who fronts a doctrine in their town (live compacts first; collapsed ones lead no one). */
export function doctrineLeaders(state: SimState | undefined): Set<string> {
  const out = new Set<string>();
  if (!state) return out;
  try {
    for (const d of Object.values(ensureDoctrines(state))) {
      if ((d as { collapsed?: boolean }).collapsed) continue;
      const id = leaderOf(state, d);
      if (id) out.add(id);
    }
  } catch {
    /* doctrine data missing: nobody leads */
  }
  return out;
}
