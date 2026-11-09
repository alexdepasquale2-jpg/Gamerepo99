import type { BuildingKind } from './types';

export const TUG_SWALLOW_MS = 700;
export const TUG_MARGIN = 0.18;
export const TUG_PULL = 150;
export const TUG_SWALLOW_RADIUS = 42;

export type TugSide = {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  strength: number;
};

export type TugResolution = {
  winnerId: string | null;
  margin: number;
  stalemate: boolean;
  swallow: boolean;
  pullX: number;
  pullY: number;
};

/**
 * Two or more buildings pulling one prize.
 * A clear margin held long enough, with the winner close, swallows.
 * A near-tie flips direction so the body yanks back and forth.
 */
export function resolveTug(
  sides: readonly TugSide[],
  playerX: number,
  playerY: number,
  contestMs: number,
): TugResolution {
  if (sides.length === 0) {
    return { winnerId: null, margin: 0, stalemate: false, swallow: false, pullX: 0, pullY: 0 };
  }
  const ranked = [...sides].sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const winner = ranked[0]!;
  const second = ranked[1];
  const margin = second ? (winner.strength - second.strength) / winner.strength : 1;
  let px = 0;
  let py = 0;
  for (const side of sides) {
    const dx = side.x - playerX;
    const dy = side.y - playerY;
    const d = Math.hypot(dx, dy) || 1;
    px += (dx / d) * side.strength;
    py += (dy / d) * side.strength;
  }
  const plen = Math.hypot(px, py) || 1;
  let pullX = (px / plen) * TUG_PULL;
  let pullY = (py / plen) * TUG_PULL;
  const stalemate = Boolean(second) && margin < TUG_MARGIN;
  if (stalemate) {
    const flip = Math.floor(contestMs / 180) % 2 === 0 ? 1 : -1;
    pullX *= 0.55 * flip;
    pullY *= 0.55 * flip;
  }
  const distWinner = Math.hypot(winner.x - playerX, winner.y - playerY);
  const swallow = sides.length >= 2 && !stalemate && contestMs >= TUG_SWALLOW_MS && distWinner <= TUG_SWALLOW_RADIUS;
  return {
    winnerId: stalemate ? null : winner.id,
    margin,
    stalemate,
    swallow,
    pullX,
    pullY,
  };
}

/** Input aimed against the pull weakens every hand on the rope. */
export function struggleScale(ix: number, iy: number, pullX: number, pullY: number): number {
  if (ix === 0 && iy === 0) return 1;
  const dot = ix * pullX + iy * pullY;
  return dot < 0 ? 0.7 : 1;
}
