import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createWorld } from '../../src/sim/world';

describe('createWorld', () => {
  it('builds a deterministic tile grid and npc set for a seed', () => {
    const a = createWorld({ seed: 42, width: 8, height: 6, npcCount: 3 });
    const b = createWorld({ seed: 42, width: 8, height: 6, npcCount: 3 });
    expect(a.width).toBe(8);
    expect(a.height).toBe(6);
    expect(a.tiles).toHaveLength(6);
    expect(a.tiles[0]).toHaveLength(8);
    expect(a.npcs).toHaveLength(3);
    expect(a.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y }))).toEqual(
      b.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    );
    for (const npc of a.npcs) {
      expect(a.tiles[npc.y][npc.x].walkable).toBe(true);
    }
  });

  it('keeps center tiles walkable', () => {
    const world = createWorld({ seed: 1, width: 10, height: 10, npcCount: 1 });
    expect(world.tiles[5][5].walkable).toBe(true);
    expect(world.tiles[5][5].kind).toBe('path');
  });

  it('does not store presentation colors on npcs or in world source', () => {
    const world = createWorld({ seed: 9, width: 8, height: 8, npcCount: 2 });
    for (const npc of world.npcs) {
      expect(npc).not.toHaveProperty('color');
    }
    const src = readFileSync('src/sim/world.ts', 'utf8');
    expect(src).not.toMatch(/NPC_COLORS/);
    expect(src).not.toMatch(/0x[0-9a-fA-F]{6}/);
  });
});
