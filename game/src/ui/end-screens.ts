/**
 * Wires the succession modal and the hoard ending to session state, event-driven (no polling): they
 * re-check after every act, dawn, inventory change and state replacement, and after the sim's juice
 * stream fires (debounced to one check per burst). A fresh succession waits a beat so the player sees
 * the coal go out before the modal opens.
 */
import type { GameContext } from '../app/contracts';
import { createHoardEndingScreen } from './hoard-ending-screen';
import { createSuccessionScreen } from './succession-screen';

const SUCCESSION_BEAT_MS = 1100;

export function attachEndScreens(ctx: GameContext, io: { onRested: () => void }): () => void {
  const succession = createSuccessionScreen(ctx, io);
  const hoard = createHoardEndingScreen(ctx);
  let queued = false;
  let beat: ReturnType<typeof setTimeout> | undefined;
  let dead = false;

  const check = (): void => {
    queued = false;
    if (dead) return;
    if (ctx.session.successionOffer()) {
      if (beat !== undefined) return;
      beat = setTimeout(() => {
        beat = undefined;
        if (!dead) succession.refresh();
      }, SUCCESSION_BEAT_MS);
      return;
    }
    succession.refresh();
    hoard.refresh();
  };
  const soon = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(check);
  };

  const offs = [
    ctx.events.on('act', soon),
    ctx.events.on('dawn', soon),
    ctx.events.on('inventory', soon),
    ctx.events.on('state-replaced', soon),
    ctx.events.on('arrive', soon),
    ctx.session.onJuice(soon),
  ];
  soon();
  return () => {
    dead = true;
    if (beat !== undefined) clearTimeout(beat);
    for (const off of offs) off();
    succession.destroy();
    hoard.destroy();
  };
}
