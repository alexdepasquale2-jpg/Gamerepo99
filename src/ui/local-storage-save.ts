import type { SaveBlob } from '../sim/save';
import { createSaveSlots } from './save-slots';

/** Single-slot shim kept for older callers; delegates to slot 1. */
export function saveGame(blob: SaveBlob): void {
  createSaveSlots().write(1, blob);
}

export function loadGame(): SaveBlob | null {
  const r = createSaveSlots().read(1);
  return r.ok ? r.blob : null;
}
