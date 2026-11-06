import { parseSave, serializeSave, type SaveBlob } from '../sim/save';

const KEY = 'the-last-spark:m1';

export function saveGame(blob: SaveBlob): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, serializeSave(blob));
}

export function loadGame(): SaveBlob | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  return parseSave(raw);
}
