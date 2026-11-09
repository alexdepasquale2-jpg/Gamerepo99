/**
 * Civic ground, for world/civic-marks:
 *   storeSpots  where a town's common granary and storehouse stand: the nearest clear plaza ground to the
 *               signpost and the noticeboard, clear of every stamp the plan put down (buildings, gardens,
 *               fences, walls, the graveyard, road tiles), of the plaza's furniture and the marks drawn
 *               around it, and of each other. A pure function of the town's plan, so the same every visit.
 *   zone tints  a faint wash of each lot's zone colour over its plot cells (the stakes' colours), drawn
 *               only for towns near the camera: one Graphics of row runs per town.
 * Render only: reads the sim, never writes it.
 */
import type Phaser from 'phaser';
import { TILE_PX } from '../sim/map/constants';
import { planFootprints, townPlan, type PlanRect } from '../sim/map/town-plan';
import { lotOf } from '../sim/civic/zoning';
import { CELL_TILES, PLANS } from '../sim/economy/build-plans';
import { DECAL_DEPTH, type Pt } from './depth';
import type { TownSpots } from './town-spots';

const T = TILE_PX;
/** A store's ground in tiles about its foot: the building's art (about 2 x 2.2 tiles) and its sacks or crates out front. */
const STORE = { half: 1.15, up: 2.3, down: 0.5 };
/** Clear ground kept round everything else, so roofs and eaves never touch. */
const GAP = 0.3;
/** Candidate feet: every half tile this far from the centre (inside the plan's 11-tile limit, with room for the art). */
const REACH = 9.5;

const box = (q: number, r: number, w: number, up: number, down = 0.3): PlanRect => ({ x0: q - w / 2, y0: r - up, x1: q + w / 2, y1: r + down });
const span = (x0: number, x1: number, r: number, up: number, down = 0.3): PlanRect => ({ x0, y0: r - up, x1, y1: r + down });
const hits = (a: PlanRect, b: PlanRect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const storeRect = (q: number, r: number): PlanRect => ({ x0: q - STORE.half, y0: r - STORE.up, x1: q + STORE.half, y1: r + STORE.down });

export type StoreSpots = { granary: Pt; storehouse: Pt };
const spotCache = new WeakMap<TownSpots, StoreSpots>();

/** The town's granary (by the signpost) and storehouse (by the noticeboard), on clear plaza ground. */
export function storeSpots(t: TownSpots): StoreSpots {
  const hit = spotCache.get(t);
  if (hit) return hit;
  const tile = (p: Pt) => ({ q: (p.x - t.centre.x) / T, r: (p.y - t.centre.y) / T });
  const hearth = tile(t.hearth), board = tile(t.board), sign = tile(t.signpost);
  const stall = tile(t.stall), well = tile(t.well), chest = tile(t.chest), spawn = tile(t.spawn);
  const taken: PlanRect[] = [
    ...planFootprints(t.town, townPlan(t.town)),
    // The noticeboard and the levy poster to its right; the signpost, the tier pole left of it, the war sign right.
    span(board.q - 0.9, board.q + 1.9, board.r, 1.7),
    span(sign.q - 1.9, sign.q + 1.4, sign.r, 1.9),
    // The hearth with the war banner and pact ribbon either side, and the town's goods piles in rows below it.
    span(hearth.q - 1.6, hearth.q + 1.6, hearth.r, 1.4),
    span(hearth.q - 2.2, hearth.q + 2.2, hearth.r + 3.4, 1.6),
    box(stall.q, stall.r, 2.6, 2.2), box(well.q, well.r, 1.8, 1.7), box(chest.q, chest.r, 1.2, 1), box(spawn.q, spawn.r, 1.2, 1.2),
  ].map((r) => ({ x0: r.x0 - GAP, y0: r.y0 - GAP, x1: r.x1 + GAP, y1: r.y1 + GAP }));
  const find = (near: { q: number; r: number }): { q: number; r: number } | null => {
    let best: { q: number; r: number } | null = null, bd = Infinity;
    for (let q = -REACH; q <= REACH; q += 0.5) for (let r = -REACH + STORE.up; r <= REACH; r += 0.5) {
      const rect = storeRect(q, r);
      if (taken.some((x) => hits(rect, x))) continue;
      // Nearest its fixture, then nearest the hearth (it belongs on the plaza); the scan order breaks ties.
      const d = Math.hypot(q - near.q, r - near.r) + 0.35 * Math.hypot(q - hearth.q, r - hearth.r);
      if (d < bd - 1e-9) { bd = d; best = { q, r }; }
    }
    return best;
  };
  const px = (p: { q: number; r: number }): Pt => ({ x: Math.round(t.centre.x + p.q * T), y: Math.round(t.centre.y + p.r * T) });
  // No clear ground at all (a crowded city on a crossroads): fall back to behind the fixtures, as before.
  const g = find(sign) ?? { q: sign.q, r: sign.r - 2.3 };
  const r = storeRect(g.q, g.r);
  taken.push({ x0: r.x0 - GAP, y0: r.y0 - GAP, x1: r.x1 + GAP, y1: r.y1 + GAP });
  const h = find(board) ?? { q: board.q, r: board.r - 2.3 };
  const out = { granary: px(g), storehouse: px(h) };
  spotCache.set(t, out);
  return out;
}

// ---- Zone tints ----

/** The stakes' colours (art/civic-art zone-*), as a wash. */
const TINT: Record<string, number> = { farm: 0xc8a830, craft: 0x8a5a3a, market: 0xc8423a, civic: 0x4a6aa8, housing: 0x6a9a4a };
const TINT_ALPHA = 0.15;
/** Towns whose centre is this close to the camera's middle get their tints (the outer ring reaches 36 tiles). */
const NEAR = T * 64;

/** Draw one town's lot tints: each row of cells as runs of one lot, so a town is about a hundred rects. */
export function drawZoneTints(scene: Phaser.Scene, t: TownSpots, zones: string[]): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DECAL_DEPTH - 1);
  const R = PLANS.maxRing, inner = PLANS.centerRadius;
  // Plot cells as build-plans/borders count them: cell (dx, dy) spans tiles town + dx*CELL_TILES onward.
  const x0 = t.town.q * T, y0 = t.town.r * T, cell = CELL_TILES * T;
  for (let dy = -R; dy <= R; dy++) {
    let run: { lot: number; from: number } | null = null;
    const flush = (to: number) => {
      if (!run) return;
      const z = zones[run.lot];
      if (z && TINT[z] !== undefined) g.fillStyle(TINT[z]!, TINT_ALPHA).fillRect(x0 + run.from * cell, y0 + dy * cell, (to - run.from) * cell, cell);
      run = null;
    };
    for (let dx = -R; dx <= R + 1; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      const lot = dx <= R && ring > inner ? lotOf(dx, dy) : -1;
      if (run && run.lot === lot) continue;
      flush(dx);
      if (lot >= 0) run = { lot, from: dx };
    }
  }
  return g;
}

export const nearCamera = (cam: Phaser.Cameras.Scene2D.Camera, t: TownSpots): boolean =>
  Math.hypot(t.centre.x - cam.midPoint.x, t.centre.y - cam.midPoint.y) < NEAR;
