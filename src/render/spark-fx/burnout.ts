import Phaser from 'phaser';
import { FEEL } from '../feel';
import { FX_DEPTH, emitBurst, type BurnoutPayload } from './shared';

/** Burnout: the world dims, the player's coal gutters and greys out, then succession may open. */
export function playBurnout(scene: Phaser.Scene, p: BurnoutPayload, follow?: () => { x: number; y: number } | null | undefined): void {
  const { x, y } = p;
  const total = FEEL.burnout.holdMs;
  // World dims around the player (world-space, oversized so a few steps of camera follow stay covered).
  // Below in-world bubbles/labels (998_000+) but above every y-sorted sprite; the coal stays above it.
  const view = scene.cameras.main.worldView;
  const dim = scene.add.rectangle(view.centerX, view.centerY, view.width * 4, view.height * 4, 0x14120f, 0);
  dim.setDepth(997_900);
  scene.tweens.add({ targets: dim, alpha: FEEL.burnout.dimAlpha, duration: FEEL.burnout.desatMs });
  scene.time.delayedCall(total, () => {
    scene.tweens.add({ targets: dim, alpha: 0, duration: 200, onComplete: () => dim.destroy() });
  });
  // The dying coal: a warm ember at the chest that shrinks and goes grey.
  const coal = scene.add.circle(x, y, 7, FEEL.reignite.colorWarm, 1);
  coal.setDepth(FX_DEPTH + 23);
  scene.tweens.add({
    targets: coal,
    radius: 2,
    alpha: 0,
    duration: total,
    ease: 'Sine.easeIn',
    onUpdate: () => {
      const at = follow?.();
      if (at) coal.setPosition(at.x, at.y);
    },
    onComplete: () => coal.destroy(),
  });
  scene.time.delayedCall(total * 0.55, () => coal.active && coal.setFillStyle(FEEL.refusal.colorDim, coal.fillAlpha));
  emitBurst(scene, x, y, 'fx-refusal-dim', { count: 8, lifespan: total * 0.6, speedMin: 6, speedMax: 18, scale: 0.4 });
  const snuff = scene.add.circle(x, y, 12, 0x0b0a0f, 0.7);
  snuff.setDepth(FX_DEPTH + 21);
  scene.tweens.add({
    targets: snuff,
    radius: 40,
    alpha: 0,
    duration: FEEL.burnout.snuffMs,
    onComplete: () => snuff.destroy(),
  });
}
