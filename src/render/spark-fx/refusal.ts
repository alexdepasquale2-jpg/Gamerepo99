import Phaser from 'phaser';
import { FEEL } from '../feel';
import { emitBurst, type RefusalPayload } from './shared';

export function playRefusal(scene: Phaser.Scene, p: RefusalPayload): void {
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
