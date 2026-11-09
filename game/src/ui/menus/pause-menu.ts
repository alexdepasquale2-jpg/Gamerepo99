/** Pause menu (Esc, ☰ or the touch Menu): resume, save, load, world file, sound, leave to title. It pauses the game. */
import { openMenu, type MenuHandle } from '../kit/menu';

export type PauseIo = {
  onResume: () => void;
  /** Open the Works sheet (the progression layer). */
  onWorks?: () => void;
  onSave: () => void;
  onLoad: () => void;
  onWorldFile: () => void;
  /** Flip sound; returns the new muted state. */
  onSound: () => boolean;
  onTitle: () => void;
  muted: boolean;
  /** This run's world number, shown so it can be written down and entered again. */
  world?: number;
};

const soundLabel = (muted: boolean): string => (muted ? 'Sound: off' : 'Sound: on');

export function openPauseMenu(io: PauseIo): MenuHandle {
  const handle = openMenu(
    'Paused',
    [
      { id: 'resume', label: 'Resume', onPick: () => (handle.close(), io.onResume()) },
      ...(io.onWorks ? [{ id: 'works', label: 'The Works', hint: 'Yards, lines, vehicles, convoys, war and the arcs (J)', onPick: () => (handle.close(), io.onWorks!()) }] : []),
      { id: 'save', label: 'Save', hint: 'Three slots; dawn saves on its own', onPick: () => (handle.close(), io.onSave()) },
      { id: 'load', label: 'Load', onPick: () => (handle.close(), io.onLoad()) },
      { id: 'world', label: 'World file', hint: 'Export this world, or import one', onPick: () => (handle.close(), io.onWorldFile()) },
      {
        id: 'sound',
        label: soundLabel(io.muted),
        onPick: () => {
          const muted = io.onSound();
          const b = handle.el.querySelector('[data-id=sound]');
          if (b?.firstChild) b.firstChild.textContent = soundLabel(muted);
        },
      },
      { id: 'title', label: 'Leave to title', hint: 'Your fire is kept by the last save', onPick: () => (handle.close(), io.onTitle()) },
    ],
    { id: 'hf-pause-menu', onEscape: () => (handle.close(), io.onResume()), note: io.world === undefined ? undefined : `World ${io.world}` },
  );
  return handle;
}
