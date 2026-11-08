/**
 * UI area (stub). Owner: the ui agent. Replace everything in src/ui/ — keep attachUi, runTitleFlow, trackCanvas.
 * See game/README.md.
 */
import type { AppHooks, GameContext, UiApi } from '../app/contracts';
import { createPlaySession } from '../sim/play-session/play-session';
import type { PlaySession } from '../sim/play-session/play-session-types';

/** The DOM layer follows the Phaser canvas (null when the game stops). */
export function trackCanvas(_canvas: HTMLCanvasElement | null): void {}

/** Title → who you are → which world → play. Stub: starts the known world as Marrow. */
export function runTitleFlow(app: AppHooks): void {
  const seed = 42, archetypeId = 'marrow';
  const s = createPlaySession({ mode: 'play', seed, archetypeId }) as PlaySession;
  s.start({ seed, archetypeId });
  app.start(s, () => {});
}

export function attachUi(_ctx: GameContext): UiApi {
  return {
    hud: { spark: () => {}, day: () => {}, letters: () => {}, purse: () => {} },
    sheet: () => ({ close: () => {}, refresh: () => {}, isOpen: () => false }),
    menu: () => {},
    blocking: () => false,
    setActLabel: () => {},
  };
}
