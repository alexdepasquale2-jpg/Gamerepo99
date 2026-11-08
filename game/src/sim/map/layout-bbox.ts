/** Padded bounding box around a layout's settlements (for biome fill). Pure. */
import type { WorldLayout } from './world-layout';

/** Extra padding around layout AABB for biome fill. */
const LAYOUT_PAD = 40;

export function layoutBBox(layout: WorldLayout): {
  q0: number;
  r0: number;
  q1: number;
  r1: number;
} {
  let q0 = Infinity;
  let r0 = Infinity;
  let q1 = -Infinity;
  let r1 = -Infinity;
  for (const s of layout.settlements) {
    q0 = Math.min(q0, s.q);
    r0 = Math.min(r0, s.r);
    q1 = Math.max(q1, s.q);
    r1 = Math.max(r1, s.r);
  }
  if (!Number.isFinite(q0)) return { q0: 0, r0: 0, q1: 0, r1: 0 };
  return {
    q0: q0 - LAYOUT_PAD,
    r0: r0 - LAYOUT_PAD,
    q1: q1 + LAYOUT_PAD,
    r1: r1 + LAYOUT_PAD,
  };
}
