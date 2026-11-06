/** Pure save blob helpers — no DOM I/O (persistence adapter lives in ui/). */

export type SaveBlob = {
  version: 1;
  seed: number;
  tick: number;
  npcs: Array<{ id: string; x: number; y: number }>;
};

export function serializeSave(blob: SaveBlob): string {
  return JSON.stringify(blob);
}

export function parseSave(raw: string): SaveBlob | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveBlob;
  } catch {
    return null;
  }
}
