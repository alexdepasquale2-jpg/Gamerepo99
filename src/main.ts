import Phaser from 'phaser';
import { BootScene } from './render/boot-scene';
import { OverworldScene } from './render/overworld-scene';
import { TownScene } from './render/town-scene';
import { createHud } from './ui/hud';
import { createMethodMenu } from './ui/method-menu';

const hud = createHud();
hud.setStatus('booting overworld');

const methodMenu = createMethodMenu();

const width = 640;
const height = 360;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width,
  height,
  backgroundColor: '#0b0d12',
  pixelArt: true, // nearest-neighbor — integer scales stay crisp under Scale.FIT
  antialias: false,
  roundPixels: true,
  scene: [BootScene, OverworldScene, TownScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

game.registry.set('methodMenu', methodMenu);
game.registry.set('hud', hud);
hud.setStatus('overworld');
