/**
 * Foot-Y depth sort (origin bottom-centre, depth = world y of the foot), shared by every world sprite.
 * Actors use the same rule (depth = foot y), so people sort among props and buildings.
 */
import { TILE_PX } from '../sim/map/constants';

/**
 * Ground chunks sit far below every y-sorted thing. Sprites take depth = world y, which is negative
 * north of the origin (new worlds put towns there); at ground depth 0 they vanished under it.
 */
export const GROUND_DEPTH = -1e9;
/** Flat marks on the ground (plot stakes, chest shadow) sit just above it, under every standing thing. */
export const DECAL_DEPTH = -1e8;
/** Sky-level things (birds, smoke) always draw over the y-sorted world. */
export const SKY_DEPTH = 5e8;

export type Pt = { x: number; y: number };

/** Foot contact of a tile: bottom-centre of the cell (fractional tiles allowed). */
export const tileFoot = (q: number, r: number): Pt => ({ x: q * TILE_PX + TILE_PX / 2, y: r * TILE_PX + TILE_PX });

/** Bottom-centre origin and foot-y depth (plus a small bias to break ties). */
export function sortAt<T extends { setOrigin(x: number, y: number): T; setDepth(d: number): T; y: number }>(obj: T, bias = 0): T {
  return obj.setOrigin(0.5, 1).setDepth(obj.y + bias);
}
