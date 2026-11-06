import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSave, serializeSave, type SaveBlob } from '../../src/sim/save';

describe('save serialize/parse (pure)', () => {
  const blob: SaveBlob = {
    version: 1,
    seed: 42,
    tick: 7,
    npcs: [
      { id: 'npc-1', x: 2, y: 3 },
      { id: 'npc-2', x: 4, y: 1 },
    ],
  };

  it('round-trips a SaveBlob through JSON text', () => {
    expect(parseSave(serializeSave(blob))).toEqual(blob);
  });

  it('returns null on corrupt JSON', () => {
    expect(parseSave('{not-json')).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(parseSave('')).toBeNull();
  });

  it('does not reference localStorage in sim/save.ts', () => {
    const src = readFileSync('src/sim/save.ts', 'utf8');
    expect(src).not.toMatch(/localStorage/);
  });
});
