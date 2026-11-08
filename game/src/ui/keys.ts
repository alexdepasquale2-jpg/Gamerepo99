/**
 * Keyboard shortcuts: aliases for what the pad and HUD already reach (keys are never the only way).
 *   I satchel · M map · L letters · B brood · Esc back / menu · ` dev menu (dev builds)
 * The pad (ui/pad/bindings.ts) mirrors these: X = I, Select = M (hold: L / brood), Start = Esc with nothing
 * open, B = Esc while something is; A is E (held for hold-to-work) and 1–6 in the ring.
 * Esc order: the overlay stack's top entry (handled in its capture listener) → the ring → anything a
 * scene claimed via overlays.claimEscape (room, map) → the pause menu. Keys typed in a field never
 * reach here, and nothing fires while a centred menu or the modal is up.
 */
import type { GameContext } from '../app/contracts';
import { overlays } from './kit/overlay-stack';

export type KeyIo = { pause: () => void; brood: () => void; dev?: () => void };

const isField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function installShortcuts(ctx: GameContext, io: KeyIo): () => void {
  const onKey = (e: KeyboardEvent): void => {
    // The overlay stack already handled it (closed a sheet or menu): don't also open the pause menu.
    if (e.defaultPrevented || isField(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Backquote' && io.dev) {
      e.preventDefault();
      io.dev();
      return;
    }
    if (overlays.count('menu', 'modal') > 0 || e.repeat) return;
    const hit = (fn: () => void): void => {
      e.preventDefault();
      fn();
    };
    switch (e.code) {
      case 'Escape':
        if (ctx.interact?.isOpen()) return hit(() => ctx.interact.close());
        if (overlays.escapeClaimed()) return;
        if (ctx.panels?.anyOpen()) return hit(() => ctx.panels.closeAll());
        return hit(io.pause);
      case 'KeyI':
        return hit(() => ctx.panels.satchel.toggle());
      case 'KeyM':
        return hit(() => ctx.panels.map.toggle());
      case 'KeyL':
        return hit(() => ctx.panels.letters.open());
      case 'KeyB':
        return hit(io.brood);
      default:
    }
  };
  // Capture phase, after the overlay stack's own capture listener (installed first by the title flow).
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
