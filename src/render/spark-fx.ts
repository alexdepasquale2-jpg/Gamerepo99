import Phaser from 'phaser';
import type { EventBus } from '../sim';
import { FEEL, feelHitStopMs, feelShakeIntensity } from './feel';

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

type SparkFxHandle = { detach: () => void };

function ensureParticleTexture(scene: Phaser.Scene, key: string, color: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(color, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture(key, 8, 8);
  g.destroy();
}

/**
 * Attach spark/reignite/refusal/burnout presentation to a scene.
 * Listens on the world's EventBus — sim must only emit plain payloads (no feel numbers).
 */
export function attachSparkFx(
  scene: Phaser.Scene,
  bus: EventBus,
  opts: SparkFxOptions = {},
): SparkFxHandle {
  ensureParticleTexture(scene, 'fx-spark-gold', FEEL.spark.colorGold);
  ensureParticleTexture(scene, 'fx-spark-cyan', FEEL.spark.colorCyan);
  ensureParticleTexture(scene, 'fx-reignite-warm', FEEL.reignite.colorWarm);
  ensureParticleTexture(scene, 'fx-refusal-dim', FEEL.refusal.colorDim);

  let hitStopUntil = 0;

  const unsubs = [
    bus.on<SparkSpentPayload>('vfx.spark_spent', (p) => {
      const player = opts.getPlayerPos?.() ?? null;
      const enriched: SparkSpentPayload = {
        ...p,
        playerX: p.playerX ?? player?.x ?? p.x,
        playerY: p.playerY ?? player?.y ?? p.y,
      };
      playSparkSpent(scene, enriched, () => {
        hitStopUntil = scene.time.now + feelHitStopMs(FEEL.spark.hitStopMs);
      });
      opts.onSparkSpentHud?.(p.amount01 ?? 0.15);
    }),
    bus.on<ReignitePayload>('vfx.reignite', (p) => {
      hitStopUntil = Math.max(hitStopUntil, scene.time.now + feelHitStopMs(FEEL.reignite.hitStopMs));
      playReignite(scene, p);
    }),
    bus.on<RefusalPayload>('vfx.refusal', (p) => playRefusal(scene, p)),
    bus.on<BurnoutPayload>('vfx.burnout', (p) => playBurnout(scene, p)),
  ];

  const originalUpdate = scene.update.bind(scene);
  scene.update = (time: number, delta: number) => {
    const scaled = time < hitStopUntil ? delta * 0.15 : delta;
    originalUpdate(time, scaled);
  };

  return {
    detach: () => {
      for (const u of unsubs) u();
      scene.update = originalUpdate;
    },
  };
}

function emitBurst(
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

function playCostToSelf(scene: Phaser.Scene, x: number, y: number): void {
  const cfg = FEEL.spark.costSelf;
  // Cyan flash on player (cost)
  const flash = scene.add.circle(x, y, 18, cfg.flashColor, cfg.flashAlpha);
  flash.setDepth(22);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.6,
    duration: cfg.flashMs,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });
  // Afterimage ghost
  const ghost = scene.add.circle(x, y, 10, FEEL.spark.colorCyan, cfg.afterimageAlpha);
  ghost.setDepth(21);
  scene.tweens.add({
    targets: ghost,
    alpha: 0,
    y: y - 12,
    duration: cfg.afterimageMs,
    onComplete: () => ghost.destroy(),
  });
  // Drain motes inward (spark leaving the body)
  emitBurst(scene, x, y, 'fx-spark-cyan', {
    count: cfg.drainParticleCount,
    lifespan: FEEL.spark.lifespanMs,
    speedMin: FEEL.spark.speedMin * 0.5,
    speedMax: FEEL.spark.speedMax * 0.6,
    scale: 0.55,
  });
  // Soft vignette pulse (camera-fixed)
  const cam = scene.cameras.main;
  const vig = scene.add.rectangle(
    cam.scrollX + cam.width / 2,
    cam.scrollY + cam.height / 2,
    cam.width + 4,
    cam.height + 4,
    0x0b0a0f,
    cfg.vignetteAlpha,
  );
  vig.setScrollFactor(0);
  vig.setDepth(30);
  scene.tweens.add({
    targets: vig,
    alpha: 0,
    duration: cfg.vignetteMs,
    onComplete: () => vig.destroy(),
  });
}

function playSparkSpent(
  scene: Phaser.Scene,
  p: SparkSpentPayload,
  onHitStop: () => void,
): void {
  const { x, y } = p;
  onHitStop();
  scene.cameras.main.shake(FEEL.spark.shakeDurationMs, feelShakeIntensity(FEEL.spark.shakeIntensity));
  playCostToSelf(scene, p.playerX ?? x, p.playerY ?? y);
  emitBurst(scene, x, y, 'fx-spark-gold', {
    count: FEEL.spark.particleCount,
    lifespan: FEEL.spark.lifespanMs,
    speedMin: FEEL.spark.speedMin,
    speedMax: FEEL.spark.speedMax,
    inward: true,
  });
  emitBurst(scene, x, y, 'fx-spark-cyan', {
    count: Math.max(4, Math.floor(FEEL.spark.particleCount / 2)),
    lifespan: FEEL.spark.lifespanMs,
    speedMin: FEEL.spark.speedMin * 0.7,
    speedMax: FEEL.spark.speedMax * 0.7,
    inward: true,
    scale: 0.7,
  });
  // Inward gather ring
  const ring = scene.add
    .circle(x, y, 28, FEEL.spark.colorGold, 0.0)
    .setStrokeStyle(2, FEEL.spark.colorCyan, 0.9);
  ring.setDepth(19);
  scene.tweens.add({
    targets: ring,
    radius: 4,
    alpha: 0,
    duration: FEEL.spark.lifespanMs,
    onUpdate: () => {
      ring.setStrokeStyle(2, FEEL.spark.colorCyan, Math.max(0, 1 - (28 - ring.radius) / 28));
    },
    onComplete: () => ring.destroy(),
  });
}

function playColorWash(scene: Phaser.Scene, x: number, y: number, warmthBefore = 0.2, warmthAfter = 0.8): void {
  const wash = FEEL.reignite.wash;
  // Strength scales with warmth delta (sim drives values; we only present)
  const delta = Math.max(0.15, Math.min(1, (warmthAfter - warmthBefore) / 0.8));
  const fill = scene.add.circle(x, y, wash.startRadius, wash.color, wash.startAlpha * delta);
  fill.setDepth(17);
  fill.setBlendMode(Phaser.BlendModes.ADD);
  const ring = scene.add
    .circle(x, y, wash.startRadius, wash.ringColor, 0)
    .setStrokeStyle(wash.ringWidth, wash.ringColor, 0.85 * delta);
  ring.setDepth(17);
  scene.tweens.add({
    targets: [fill, ring],
    radius: wash.endRadius,
    alpha: wash.endAlpha,
    duration: wash.durationMs,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      ring.setStrokeStyle(
        wash.ringWidth,
        wash.ringColor,
        Math.max(0, 0.85 * delta * (1 - (ring.radius - wash.startRadius) / (wash.endRadius - wash.startRadius))),
      );
    },
    onComplete: () => {
      fill.destroy();
      ring.destroy();
    },
  });
}

function playReignite(scene: Phaser.Scene, p: ReignitePayload): void {
  const { x, y } = p;
  scene.cameras.main.shake(FEEL.reignite.shakeDurationMs, feelShakeIntensity(FEEL.reignite.shakeIntensity));
  // Glow bloom
  const bloom = scene.add.circle(x, y, 8, FEEL.reignite.colorGold, FEEL.reignite.bloomAlpha);
  bloom.setDepth(18);
  bloom.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: bloom,
    radius: FEEL.reignite.bloomRadius,
    alpha: 0,
    duration: FEEL.reignite.bloomMs,
    ease: 'Cubic.easeOut',
    onComplete: () => bloom.destroy(),
  });
  // Color wash over despair palette
  playColorWash(scene, x, y, p.warmthBefore, p.warmthAfter);
  emitBurst(scene, x, y, 'fx-reignite-warm', {
    count: FEEL.reignite.particleCount,
    lifespan: FEEL.reignite.lifespanMs,
    speedMin: FEEL.reignite.speedMin,
    speedMax: FEEL.reignite.speedMax,
  });
  emitBurst(scene, x, y, 'fx-spark-gold', {
    count: 8,
    lifespan: FEEL.reignite.lifespanMs,
    speedMin: 10,
    speedMax: 40,
    scale: 0.8,
  });
}

function playRefusal(scene: Phaser.Scene, p: RefusalPayload): void {
  const { x, y } = p;
  const flash = scene.add.circle(x, y, 20, FEEL.refusal.colorDim, FEEL.refusal.flashAlpha);
  flash.setDepth(18);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    duration: FEEL.refusal.flashMs,
    onComplete: () => flash.destroy(),
  });
  emitBurst(scene, x, y, 'fx-refusal-dim', {
    count: FEEL.refusal.particleCount,
    lifespan: FEEL.refusal.lifespanMs,
    speedMin: 10,
    speedMax: 30,
    scale: 0.5,
  });
}

function playBurnout(scene: Phaser.Scene, p: BurnoutPayload): void {
  const { x, y } = p;
  const snuff = scene.add.circle(x, y, 12, 0x0b0a0f, 0.7);
  snuff.setDepth(21);
  scene.tweens.add({
    targets: snuff,
    radius: 40,
    alpha: 0,
    duration: FEEL.burnout.snuffMs,
    onComplete: () => snuff.destroy(),
  });
  scene.cameras.main.fade(FEEL.burnout.desatMs, 20, 18, 16);
  scene.time.delayedCall(FEEL.burnout.desatMs, () => {
    scene.cameras.main.fadeIn(200, 20, 18, 16);
  });
}
