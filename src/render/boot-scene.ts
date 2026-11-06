import Phaser from 'phaser';
import { BAKED_SHEETS } from './asset-manifest';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    for (const [id, path] of Object.entries(BAKED_SHEETS)) {
      if (typeof path === 'string' && path.length > 0) {
        this.load.image(id, path);
        // Also under basename so chunk-layer sheet lookups resolve.
        const base = path.split('/').pop()?.replace(/\.png$/, '');
        if (base && base !== id) this.load.image(base, path);
      }
    }
  }

  create(): void {
    this.scene.start('overworld');
  }
}
