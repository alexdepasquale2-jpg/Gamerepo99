/** Ambient life: road caravans, critters, town stalls (stocked/empty), warm-chimney smoke, ground fill. */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { advanceCaravanTravel } from '../../sim/caravans';
import { caravanStatus } from '../../sim/caravan-visit';
import { deriveRng } from '../../sim/rng';
import { pointOnRoad, type LayoutRoute } from '../../sim/map/world-layout';
import { TILE_PX } from '../../sim/map/constants';
import type { Navigator } from '../../sim/map/nav';
import { tileFootWorld } from '../depth-sort';
import { ensureGoodsTextures, texKey } from './node-textures';
import { couriersOnRoad } from '../../sim/letter-replies';
import { caravanCrates, MAX_CRATES, turnFraction } from './caravan-crates';

type Town = { id: string; q: number; r: number };
type Pt = { x: number; y: number };
const DAY_MS = 120_000;
const STOCK_OK = 4;

type Wagon = { progress: number; dir: Pt; wagon: Phaser.GameObjects.Image; ox: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; crates: Phaser.GameObjects.Image[] };
type Courier = { dot: Phaser.GameObjects.Rectangle; seal: Phaser.GameObjects.Rectangle };
type Critter = { s: Phaser.GameObjects.Image; home: Pt; kind: string; seed: number };
type Stall = { townId: string; goods: Phaser.GameObjects.Image };
type Smoke = { townId: string; em: Phaser.GameObjects.Particles.ParticleEmitter };

export type LivingWorld = { update: (time: number, dt: number) => void; caravanPositions: () => Pt[]; refresh: () => void; nearestCaravan: (p: Pt) => string | undefined };

export function createLivingWorld(
  scene: Phaser.Scene, seed: number, towns: Town[], routes: LayoutRoute[],
  getState: () => SimState | undefined, despair: () => Record<string, number>, stoppedId: () => string | undefined, nav?: Navigator,
): LivingWorld {
  // Wagons only ever rest on road tiles, i.e. land, bridge decks or fords.
  const roadAt = (path: LayoutRoute['path'], f: number) => nav ? nav.roadPoint(path, f) : pointOnRoad(path, f);
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
  const couriers = new Map<string, Courier>();
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
    nearestCaravan(p) { return [...wagons.entries()].find(([, w]) => Math.hypot(w.wagon.x - p.x, w.wagon.y - p.y) < 65)?.[0]; },
    caravanPositions: () => [...wagons.values()].map((w) => ({ x: w.wagon.x, y: w.wagon.y })),
    update(time, dt) {
      const state = getState();
      if (state) advanceCaravanTravel(state, Math.min(dt, 100) / DAY_MS, stoppedId());
      const mobiles = state?.caravans ?? [];
      const liveIds = new Set(mobiles.map((m) => m.id));
      for (const [id, w] of wagons) if (!liveIds.has(id)) { w.wagon.destroy(); w.ox.destroy(); w.label.destroy(); w.crates.forEach((c) => c.destroy()); wagons.delete(id); }
      for (const m of mobiles) {
        const road = byRoute.get(m.routeId);
        if (!road) continue;
        const f = m.heading === 'outbound' ? m.progress01 : 1 - m.progress01;
        let w = wagons.get(m.id);
        if (!w) {
          w = { progress: f, dir: { x: m.heading === 'outbound' ? 1 : -1, y: 0 },
            crates: Array.from({ length: MAX_CRATES }, () => scene.add.image(0, 0, texKey('crate')).setOrigin(0.5, 1).setScale(2).setVisible(false)),
            wagon: scene.add.image(0, 0, texKey('wagon')).setOrigin(0.5, 1).setScale(2),
            ox: scene.add.image(0, 0, texKey('ox')).setOrigin(0.5, 1).setScale(2),
            label: scene.add.text(0, 0, 'Trader · E', { fontFamily: 'monospace', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3 }).setOrigin(0.5, 1) };
          wagons.set(m.id, w);
        }
        // Fractional sim progress follows the actual curve; at a town the wagon halts, unloads and turns.
        w.progress = f;
        const p = roadAt(road.path, w.progress);
        const ahead = roadAt(road.path, Math.max(0, Math.min(1, w.progress + (m.heading === 'outbound' ? 0.003 : -0.003))));
        const foot = tileFootWorld(p.q, p.r), lead = tileFootWorld(ahead.q, ahead.r);
        let dx = lead.x - foot.x, dy = lead.y - foot.y, length = Math.hypot(dx, dy);
        if (length < 0.5) { dx = w.dir.x; dy = w.dir.y; length = Math.hypot(dx, dy) || 1; } else w.dir = { x: dx, y: dy };
        // Turning around: swing to face back the way it came halfway through the departure.
        if (turnFraction(m) >= 0.5) { dx = -dx; dy = -dy; }
        const halted = m.phase !== undefined;
        const bob = halted && m.phase !== 'departing' ? Math.sin(time / 120) * 1.2 : 0;
        w.wagon.setPosition(foot.x, foot.y + bob).setDepth(foot.y).setFlipX(dx < 0);
        w.label.setText(`${caravanStatus(m)} · E`).setPosition(foot.x, foot.y - 32).setDepth(foot.y + 2);
        const oxx = foot.x + dx / length * 26, oxy = foot.y + dy / length * 26;
        w.ox.setPosition(oxx, oxy).setDepth(oxy).setFlipX(dx < 0);
        // Crates hop between wagon and the town's stall (unloading in, trading back aboard).
        const stall = pos.get(m.visit?.townId ?? '');
        const flying = stall ? caravanCrates(m) : [];
        const sx = stall ? stall.x - TILE_PX * 2.2 : foot.x, sy = stall ? stall.y + TILE_PX * 2.6 : foot.y;
        w.crates.forEach((c, i) => {
          const f2 = flying[i];
          if (!f2) return void c.setVisible(false);
          const u = f2.towardTown ? f2.t : 1 - f2.t;
          c.setVisible(true).setPosition(foot.x + (sx - foot.x) * u, foot.y + (sy - foot.y) * u - Math.sin(u * Math.PI) * 18).setDepth(foot.y + 3);
        });
      }
      // Mail riders: small envelopes that creep along the real road between towns (one step per dawn, eased).
      const riders = state ? couriersOnRoad(state) : [];
      const riding = new Set(riders.map((c) => c.id));
      for (const [id, c] of couriers) if (!riding.has(id)) { c.dot.destroy(); c.seal.destroy(); couriers.delete(id); }
      for (const c of riders) {
        const road = byRoute.get(c.pos.routeId);
        if (!road) continue;
        const f = road.from === c.pos.from ? c.pos.f : 1 - c.pos.f;
        const p = roadAt(road.path, f), foot = tileFootWorld(p.q, p.r);
        let m = couriers.get(c.id);
        if (!m) {
          m = { dot: scene.add.rectangle(foot.x, foot.y - 6, 10, 7, 0xf4e6c8).setStrokeStyle(1, 0x503c25), seal: scene.add.rectangle(foot.x, foot.y - 6, 3, 3, c.kind === 'reply' ? 0xc8553d : 0x5ec8c8) };
          couriers.set(c.id, m);
        }
        const tx = foot.x, ty = foot.y - 6 + Math.sin(time / 260) * 1.2;
        m.dot.setPosition(m.dot.x + (tx - m.dot.x) * 0.05, m.dot.y + (ty - m.dot.y) * 0.05).setDepth(foot.y + 1);
        m.seal.setPosition(m.dot.x, m.dot.y).setDepth(foot.y + 1.1);
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
