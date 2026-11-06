import Phaser from 'phaser';
import { FEEL } from '../feel';

export type SparkSpentPayload = {
  x: number;
  y: number;
  amount01?: number;
  /** Optional player screen position for cost-to-self; defaults to event x,y */
  playerX?: number;
  playerY?: number;
};
export type ReignitePayload = {
  x: number;
  y: number;
  warmthBefore?: number;
  warmthAfter?: number;
};
export type RefusalPayload = { x: number; y: number; kind?: string };
export type BurnoutPayload = { x: number; y: number };

export type SparkFxOptions = {
  /** Resolve player position for cost-to-self feedback */
  getPlayerPos?: () => { x: number; y: number } | null | undefined;
  /** Optional spark-bar graphics to tick down on spend (0..1 fill setter) */
  onSparkSpentHud?: (amount01: number) => void;
};

export type SparkFxHandle = { detach: () => void };

export function ensureParticleTexture(scene: Phaser.Scene, key: string, color: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture(key, 8, 8);
  g.destroy();
}

export function ensureSparkTextures(scene: Phaser.Scene): void {
  ensureParticleTexture(scene, 'fx-spark-gold', FEEL.spark.colorGold);
  ensureParticleTexture(scene, 'fx-spark-cyan', FEEL.spark.colorCyan);
  ensureParticleTexture(scene, 'fx-reignite-warm', FEEL.reignite.colorWarm);
  ensureParticleTexture(scene, 'fx-refusal-dim', FEEL.refusal.colorDim);
}

export function emitBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  opts: {
    count: number;
    lifespan: number;
    speedMin: number;
    speedMax: number;
    inward?: boolean;
    scale?: number;
  },
): void {
  const emitter = scene.add.particles(x, y, texture, {
    speed: { min: opts.speedMin, max: opts.speedMax },
    angle: { min: 0, max: 360 },
    lifespan: opts.lifespan,
    quantity: opts.count,
    scale: { start: opts.scale ?? 1, end: 0 },
    alpha: { start: 0.95, end: 0 },
    blendMode: 'ADD',
    emitting: false,
  });
  emitter.setDepth(20);
  emitter.explode(opts.count);
  scene.time.delayedCall(opts.lifespan + 50, () => emitter.destroy());
}
