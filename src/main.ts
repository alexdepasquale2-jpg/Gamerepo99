import Phaser from 'phaser';
import { BootScene } from './render/boot-scene';
import { OverworldScene } from './render/overworld-scene';
import { createHud } from './ui/hud';
import { createMethodMenu } from './ui/method-menu';
import { runGameFlow } from './ui/game-flow';

const hud = createHud();
hud.setStatus('booting overworld');

const methodMenu = createMethodMenu();

const width = 640;
const height = 360;

let game: Phaser.Game | null = null;

function stop(): void {
  game?.destroy(true);
  game = null;
}

// Title menu first; the game boots when the player starts or loads a world.
runGameFlow({
  stop,
  start(session) {
    stop();
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width,
      height,
      backgroundColor: '#0b0d12',
      pixelArt: true, // nearest-neighbor — integer scales stay crisp under Scale.FIT
      antialias: false,
      roundPixels: true,
      scene: [BootScene, OverworldScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      callbacks: {
        preBoot: (g) => {
          g.registry.set("playSession", session);
          g.registry.set('methodMenu', methodMenu);
          g.registry.set('hud', hud);
        },
      },
    });
    hud.setStatus('overworld');
  },
  setPaused(paused) {
    if (!game) return;
    for (const s of game.scene.getScenes(false)) {
      if (paused && game.scene.isActive(s.scene.key)) s.scene.pause();
      else if (!paused && game.scene.isPaused(s.scene.key)) s.scene.resume();
    }
  },
});
