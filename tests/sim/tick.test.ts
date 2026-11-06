import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';

describe('deterministic tick', () => {
  it('advances tick count by one', () => {
    const world = createWorld({ seed: 11, width: 8, height: 8, npcCount: 3 });
    expect(world.tick).toBe(0);
    tick(world);
    expect(world.tick).toBe(1);
    tick(world);
    expect(world.tick).toBe(2);
  });

  it('moves npcs within map bounds using seeded rng', () => {
    const world = createWorld({ seed: 123, width: 10, height: 10, npcCount: 4 });
    for (let i = 0; i < 20; i++) tick(world);
    for (const npc of world.npcs) {
      expect(npc.x).toBeGreaterThanOrEqual(0);
      expect(npc.x).toBeLessThan(world.width);
      expect(npc.y).toBeGreaterThanOrEqual(0);
      expect(npc.y).toBeLessThan(world.height);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createWorld({ seed: 55, width: 12, height: 12, npcCount: 5 });
    const b = createWorld({ seed: 55, width: 12, height: 12, npcCount: 5 });
    for (let i = 0; i < 30; i++) {
      tick(a);
      tick(b);
    }
    expect(a.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y }))).toEqual(
      b.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    );
    expect(a.tick).toBe(b.tick);
  });

  it('emits a tick event each step', () => {
    const world = createWorld({ seed: 3, width: 6, height: 6, npcCount: 2 });
    const seen: number[] = [];
    world.bus.on('tick', (payload: { tick: number }) => {
      seen.push(payload.tick);
    });
    tick(world);
    tick(world);
    expect(seen).toEqual([1, 2]);
  });
});
