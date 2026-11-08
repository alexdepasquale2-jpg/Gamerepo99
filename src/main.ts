import Phaser from 'phaser';
import { BootScene } from './render/boot-scene';
import { OverworldScene } from './render/overworld-scene';
import { createSuccessionScreen } from './ui/succession-screen';
import { SUCCESSION_GATE_KEY, SUCCESSION_READY_EVENT } from './render/spark-fx/session-fx';
import { createHoardEndingScreen } from './ui/hoard-ending-screen';
import type { PlaySession } from './sim';
import { runGameFlow } from './ui/game-flow';
import { createDevMenu } from './ui/dev-menu';
import { setTerrainMode } from './sim/map/terrain';
import { ensureKitStyle, installOverlayKeys, uiLayer, watchSession } from './ui/kit';

// Tiles come from the refined map ladder; ?terrain=noise falls back to per-tile noise.
if (new URLSearchParams(location.search).get('terrain') === 'noise') setTerrainMode('noise');

// The UI kit: one stylesheet, one canvas-aligned DOM layer, one key listener for the overlay stack.
ensureKitStyle();
const layer = uiLayer();
installOverlayKeys();

const width = 640;
const height = 360;

let game: Phaser.Game | null = null;

function stop(): void {
  game?.destroy(true);
  game = null;
  layer.track(null);
}

/**
 * The end screens (succession, hoard ending) for one session. Event-driven: they refresh after every
 * mutating session call, and the succession screen again when the burnout has played (the scene's
 * SUCCESSION_READY_EVENT), so the player sees the coal go out before the screen opens.
 */
let ends: { session: PlaySession; off: () => void; els: HTMLElement[] } | undefined;
function attachEndScreens(session: PlaySession, g: Phaser.Game): void {
  if (ends) {
    ends.off();
    for (const el of ends.els) el.remove();
  }
  const succession = createSuccessionScreen(session);
  const hoard = createHoardEndingScreen(session);
  const gateOpen = (): boolean => {
    const gate = g.registry.get(SUCCESSION_GATE_KEY) as (() => boolean) | undefined;
    return !gate || gate();
  };
  const refresh = (): void => {
    if (!session.successionOffer() || gateOpen()) succession.refresh();
    hoard.refresh();
  };
  const unwatch = watchSession(session, refresh);
  g.events.on(SUCCESSION_READY_EVENT, refresh);
  ends = { session, els: [succession.el, hoard.el], off: () => { unwatch(); g.events.off(SUCCESSION_READY_EVENT, refresh); } };
  refresh();
}

// Title menu first; the game boots when the player starts or loads a world.
runGameFlow({
  stop,
  start(session, autosave) {
    stop();
    const g = new Phaser.Game({
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
        preBoot: (pg) => {
          pg.registry.set('playSession', session);
          pg.registry.set('autosave', autosave);
        },
      },
    });
    game = g;
    // The DOM layer follows the canvas once Phaser has made it.
    g.events.once(Phaser.Core.Events.READY, () => layer.track(g.canvas));
    attachEndScreens(session, g);
  },
  setPaused(paused) {
    if (!game) return;
    for (const s of game.scene.getScenes(false)) {
      if (paused && game.scene.isActive(s.scene.key)) s.scene.pause();
      else if (!paused && game.scene.isPaused(s.scene.key)) s.scene.resume();
    }
  },
});

createDevMenu();
