import Phaser from 'phaser';
import mapData from './data/map.json';
import { BootScene } from './render/boot-scene';
import { WanderScene } from './render/wander-scene';
import { createHud } from './ui/hud';

const hud = createHud();
hud.setStatus('booting');

const width = mapData.width * mapData.tileSize;
const height = mapData.height * mapData.tileSize;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width,
  height,
  backgroundColor: '#0b0d12',
  scene: [BootScene, WanderScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
