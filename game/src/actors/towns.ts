/**
 * A coarse grid over the settlements so actors only ever look at the towns near the camera or a point,
 * never the whole map. Also the camera rect helper every actor layer culls against.
 */
import type Phaser from 'phaser';
import { TILE_PX } from '../sim/map/constants';
import type { LayoutSettlement } from '../sim/map/world-layout';
import type { Pt } from '../app/contracts';

const CELL = 64 * TILE_PX;
/** How far a town's folk roam from its centre (px); towns farther than this from the view sleep. */
export const TOWN_RADIUS = 18 * TILE_PX;

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export const footOf = (q: number, r: number): Pt => ({ x: q * TILE_PX + TILE_PX / 2, y: r * TILE_PX + TILE_PX });

export type TownIndex = {
  all: LayoutSettlement[];
  byId: Map<string, LayoutSettlement>;
  centre(id: string): Pt | undefined;
  /** Towns whose roaming circle touches a rect. */
  inRect(r: Rect): LayoutSettlement[];
  /** Nearest town within `max` px of a point. */
  nearest(p: Pt, max: number): LayoutSettlement | null;
};

export function createTownIndex(settlements: LayoutSettlement[]): TownIndex {
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const cells = new Map<string, LayoutSettlement[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  for (const s of settlements) {
    const f = footOf(s.q, s.r);
    const k = key(Math.floor(f.x / CELL), Math.floor(f.y / CELL));
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(s);
  }
  const inRect = (r: Rect): LayoutSettlement[] => {
    const out: LayoutSettlement[] = [];
    const cx0 = Math.floor((r.x0 - TOWN_RADIUS) / CELL), cx1 = Math.floor((r.x1 + TOWN_RADIUS) / CELL);
    const cy0 = Math.floor((r.y0 - TOWN_RADIUS) / CELL), cy1 = Math.floor((r.y1 + TOWN_RADIUS) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      for (const s of cells.get(key(cx, cy)) ?? []) {
        const f = footOf(s.q, s.r);
        const dx = Math.max(r.x0 - f.x, 0, f.x - r.x1), dy = Math.max(r.y0 - f.y, 0, f.y - r.y1);
        if (dx * dx + dy * dy <= TOWN_RADIUS * TOWN_RADIUS) out.push(s);
      }
    }
    return out;
  };
  return {
    all: settlements,
    byId,
    centre: (id) => { const s = byId.get(id); return s ? footOf(s.q, s.r) : undefined; },
    inRect,
    nearest(p, max) {
      let best: LayoutSettlement | null = null, bd = max;
      for (const s of inRect({ x0: p.x - max, y0: p.y - max, x1: p.x + max, y1: p.y + max })) {
        const f = footOf(s.q, s.r);
        const d = Math.hypot(f.x - p.x, f.y - p.y);
        if (d <= bd) { bd = d; best = s; }
      }
      return best;
    },
  };
}

/** The camera's world view grown by a margin (px). */
export function viewRect(scene: Phaser.Scene, margin: number): Rect {
  const v = scene.cameras.main.worldView;
  return { x0: v.x - margin, y0: v.y - margin, x1: v.x + v.width + margin, y1: v.y + v.height + margin };
}

export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
