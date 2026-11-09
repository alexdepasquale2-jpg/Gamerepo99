/** Title menu. Continue is disabled (not hidden) with no saves; quitting is never shamed. */
import type { SaveSlots } from '../save-slots';
import { openMenu, type MenuHandle } from './dom';

export function openTitleMenu(slots: SaveSlots, io: { onNew: () => void; onContinue: () => void; onLoad: () => void }): MenuHandle {
  const hasSave = slots.list().length > 0;
  return openMenu(
    'WelCum HoMe',
    [
      { id: 'continue', label: 'Continue', disabled: !hasSave, hint: hasSave ? 'Pick the book back up' : 'Nothing written yet', onPick: io.onContinue },
      { id: 'new', label: 'Step outside', onPick: io.onNew },
      { id: 'load', label: 'Load', disabled: !hasSave, onPick: io.onLoad },
    ],
    { id: 'hf-title-menu', onEscape: () => undefined, lines: ['DON QUIXOTE WAS RIGHT', 'THEY WANT YOU INSIDE', 'THEY COME WHILE YOU SLEEP'], note: 'They want you inside.' },
  );
}
