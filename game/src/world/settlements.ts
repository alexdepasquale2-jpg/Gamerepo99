/**
 * Settlements: buildings from data/art/settlements.json (same placement the sim's interiors use),
 * gardens, fences, the well, city walls, and each town's hearth (flame, glow, sparks), chimney smoke,
 * noticeboard, signpost and market stall. All foot-sorted. Smoke stops in a town that has given up;
 * the stall's goods show only while the town has food in stock.
 */
import Phaser from 'phaser';
import art from '../data/art/settlements.json';
import { TILE_PX } from '../sim/map/constants';
import type { LayoutSettlement } from '../sim/map/world-layout';
import type { SimState } from '../sim/types/runtime';
import { foodHave } from '../sim/economy/food-stock';
import { ART_SCALE, strHash } from './art/px';
import { buildingTex } from './art/building-art';
import { thingTex } from './art/thing-art';
import { FLAME_TEX } from './art/prop-art';
import { PUFF_TEX } from './assets';
import { townSpots, type TownSpots } from './town-spots';
import type { Pt } from './depth';

const STOCK_OK = 4;
/** Emitters and flames run only for towns this near the player (px). */
const LIVE_RANGE = TILE_PX * 40;

type TownView = {
  spots: TownSpots;
  flame: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Arc;
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  goods: Phaser.GameObjects.Image;
  objects: Phaser.GameObjects.GameObject[];
};

export type Settlements = {
  spots: TownSpots[];
  byId: Map<string, TownSpots>;
  update(time: number, player: Pt, night01: number): void;
  refresh(state: SimState | undefined, despair: Record<string, number>): void;
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createSettlements(scene: Phaser.Scene, towns: LayoutSettlement[]): Settlements {
  const views: TownView[] = towns.map((town) => drawTown(scene, town));
  const spots = views.map((v) => v.spots);
  return {
    spots,
    byId: new Map(spots.map((s) => [s.town.id, s])),
    update(time, player, night) {
      for (const v of views) {
        const live = Math.hypot(v.spots.centre.x - player.x, v.spots.centre.y - player.y) < LIVE_RANGE;
        v.sparks.emitting = live;
        if (!live) { v.smoke.emitting = false; continue; }
        v.smoke.emitting = v.smoke.getData('warm') !== false;
        const fl = 0.85 + Math.sin(time / 90 + v.spots.hearth.x) * 0.1 + Math.sin(time / 37) * 0.05;
        v.flame.setScale(ART_SCALE * fl, ART_SCALE * (0.9 + (fl - 0.85) * 2));
        v.glow.setAlpha(0.1 + night * 0.08 + (fl - 0.85) * 0.25);
      }
    },
    refresh(state, despair) {
      for (const v of views) {
        const id = v.spots.town.id;
        v.smoke.setData('warm', (despair[id] ?? 0) < 0.5);
        // The stall shows goods while the town's one food stock (the village ledger) holds enough.
        const stocked = (state?.towns?.[id] ? foodHave(state, id) : STOCK_OK) >= STOCK_OK;
        v.goods.setData('stocked', stocked).setVisible(stocked && v.flame.visible);
      }
    },
    setVisible(on) {
      for (const v of views) for (const o of v.objects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
      if (on) for (const v of views) v.goods.setVisible(v.goods.getData('stocked') !== false);
    },
    destroy() {
      for (const v of views) for (const o of v.objects) o.destroy();
    },
  };
}

function drawTown(scene: Phaser.Scene, town: LayoutSettlement): TownView {
  const s = townSpots(town);
  const objects: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objects.push(o); return o; };
  const h = strHash(town.id);
  let hh = 0;
  for (const c of town.id) hh = (hh * 31 + c.charCodeAt(0)) >>> 0; // same pick as sim/map/interiors
  const put = (key: string, dq: number, dr: number, bias = 0): Phaser.GameObjects.Image => {
    const x = s.centre.x + dq * TILE_PX, y = s.centre.y + dr * TILE_PX;
    return keep(scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(y + bias));
  };
  const kind = town.kind ?? 'village';
  art.layouts[kind].forEach((b, i) => put(buildingTex(b.type, (hh + i) % art.palettes.length), b.q, b.r));
  for (const q of [-5, 5]) { put(buildingTex('garden', h), q, 1.1, -1); put(buildingTex('fence', h), q, 1.6); }
  if (kind === 'city') for (const q of [-6, -2, 2, 6]) put(buildingTex('wall', h), q, -6);
  const at = (p: Pt, key: string, bias = 0) => keep(scene.add.image(p.x, p.y, key).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(p.y + bias));
  at(s.well, thingTex('well'));
  at(s.board, thingTex('board'));
  at(s.signpost, thingTex('signpost'));
  at(s.stall, thingTex('stall'));
  const goods = keep(scene.add.image(s.stall.x, s.stall.y - 14, thingTex('stall-goods')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(s.stall.y + 0.1));
  // Hearth: stones and logs, a flickering flame, a warm glow (brighter at night), rising sparks.
  const hp = s.hearth;
  at(hp, thingTex('hearth'));
  const glow = keep(scene.add.circle(hp.x, hp.y - 8, 16, 0xf2b84b, 0.12).setDepth(hp.y - 0.5).setBlendMode(Phaser.BlendModes.ADD));
  const flame = keep(scene.add.image(hp.x, hp.y - 4, FLAME_TEX).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(hp.y + 0.2));
  const sparks = keep(scene.add.particles(hp.x, hp.y - 14, PUFF_TEX, {
    speedY: { min: -26, max: -12 }, speedX: { min: -5, max: 5 }, lifespan: 1100, scale: { start: 0.35, end: 0 },
    tint: [0xf2b84b, 0xf08a30], alpha: { start: 0.9, end: 0 }, frequency: 220, blendMode: 'ADD',
  }).setDepth(hp.y + 2));
  // Chimney smoke from the main building.
  const main = art.layouts[kind].find((b) => b.type === 'hall') ?? art.layouts[kind][1] ?? art.layouts[kind][0]!;
  const sx = s.centre.x + main.q * TILE_PX - 26, sy = s.centre.y + main.r * TILE_PX - TILE_PX * 3.4;
  const smoke = keep(scene.add.particles(sx, sy, PUFF_TEX, {
    speedY: { min: -14, max: -8 }, speedX: { min: 2, max: 8 }, lifespan: 3200, scale: { start: 0.5, end: 1.6 },
    tint: 0xb8b0a8, alpha: { start: 0.35, end: 0 }, frequency: 500,
  }).setDepth(s.centre.y + main.r * TILE_PX + 2));
  return { spots: s, flame, glow, sparks, smoke, goods, objects };
}
