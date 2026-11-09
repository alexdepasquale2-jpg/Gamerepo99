/**
 * Where something left by the road comes to rest (a lost cart's wreck): on dry land beside the road, never in
 * the river or lake a crossing spans nor on the road itself. Render-side only; asks the world's roadsideLand.
 */
import type { Pt, WorldApi } from '../app/contracts';
import { TILE_PX } from '../sim/map/constants';

type Ground = Pick<WorldApi, 'tileOf' | 'foot' | 'roadsideLand'>;

/** How far from the road (tiles) counts as beside it: a river bridge's banks are a tile or two off. */
const BESIDE_TILES = 4;
/** Out on a long crossing (a lake's deck runs dozens of tiles), step along the road this far (route fraction) at a time. */
const ALONG_STEP = 0.003;
const ALONG_STEPS = 200;
/** Spots found, by road tile: the ground does not move, so the search runs once per wreck, not per refresh. */
const found = new Map<string, Pt>();
const FOUND_MAX = 256;

/**
 * `p + prefer` when that is roadside land, else the foot of the nearest roadside tile within BESIDE_TILES
 * (ties broken by a fixed scan order, so the spot never flickers), else null.
 */
function besideRoad(world: Ground, p: Pt, prefer: Pt): Pt | null {
  const ok = (at: Pt): boolean => world.roadsideLand!(at);
  const want = { x: p.x + prefer.x, y: p.y + prefer.y };
  if (ok(want)) return want;
  const t = world.tileOf(p);
  for (let rad = 1; rad <= BESIDE_TILES; rad++) {
    let best: Pt | null = null, bd = Infinity;
    for (let dr = -rad; dr <= rad; dr++) for (let dq = -rad; dq <= rad; dq++) {
      if (Math.max(Math.abs(dq), Math.abs(dr)) !== rad) continue;
      const f = world.foot({ q: t.q + dq, r: t.r + dr });
      // Stand a little above the tile's foot edge so the point reads as inside that tile.
      const at = { x: f.x, y: f.y - TILE_PX * 0.25 };
      if (!ok(at)) continue;
      const d = (at.x - want.x) ** 2 + (at.y - want.y) ** 2;
      if (d < bd) { bd = d; best = at; }
    }
    if (best) return best;
  }
  return null;
}

/**
 * The spot beside the road where something lost at `roadAt(0)` lies: on dry land beside that road point,
 * else — out on a crossing with water all round — beside the nearest stretch of the same road that has a
 * bank (it washes up where the crossing meets the shore; `roadAt(shift)` is the road point `shift` of the
 * route further on, null past its ends). With no bank anywhere along the road it stays on the road point (the
 * deck it was lost on: footing, not open water). A world without roadsideLand keeps the preferred offset.
 */
export function roadsideSpot(world: Ground, roadAt: (shift: number) => Pt | null, prefer: Pt): Pt | null {
  const p = roadAt(0);
  if (!p) return null;
  if (!world.roadsideLand) return { x: p.x + prefer.x, y: p.y + prefer.y };
  const t = world.tileOf(p);
  const key = `${t.q},${t.r},${prefer.x},${prefer.y}`;
  const hit = found.get(key);
  if (hit) return hit;
  let spot = besideRoad(world, p, prefer);
  for (let k = 1; !spot && k <= ALONG_STEPS; k++) {
    const ahead = roadAt(k * ALONG_STEP), behind = roadAt(-k * ALONG_STEP);
    if (!ahead && !behind) break;
    spot = (ahead && besideRoad(world, ahead, prefer)) || (behind && besideRoad(world, behind, prefer)) || null;
  }
  spot ??= p;
  if (found.size >= FOUND_MAX) found.clear();
  found.set(key, spot);
  return spot;
}
