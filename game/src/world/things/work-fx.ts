/**
 * The work at a work spot, made legible (sim/tasks): while its people are at it in working hours, each kind
 * of work throws off what that work throws off — steam off the pot, flour dust at the millstone, sawdust at
 * the log pile and the frame, sparks off the anvil and the seam, chaff from the sheaf, road dust, mud from
 * a stuck wheel — and a small bar under the spot fills with the task's progress (the build, or today's share).
 * Emitters exist only for spots near the camera; the sim is only read.
 */
import type Phaser from 'phaser';
import { PUFF_TEX } from '../assets';

type FxRow = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig & { dy: number };

/** Per spot look (tasks.json kinds[].look). `dy`: how far above the spot's foot the work happens. */
const FX: Record<string, FxRow> = {
  pot: { dy: 22, speedY: { min: -26, max: -14 }, speedX: { min: -4, max: 6 }, lifespan: 1800, scale: { start: 0.5, end: 1.6 }, alpha: { start: 0.55, end: 0 }, tint: 0xf0f0f0, frequency: 260 },
  mill: { dy: 10, speedY: { min: -12, max: -4 }, speedX: { min: -18, max: 18 }, lifespan: 1400, scale: { start: 0.35, end: 0.9 }, alpha: { start: 0.6, end: 0 }, tint: 0xf4ecd0, frequency: 180 },
  logs: { dy: 12, speedY: { min: -40, max: -20 }, speedX: { min: -30, max: 30 }, gravityY: 90, lifespan: 700, scale: { start: 0.3, end: 0.2 }, alpha: { start: 1, end: 0.4 }, tint: [0xd8b078, 0xc89858, 0xe8c890], frequency: 90, quantity: 2 },
  frame: { dy: 26, speedY: { min: -30, max: -10 }, speedX: { min: -24, max: 24 }, gravityY: 80, lifespan: 800, scale: { start: 0.3, end: 0.2 }, alpha: { start: 1, end: 0.3 }, tint: [0xd8b078, 0xb88848], frequency: 160 },
  anvil: { dy: 14, speedY: { min: -70, max: -30 }, speedX: { min: -50, max: 50 }, gravityY: 160, lifespan: 450, scale: { start: 0.3, end: 0.1 }, alpha: { start: 1, end: 0 }, tint: [0xffe080, 0xffb040, 0xfff4c0], frequency: 120, quantity: 3, blendMode: 'ADD' },
  seam: { dy: 12, speedY: { min: -50, max: -20 }, speedX: { min: -40, max: 40 }, gravityY: 140, lifespan: 500, scale: { start: 0.28, end: 0.1 }, alpha: { start: 1, end: 0 }, tint: [0xffc060, 0x9a8a7a, 0x7a6a5a], frequency: 150, quantity: 2 },
  sheaf: { dy: 14, speedY: { min: -20, max: -6 }, speedX: { min: 4, max: 26 }, lifespan: 1500, scale: { start: 0.3, end: 0.15 }, alpha: { start: 0.9, end: 0 }, tint: [0xe8cc6a, 0xd8b84a], frequency: 200 },
  road: { dy: 6, speedY: { min: -14, max: -4 }, speedX: { min: -20, max: 20 }, lifespan: 1200, scale: { start: 0.4, end: 1.2 }, alpha: { start: 0.5, end: 0 }, tint: 0xb8a888, frequency: 220 },
  wheel: { dy: 6, speedY: { min: -40, max: -18 }, speedX: { min: -30, max: 30 }, gravityY: 120, lifespan: 600, scale: { start: 0.35, end: 0.2 }, alpha: { start: 1, end: 0.5 }, tint: 0x5a4a30, frequency: 200 },
};

export type WorkFx = { emitter: Phaser.GameObjects.Particles.ParticleEmitter; bar: Phaser.GameObjects.Graphics; shown: number };

/** The emitter and progress bar for one spot (origin at the spot's foot). */
export function makeWorkFx(scene: Phaser.Scene, look: string, x: number, y: number): WorkFx {
  const { dy, ...row } = FX[look] ?? FX.frame!;
  const emitter = scene.add.particles(x, y - dy, PUFF_TEX, row).setDepth(y + 2);
  const bar = scene.add.graphics().setDepth(y + 1);
  return { emitter, bar, shown: -1 };
}

export function placeWorkFx(fx: WorkFx, look: string, x: number, y: number): void {
  fx.emitter.setPosition(x, y - (FX[look] ?? FX.frame!).dy).setDepth(y + 2);
  fx.bar.setDepth(y + 1);
  fx.shown = -1; // redraw the bar where the spot now stands
}

/** Redraw the bar only when its fill moves a step (it sits just under the spot's foot). */
export function drawWorkBar(fx: WorkFx, x: number, y: number, progress: number): void {
  const step = Math.round(Math.max(0, Math.min(1, progress)) * 20);
  if (step === fx.shown) return;
  fx.shown = step;
  fx.bar.clear();
  fx.bar.fillStyle(0x1b1612, 0.8).fillRect(x - 12, y + 3, 24, 4);
  fx.bar.fillStyle(step >= 20 ? 0x9ad070 : 0xf2b84b, 1).fillRect(x - 11, y + 4, Math.round(22 * step / 20), 2);
}

export function destroyWorkFx(fx: WorkFx): void {
  fx.emitter.destroy();
  fx.bar.destroy();
}
