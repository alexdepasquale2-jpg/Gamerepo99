import Phaser from 'phaser';
import { BootScene } from './render/boot-scene';
import { OverworldScene } from './render/overworld-scene';
import { createHud } from './ui/hud';
import { createMethodMenu } from './ui/method-menu';
import { createSuccessionScreen } from './ui/succession-screen';
import { createHoardEndingScreen } from './ui/hoard-ending-screen';
import type { PlaySession } from './sim';
import { runGameFlow } from './ui/game-flow';
import { createDevMenu } from './ui/dev-menu';
import { setTerrainMode } from './sim/map/terrain';

// Tiles come from the refined map ladder; ?terrain=noise falls back to per-tile noise.
if (new URLSearchParams(location.search).get('terrain') === 'noise') setTerrainMode('noise');

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
  start(session, autosave) {
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
          g.registry.set('autosave', autosave);
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

// Succession overlay: polls the running session and shows the locked screen when open.
let succession: { session: PlaySession; screen: ReturnType<typeof createSuccessionScreen> } | undefined;
setInterval(() => {
  const session = game?.registry.get('playSession') as PlaySession | undefined;
  if (!session) return;
  if (succession?.session !== session) succession = { session, screen: createSuccessionScreen(session) };
  succession.screen.refresh();
}, 250);

// Hoard ending: a hoarder's legitimate end, polled the same way.
let hoardEnding: { session: PlaySession; screen: ReturnType<typeof createHoardEndingScreen> } | undefined;
setInterval(() => {
  const session = game?.registry.get('playSession') as PlaySession | undefined;
  if (!session) return;
  if (hoardEnding?.session !== session) {
    hoardEnding?.screen.el.remove();
    hoardEnding = { session, screen: createHoardEndingScreen(session) };
  }
  hoardEnding.screen.refresh();
}, 250);

createDevMenu();
