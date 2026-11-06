/** localStorage save/load scaffold — M1 stores tick + npc positions only. */

export type SaveBlob = {
  version: 1;
  seed: number;
  tick: number;
  npcs: Array<{ id: string; x: number; y: number }>;
};

const KEY = 'the-last-spark:m1';

export function saveGame(blob: SaveBlob): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(blob));
}

export function loadGame(): SaveBlob | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveBlob;
  } catch {
    return null;
  }
}
