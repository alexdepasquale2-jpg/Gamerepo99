/** Ambient life: road caravans, critters, town stalls (stocked/empty), warm-chimney smoke, ground fill. */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { deriveRng } from '../../sim/rng';
import { pointOnRoad, type LayoutRoute } from '../../sim/map/world-layout';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
import { ensureGoodsTextures, texKey } from './node-textures';

type Town = { id: string; q: number; r: number };
type Pt = { x: number; y: number };
const DAY_MS = 120_000;
const STOCK_OK = 4;

type Wagon = { progress: number; wagon: Phaser.GameObjects.Image; ox: Phaser.GameObjects.Image };
type Critter = { s: Phaser.GameObjects.Image; home: Pt; kind: string; seed: number };
type Stall = { townId: string; goods: Phaser.GameObjects.Image };
type Smoke = { townId: string; em: Phaser.GameObjects.Particles.ParticleEmitter };

export type LivingWorld = { update: (time: number, dt: number) => void; caravanPositions: () => Pt[]; refresh: () => void };

export function createLivingWorld(
  scene: Phaser.Scene, seed: number, towns: Town[], routes: LayoutRoute[],
  getState: () => SimState | undefined, despair: () => Record<string, number>,
): LivingWorld {
  ensureGoodsTextures(scene);
  const pos = new Map(towns.map((t) => [t.id, tileFootWorld(t.q, t.r)]));
  const byRoute = new Map(routes.map((r) => [r.id, r]));

  // Ground fill: grass tufts + flowers scattered around towns and roads (static, seeded).
  const fill = deriveRng(seed, 'ground-fill');
  const scatter = (c: Pt, n: number, spread: number): void => {
    for (let i = 0; i < n; i++) {
      const x = c.x + (fill.next() - 0.5) * spread;
      const y = c.y + (fill.next() - 0.5) * spread * 0.8;
      scene.add.image(x, y, texKey(fill.next() < 0.3 ? 'flower' : 'grass')).setOrigin(0.5, 1).setScale(2).setDepth(y - 8);
    }
  };
  for (const p of pos.values()) scatter(p, 40, TILE_PX * 22);
  for (const r of routes) for (let f = 0.1; f < 1; f += 0.1) {
    const p = pointOnRoad(r.path, f);
    scatter(tileFootWorld(p.q, p.r), 6, TILE_PX * 10);
  }

  // Only show real economy mobiles, never a phantom wagon per edge.
  const wagons = new Map<string, Wagon>();
  const critters: Critter[] = [];
  const cr = deriveRng(seed, 'critters');
  for (const p of pos.values()) {
    for (let i = 0; i < 6; i++) {
      const kind = ['rabbit', 'bird', 'butterfly'][cr.int(0, 3)]!;
      const home = { x: p.x + (cr.next() - 0.5) * TILE_PX * 20, y: p.y + (cr.next() - 0.5) * TILE_PX * 14 };
      critters.push({ s: scene.add.image(home.x, home.y, texKey(kind)).setOrigin(0.5, 1).setScale(2), home, kind, seed: cr.next() * 1000 });
    }
  }

  const stalls: Stall[] = [];
  const smokes: Smoke[] = [];
  for (const t of towns) {
    const p = pos.get(t.id)!;
    const sx = p.x - TILE_PX * 2.2, sy = p.y + TILE_PX * 2.6;
    scene.add.image(sx, sy, texKey('stall')).setOrigin(0.5, 1).setScale(2).setDepth(sy);
    stalls.push({ townId: t.id, goods: scene.add.image(sx, sy - 14, texKey('goods')).setOrigin(0.5, 1).setScale(2).setDepth(sy + 0.1) });
    const em = scene.add.particles(p.x - 14, p.y - TILE_PX * 1.6, 'hf-puff', {
      speedY: { min: -16, max: -8 }, speedX: { min: 1, max: 6 }, lifespan: 3000, scale: { start: 0.5, end: 1.5 },
      tint: 0xc8c0b8, alpha: { start: 0.4, end: 0 }, frequency: 420,
    }).setDepth(p.y + TILE_PX * 2);
    smokes.push({ townId: t.id, em });
  }

  const refresh = (): void => {
    const st = getState();
    const desp = despair();
    for (const s of stalls) {
      const stock = st?.towns?.[s.townId]?.stock;
      const food = stock ? (stock.food_grain ?? 0) : STOCK_OK;
      s.goods.setVisible(food >= STOCK_OK);
    }
    for (const s of smokes) s.em.emitting = (desp[s.townId] ?? 0) < 0.5;
  };
  refresh();

  let since = 0;
  return {
    refresh,
    caravanPositions: () => [...wagons.values()].map((w) => ({ x: w.wagon.x, y: w.wagon.y })),
    update(time, dt) {
      const mobiles = getState()?.caravans ?? [];
      const liveIds = new Set(mobiles.map((m) => m.id));
      for (const [id, w] of wagons) if (!liveIds.has(id)) { w.wagon.destroy(); w.ox.destroy(); wagons.delete(id); }
      for (const m of mobiles) {
        const road = byRoute.get(m.routeId);
        if (!road) continue;
        const f = m.heading === 'outbound' ? m.progress01 : 1 - m.progress01;
        let w = wagons.get(m.id);
        if (!w) {
          w = { progress: f,
            wagon: scene.add.image(0, 0, texKey('wagon')).setOrigin(0.5, 1).setScale(2),
            ox: scene.add.image(0, 0, texKey('ox')).setOrigin(0.5, 1).setScale(2) };
          wagons.set(m.id, w);
        }
        // Dawn is authoritative; ease only presentation along the actual curve.
        w.progress += (f - w.progress) * Math.min(1, dt / 350);
        const p = pointOnRoad(road.path, w.progress);
        const ahead = pointOnRoad(road.path, Math.max(0, Math.min(1, w.progress + (m.heading === 'outbound' ? 0.003 : -0.003))));
        const foot = tileFootWorld(p.q, p.r), lead = tileFootWorld(ahead.q, ahead.r);
        const dx = lead.x - foot.x, dy = lead.y - foot.y, length = Math.hypot(dx, dy) || 1;
        w.wagon.setPosition(foot.x, foot.y).setDepth(foot.y).setFlipX(dx < 0);
        w.ox.setPosition(foot.x + dx / length * 26, foot.y + dy / length * 26).setDepth(foot.y + dy / length * 26).setFlipX(dx < 0);
      }
      for (const c of critters) {
        const t = time / 1000 + c.seed;
        if (c.kind === 'bird') c.s.setPosition(c.home.x + Math.sin(t * 0.4) * 120, c.home.y - 40 + Math.sin(t * 2) * 6).setDepth(c.home.y + 400);
        else if (c.kind === 'butterfly') c.s.setPosition(c.home.x + Math.sin(t * 0.9) * 24, c.home.y + Math.sin(t * 2.3) * 10).setDepth(c.home.y + 20);
        else {
          const hop = Math.floor(t / 3) % 4;
          const tx = c.home.x + [0, 30, 10, -24][hop]!, ty = c.home.y + [0, 8, -14, 6][hop]!;
          c.s.x += (tx - c.s.x) * 0.04;
          c.s.y += (ty - c.s.y) * 0.04 - (Math.abs(tx - c.s.x) > 2 ? Math.abs(Math.sin(t * 9)) * 0.6 : 0);
          c.s.setDepth(c.s.y).setFlipX(tx < c.s.x);
        }
      }
      since += dt;
      if (since > 2000) {
        since = 0;
        refresh();
      }
    },
  };
}
export const LIVING_DAY_MS = DAY_MS;
