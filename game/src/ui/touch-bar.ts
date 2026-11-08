/**
 * The touch layer (README rule 3: a phone plays the whole game) is now the pad (ui/pad): a d-pad /
 * joystick, A B X Y, Start / Select and L / R, which real controllers drive too. This module keeps the
 * names the rest of the UI already uses (TouchBar, TouchIo, createTouchBar) so ui/index.ts stays thin.
 *   A act (the focused thing's name)  B back / put down  X satchel  Y talk  Start menu
 *   Select map (hold: letters, brood)  L / R hotbar
 */
import type { GameContext } from '../app/contracts';
import { isBrood } from './brood-menu';
import { createPad } from './pad/pad';

export type TouchBar = {
  setAct: (label: string | null) => void;
  setBrood: (show: boolean) => void;
  setLetters: (unread: number) => void;
  /** Whether the on-screen pad is showing (the HUD hides its own ☰ then). */
  shown: () => boolean;
  onShownChange: (fn: (shown: boolean) => void) => void;
  destroy: () => void;
};

export type TouchIo = {
  act: () => void;
  brood: () => void;
  satchel: () => void;
  map: () => void;
  letters: () => void;
  menu: () => void;
};

export function createTouchBar(ctx: GameContext, io: TouchIo): TouchBar {
  const pad = createPad(ctx, {
    pause: io.menu,
    satchel: io.satchel,
    map: io.map,
    letters: io.letters,
    brood: io.brood,
    hasBrood: () => isBrood(ctx),
  });
  return {
    setAct: pad.setAct,
    setBrood: pad.setBrood,
    setLetters: pad.setLetters,
    shown: pad.shown,
    onShownChange: pad.onShownChange,
    destroy: pad.destroy,
  };
}
