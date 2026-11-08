/** Ambient life: day/night tint, settlement hearths (rest), chimney smoke, player embers, footstep dust. */

import Phaser from 'phaser';
import { TILE_PX } from '../sim/map/constants';
import { tileFootWorld } from './depth-sort';

type Settlement = { id: string; q: number; r: number };
type Pt = { x: number; y: number };

export const HEARTH_OFFSET: Pt = { x: TILE_PX * 1.6, y: TILE_PX * 2.1 };
export const HEARTH_NEAR = 44;
const DAY_MS = 120_000;
const PUFF = 'hf-puff';

export type WorldLife = {
  update: (time: number, dt: number, player: Pt, moving: boolean) => void;
  nearestHearth: (player: Pt) => { town: Settlement; pos: Pt } | null;
  /** Every town hearth (world px), for QA lookups. */
  hearthSpots: () => { town: Settlement; pos: Pt }[];
  /** Reset the clock to early morning. */
  dawn: () => void;
  /** Day clock 0..1 (0 dawn). */
  phase: () => number;
  /** Hide the outdoor day/night tint while the camera is inside a room. */
  setSkyVisible: (on: boolean) => void;
  /** Jump the day clock (QA / tests). */
  setPhase: (p01: number) => void;
};

function ensurePuff(scene: Phaser.Scene): void {
  if (scene.textures.exists(PUFF)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
  g.generateTexture(PUFF, 8, 8);
  g.destroy();
}

/** phase 0..1 -> overlay colour+alpha: 0 dawn, .25 noon, .55 dusk, .75 night. */
export function skyAt(phase: number): { color: number; alpha: number } {
  const stops: [number, number, number][] = [
    [0.0, 0xf2b070, 0.16],
    [0.12, 0xffffff, 0],
    [0.5, 0xffffff, 0],
    [0.62, 0xe8884a, 0.22],
    [0.76, 0x1c2860, 0.5],
    [0.92, 0x1c2860, 0.5],
    [1.0, 0xf2b070, 0.16],
  ];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (phase <= b[0]) {
      const t = (phase - a[0]) / (b[0] - a[0] || 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(a[1]),
        Phaser.Display.Color.ValueToColor(b[1]),
        100,
        t * 100,
      );
      return { color: Phaser.Display.Color.GetColor(c.r, c.g, c.b), alpha: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { color: 0xf2b070, alpha: 0.16 };
}

export function createWorldLife(scene: Phaser.Scene, settlements: Settlement[]): WorldLife {
  ensurePuff(scene);
  const sky = scene.add
    .rectangle(scene.scale.width / 2, scene.scale.height / 2, scene.scale.width * 3, scene.scale.height * 3, 0xffffff, 0)
    .setScrollFactor(0)
    .setDepth(950_000);
  let clock = DAY_MS * 0.08;

  const hearths = settlements.map((town) => {
    const f = tileFootWorld(town.q, town.r);
    const pos = { x: f.x + HEARTH_OFFSET.x, y: f.y + HEARTH_OFFSET.y };
    const depth = pos.y;
    scene.add.ellipse(pos.x, pos.y - 1, 26, 9, 0x000000, 0.35).setDepth(depth - 1);
    const logs = scene.add.rectangle(pos.x, pos.y - 4, 18, 5, 0x5a3a24).setDepth(depth);
    logs.setStrokeStyle(1, 0x2a1a10);
    const glow = scene.add.circle(pos.x, pos.y - 8, 26, 0xf2b84b, 0.18).setDepth(depth - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    const flame = scene.add.ellipse(pos.x, pos.y - 11, 8, 12, 0xf08a30).setDepth(depth + 0.1);
    const core = scene.add.ellipse(pos.x, pos.y - 9, 4, 7, 0xffe08a).setDepth(depth + 0.2);
    scene.add
      .text(pos.x, pos.y + 4, 'Hearth', { fontFamily: 'Georgia, serif', fontSize: '9px', color: '#f2b84b', stroke: '#1b1612', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setDepth(depth + 1);
    // sparks rising from the fire + chimney smoke over the settlement.
    scene.add.particles(pos.x, pos.y - 14, PUFF, {
      speedY: { min: -26, max: -12 }, speedX: { min: -5, max: 5 }, lifespan: 1100, scale: { start: 0.35, end: 0 },
      tint: [0xf2b84b, 0xf08a30], alpha: { start: 0.9, end: 0 }, frequency: 220, blendMode: 'ADD',
    }).setDepth(depth + 2);
    const chim = tileFootWorld(town.q, town.r);
    scene.add.particles(chim.x + 10, chim.y - TILE_PX * 1.4, PUFF, {
      speedY: { min: -14, max: -8 }, speedX: { min: 2, max: 8 }, lifespan: 3200, scale: { start: 0.5, end: 1.6 },
      tint: 0xb8b0a8, alpha: { start: 0.35, end: 0 }, frequency: 500,
    }).setDepth(chim.y + TILE_PX * 2);
    return { town, pos, glow, flame, core };
  });

  const embers = scene.add.particles(0, 0, PUFF, {
    speedY: { min: -18, max: -6 }, speedX: { min: -10, max: 10 }, lifespan: 2200, scale: { start: 0.22, end: 0 },
    tint: [0xf2b84b, 0xf08a30, 0xffe08a], alpha: { start: 0.8, end: 0 }, frequency: 260, blendMode: 'ADD',
    emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, 46) } as Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig,
  }).setDepth(940_000);
  const dust = scene.add.particles(0, 0, PUFF, {
    speed: { min: 2, max: 10 }, lifespan: 420, scale: { start: 0.45, end: 0 },
    tint: 0xc8b898, alpha: { start: 0.45, end: 0 }, emitting: false,
  }).setDepth(900_000);
  let sinceDust = 0;

  return {
    dawn: () => (clock = DAY_MS * 0.06),
    phase: () => clock / DAY_MS,
    setSkyVisible: (on) => void sky.setVisible(on),
    setPhase: (p01) => (clock = (((p01 % 1) + 1) % 1) * DAY_MS),
    hearthSpots: () => hearths.map((h) => ({ town: h.town, pos: h.pos })),
    nearestHearth(player) {
      let best: { town: Settlement; pos: Pt } | null = null;
      let bd = HEARTH_NEAR;
      for (const h of hearths) {
        const d = Phaser.Math.Distance.Between(player.x, player.y, h.pos.x, h.pos.y);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      return best;
    },
    update(time, dt, player, moving) {
      clock = (clock + dt) % DAY_MS;
      const s = skyAt(clock / DAY_MS);
      sky.setFillStyle(s.color, s.alpha);
      const night = Phaser.Math.Clamp((s.alpha - 0.1) / 0.4, 0, 1);
      for (const h of hearths) {
        const fl = 0.85 + Math.sin(time / 90 + h.pos.x) * 0.1 + Math.sin(time / 37) * 0.05;
        h.flame.setScale(fl, 0.9 + (fl - 0.85) * 2);
        h.core.setScale(fl);
        h.glow.setAlpha(0.14 + night * 0.22 + (fl - 0.85) * 0.3).setScale(1 + night * 0.5);
      }
      embers.setPosition(player.x, player.y - 14);
      sinceDust += dt;
      if (moving && sinceDust > 190) {
        sinceDust = 0;
        dust.emitParticleAt(player.x, player.y - 1, 2);
      }
    },
  };
}
