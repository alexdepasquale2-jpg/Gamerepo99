import Phaser from 'phaser';
import { FEEL, feelShakeIntensity } from '../feel';
import { emitBurst, FX_DEPTH, type SparkSpentPayload } from './shared';

function playCostToSelf(scene: Phaser.Scene, x: number, y: number): void {
  const cfg = FEEL.spark.costSelf;
  const flash = scene.add.circle(x, y, 18, cfg.flashColor, cfg.flashAlpha);
  flash.setDepth(FX_DEPTH + 22);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.6,
    duration: cfg.flashMs,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });
  const ghost = scene.add.circle(x, y, 10, FEEL.spark.colorCyan, cfg.afterimageAlpha);
  ghost.setDepth(FX_DEPTH + 21);
  scene.tweens.add({
    targets: ghost,
    alpha: 0,
    y: y - 12,
    duration: cfg.afterimageMs,
    onComplete: () => ghost.destroy(),
  });
  emitBurst(scene, x, y, 'fx-spark-cyan', {
    count: cfg.drainParticleCount,
    lifespan: FEEL.spark.lifespanMs,
    speedMin: FEEL.spark.speedMin * 0.5,
    speedMax: FEEL.spark.speedMax * 0.6,
    scale: 0.55,
  });
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
  vig.setDepth(FX_DEPTH + 30);
  scene.tweens.add({
    targets: vig,
    alpha: 0,
    duration: cfg.vignetteMs,
    onComplete: () => vig.destroy(),
  });
}

export function playSparkSpent(
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
  const ring = scene.add
    .circle(x, y, 28, FEEL.spark.colorGold, 0.0)
    .setStrokeStyle(2, FEEL.spark.colorCyan, 0.9);
  ring.setDepth(FX_DEPTH + 19);
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
