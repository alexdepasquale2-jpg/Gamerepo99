import { beforeEach, describe, expect, it } from 'vitest';
import { loadGame, saveGame } from '../../src/ui/local-storage-save';
import type { SaveBlob } from '../../src/sim/save';

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
}

describe('ui localStorage save adapter', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('persists and reloads a SaveBlob', () => {
    const blob: SaveBlob = {
      version: 1,
      seed: 1,
      tick: 3,
      npcs: [{ id: 'npc-1', x: 0, y: 1 }],
    };
    saveGame(blob);
    expect(loadGame()).toEqual(blob);
  });

  it('returns null when empty or corrupt', () => {
    expect(loadGame()).toBeNull();
    localStorage.setItem('the-last-spark:m1', '{bad');
    expect(loadGame()).toBeNull();
  });
});
