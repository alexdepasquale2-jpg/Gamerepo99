import Phaser from 'phaser';
import {
  createHeroAnims,
  generateCalmGround,
  generateSoftShadow,
  preloadOverworldSheets,
  registerSheetFrames,
} from './sheet-frames';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    preloadOverworldSheets(this.load);
  }

  create(): void {
    registerSheetFrames(this.textures);
    generateSoftShadow(this);
    generateCalmGround(this);
    createHeroAnims(this.anims);
    this.scene.start('overworld');
  }
}
