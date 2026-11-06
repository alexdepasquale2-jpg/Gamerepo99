import Phaser from 'phaser';
import { FEEL } from '../feel';
import type { BurnoutPayload } from './shared';

export function playBurnout(scene: Phaser.Scene, p: BurnoutPayload): void {
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
