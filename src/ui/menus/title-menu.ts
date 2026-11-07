/** Title menu. Continue is disabled (not hidden) with no saves; quitting is never shamed. */
import type { SaveSlots } from '../save-slots';
import { openMenu, type MenuHandle } from './dom';

export function openTitleMenu(slots: SaveSlots, io: { onNew: () => void; onContinue: () => void; onLoad: () => void }): MenuHandle {
  const hasSave = slots.list().length > 0;
  return openMenu(
    'Hearthfall',
    [
      { id: 'continue', label: 'Continue', disabled: !hasSave, hint: hasSave ? 'Pick up where the fire was left' : 'No saved fires yet', onPick: io.onContinue },
      { id: 'new', label: 'New game', onPick: io.onNew },
      { id: 'load', label: 'Load', disabled: !hasSave, onPick: io.onLoad },
    ],
    { id: 'hf-title-menu', onEscape: () => undefined, note: 'The fire keeps until you return.' },
  );
}
