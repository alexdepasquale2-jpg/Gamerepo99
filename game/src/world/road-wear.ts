/**
 * The roads' condition, on the road itself (economy/roads: EconomyRouteState.condition, broken): a fair road
 * is clean; a worn one shows ruts and the odd pothole; a failing one is pitted and grassed over; a broken one
 * has a washout of rubble with a barrier across it at the break (the route's middle, where carts stop).
 * Marks are seeded per tile (no flicker, same for everyone) and drawn only for tiles in view, redrawn when
 * the view moves a tile or a road's state changes. Mending crews show at their work spot (things/work-spots).
 */
import type Phaser from 'phaser';
import type { MapPoint, WorldLayout } from '../sim/map/world-layout';
import type { TerrainAccess } from '../sim/map/terrain-access';
import type { SimState } from '../sim/types/runtime';
import { ROADS, roadAt } from '../sim/economy/roads';
import { TILE_PX } from '../sim/map/constants';
import { countVisual } from '../dev/visual-counts';
import { ART_SCALE, makeTex, strHash } from './art/px';
import { DECAL_DEPTH, tileFoot } from './depth';

const T = TILE_PX;
const BARRIER_TEX = 'w-road-barrier';

export type RoadWear = {
  update(cam: Phaser.Cameras.Scene2D.Camera, visible: boolean): void;
  list(): { routeId: string; word: string; tiles: number }[];
  /** Where each broken road's barrier stands (world px), drawn or not. */
  breakPoints(): { routeId: string; x: number; y: number }[];
  destroy(): void;
};

export function createRoadWear(o: { scene: Phaser.Scene; getState: () => SimState | undefined; layout: WorldLayout; terrain: TerrainAccess; roadPoint: (path: MapPoint[], f: number) => MapPoint }): RoadWear {
  const { scene } = o;
  makeTex(scene, BARRIER_TEX, 22, 14, (p) => {
    p.shadow(11, 10, 2).rect(2, 4, 2, 10, '#5a3a24').rect(18, 4, 2, 10, '#5a3a24');
    for (let i = 0; i < 5; i++) p.rect(1 + i * 4, 4, 2, 3, i % 2 ? '#e8e0c8' : '#a83a2a');
    p.rect(1, 3, 20, 1, '#3a2a1c').rect(1, 7, 20, 1, '#3a2a1c');
  });
  const g = scene.add.graphics().setDepth(DECAL_DEPTH + 0.5);
  const barriers = new Map<string, Phaser.GameObjects.Image>();
  const routes = new Map(o.layout.routes.map((r) => [r.id, r]));
  let key = '';
  let drawnTiles = new Map<string, number>();

  const draw = (s: SimState, cam: Phaser.Cameras.Scene2D.Camera): void => {
    g.clear();
    drawnTiles = new Map();
    const v = cam.worldView;
    const q0 = Math.floor(v.x / T) - 1, q1 = Math.ceil(v.right / T) + 1, r0 = Math.floor(v.y / T) - 1, r1 = Math.ceil(v.bottom / T) + 1;
    const cond = new Map((s.economyRoutes ?? []).map((r) => [r.id, r]));
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
      if (!o.terrain.onRoad(q, r) || o.terrain.inTown(q, r) || o.terrain.isBridge(q, r)) continue;
      const id = roadAt(o.layout, q, r);
      const route = id ? cond.get(id) : undefined;
      if (!route || (!route.broken && route.condition >= ROADS.wornBelow)) continue;
      // How bad: 0 just worn … 1 broken. More of the tiles carry marks the worse it is.
      const bad = route.broken ? 1 : Math.min(1, (ROADS.wornBelow - route.condition) / (ROADS.wornBelow - ROADS.breakBelow));
      const h = strHash(`${q},${r}`);
      if ((h % 100) / 100 > 0.35 + bad * 0.55) continue;
      drawnTiles.set(id!, (drawnTiles.get(id!) ?? 0) + 1);
      const x = q * T, y = r * T;
      // Potholes near the ribbon's middle (the drawn track is narrower than the tile), rain-filled when bad.
      const holes = 1 + Math.floor(bad * 2.5);
      for (let i = 0; i < holes; i++) {
        const hx = x + 10 + ((h >> (5 + i * 4)) % 13), hy = y + 10 + ((h >> (7 + i * 3)) % 12);
        g.fillStyle(0x3a2c1c, 0.75).fillEllipse(hx, hy, 6 + bad * 4, 3 + bad * 2);
        if (bad > 0.5) g.fillStyle(0x6a8a9a, 0.6).fillEllipse(hx, hy - 0.5, 3 + bad * 2.5, 1.5 + bad);
      }
      // A failing road greens over at its edges.
      if (bad > 0.4) { g.fillStyle(0x5a7a32, 0.7); g.fillRect(x + 8 + ((h >> 11) % 16), y + 8 + ((h >> 13) % 16), 3, 2); g.fillRect(x + 8 + ((h >> 15) % 16), y + 8 + ((h >> 17) % 16), 2, 2); }
      if (route.broken) {
        g.lineStyle(1, 0x1e1810, 0.8);
        g.beginPath(); g.moveTo(x + 8, y + 10 + (h % 6)); g.lineTo(x + 15, y + 16); g.lineTo(x + 24, y + 12 + ((h >> 4) % 8)); g.strokePath();
      }
    }
  };

  const breakAt = (routeId: string) => {
    const lr = routes.get(routeId);
    if (!lr) return null;
    const p = o.roadPoint(lr.path, 0.5);
    return tileFoot(Math.round(p.q), Math.round(p.r));
  };

  /** The barrier and washout at each broken road's middle, if in view. */
  const breaks = (s: SimState, cam: Phaser.Cameras.Scene2D.Camera, visible: boolean): number => {
    const v = cam.worldView;
    const seen = new Set<string>();
    for (const r of s.economyRoutes ?? []) {
      if (!r.broken || !visible) continue;
      const f = breakAt(r.id);
      if (!f) continue;
      if (f.x < v.x - 64 || f.x > v.right + 64 || f.y < v.y - 64 || f.y > v.bottom + 64) continue;
      seen.add(r.id);
      if (!barriers.has(r.id)) {
        barriers.set(r.id, scene.add.image(f.x, f.y, BARRIER_TEX).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(f.y));
        // The washout: rubble strewn across the road around the barrier.
        g.fillStyle(0x7a7a72, 1);
        for (let i = 0; i < 9; i++) g.fillEllipse(f.x - 30 + ((strHash(r.id + i) % 60)), f.y - 14 + (strHash(r.id + 'y' + i) % 22), 6, 4);
      }
    }
    for (const [id, b] of barriers) if (!seen.has(id)) { b.destroy(); barriers.delete(id); }
    return seen.size;
  };

  let since = 1;
  return {
    update(cam, visible) {
      g.setVisible(visible);
      since += 1;
      const s = o.getState();
      if (!s) return;
      const v = cam.worldView;
      const sig = (s.economyRoutes ?? []).map((r) => `${r.broken ? 'b' : ''}${Math.round(r.condition * 20)}`).join(',');
      const k = `${Math.floor(v.x / T)},${Math.floor(v.y / T)},${Math.round(v.width)}:${sig}`;
      if (k !== key && since > 6) { key = k; since = 0; draw(s, cam); for (const b of barriers.values()) b.destroy(); barriers.clear(); }
      const nb = breaks(s, cam, visible);
      let tiles = 0;
      for (const n of drawnTiles.values()) tiles += n;
      countVisual('roadWear', visible ? tiles : 0);
      countVisual('roadBreaks', nb);
    },
    list: () => {
      const s = o.getState();
      return [...drawnTiles.entries()].map(([routeId, tiles]) => { const r = s?.economyRoutes?.find((x) => x.id === routeId); return { routeId, word: r?.broken ? 'broken' : `${Math.round((r?.condition ?? 0) * 100)}%`, tiles }; });
    },
    breakPoints: () => (o.getState()?.economyRoutes ?? []).filter((r) => r.broken).flatMap((r) => { const f = breakAt(r.id); return f ? [{ routeId: r.id, ...f }] : []; }),
    destroy() { g.destroy(); for (const b of barriers.values()) b.destroy(); barriers.clear(); },
  };
}
