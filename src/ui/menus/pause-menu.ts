/** Pause menu: Esc toggles; keyboard operable. Caller pauses/resumes the scenes. */
import { openMenu, type MenuHandle } from '../kit/menu';

export type PauseIo = {
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onWorldFile: () => void;
  onTitle: () => void;
  /** This run's world number, shown so it can be written down and entered again. */
  world?: number;
};

export function openPauseMenu(io: PauseIo): MenuHandle {
  const handle = openMenu(
    'Paused',
    [
      { id: 'resume', label: 'Resume', onPick: () => (handle.close(), io.onResume()) },
      { id: 'save', label: 'Save', onPick: () => (handle.close(), io.onSave()) },
      { id: 'load', label: 'Load', onPick: () => (handle.close(), io.onLoad()) },
      { id: 'world', label: 'World file', onPick: () => (handle.close(), io.onWorldFile()) },
      { id: 'title', label: 'Leave to title', hint: 'Your fire is kept by the last save', onPick: () => (handle.close(), io.onTitle()) },
    ],
    { id: 'hf-pause-menu', onEscape: () => (handle.close(), io.onResume()), note: io.world === undefined ? undefined : `World ${io.world}` },
  );
  return handle;
}
