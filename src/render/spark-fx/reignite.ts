import Phaser from 'phaser';
import { FEEL, feelShakeIntensity } from '../feel';
import { emitBurst, FX_DEPTH, type ReignitePayload } from './shared';

function playColorWash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  warmthBefore = 0.2,
  warmthAfter = 0.8,
): void {
  const wash = FEEL.reignite.wash;
  const delta = Math.max(0.15, Math.min(1, (warmthAfter - warmthBefore) / 0.8));
  const fill = scene.add.circle(x, y, wash.startRadius, wash.color, wash.startAlpha * delta);
  fill.setDepth(FX_DEPTH + 17);
  fill.setBlendMode(Phaser.BlendModes.ADD);
  const ring = scene.add
    .circle(x, y, wash.startRadius, wash.ringColor, 0)
    .setStrokeStyle(wash.ringWidth, wash.ringColor, 0.85 * delta);
  ring.setDepth(FX_DEPTH + 17);
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
        Math.max(
          0,
          0.85 *
            delta *
            (1 - (ring.radius - wash.startRadius) / (wash.endRadius - wash.startRadius)),
        ),
      );
    },
    onComplete: () => {
      fill.destroy();
      ring.destroy();
    },
  });
}

export function playReignite(scene: Phaser.Scene, p: ReignitePayload): void {
  const { x, y } = p;
  scene.cameras.main.shake(
    FEEL.reignite.shakeDurationMs,
    feelShakeIntensity(FEEL.reignite.shakeIntensity),
  );
  const bloom = scene.add.circle(x, y, 8, FEEL.reignite.colorGold, FEEL.reignite.bloomAlpha);
  bloom.setDepth(FX_DEPTH + 18);
  bloom.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: bloom,
    radius: FEEL.reignite.bloomRadius,
    alpha: 0,
    duration: FEEL.reignite.bloomMs,
    ease: 'Cubic.easeOut',
    onComplete: () => bloom.destroy(),
  });
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
