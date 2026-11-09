import { describe, expect, it } from 'vitest';
import { circleBlocked } from '../../src/home/map';
import { addBuilding, createHomeWorld, stepHome } from '../../src/home/world';

describe('La Mancha world', () => {
  it('spawns a market pack of three or four and leaves the dreaming buildings out', () => {
    for (const seed of [1, 2, 7, 42]) {
      const world = createHomeWorld({ seed, populate: true, mercyMs: 0 });
      const stalls = world.buildings.filter((b) => b.kind === 'market_stall');
      expect(stalls.length).toBeGreaterThanOrEqual(3);
      expect(stalls.length).toBeLessThanOrEqual(4);
      expect(new Set(stalls.map((s) => s.packId)).size).toBe(1);
      expect(world.buildings.some((b) => b.kind === 'castle' || b.kind === 'church')).toBe(false);
      expect(world.buildings.some((b) => b.kind === 'windmill')).toBe(true);
      expect(world.buildings.some((b) => b.kind === 'blacksmith')).toBe(true);
      expect(circleBlocked(world.map, world.player.x, world.player.y, world.player.radius)).toBe(false);
    }
  });

  it('is deterministic for the same seed and the same footsteps', () => {
    const run = (seed: number) => {
      const world = createHomeWorld({ seed, populate: true, mercyMs: 0 });
      for (let i = 0; i < 40; i++) {
        const input = { x: i % 20 < 10 ? 1 : -1, y: i % 17 < 8 ? 1 : 0 };
        stepHome(world, input, 16);
      }
      return {
        player: [world.player.x, world.player.y, world.player.alive],
        buildings: world.buildings.map((b) => [b.id, b.kind, b.state, Math.round(b.x), Math.round(b.y)]),
        deaths: world.deaths,
      };
    };
    expect(run(4)).toEqual(run(4));
    expect(run(4)).not.toEqual(run(5));
  });

  it('resolves a tug by letting the stronger building swallow and grow', () => {
    const world = createHomeWorld({ seed: 3, populate: false, mercyMs: 0 });
    const winner = addBuilding(world, 'farmhouse', world.player.x + 28, world.player.y);
    const loser = addBuilding(world, 'farmhouse', world.player.x - 56, world.player.y);
    winner.scale = 2;
    loser.scale = 1;
    winner.state = 'grab';
    loser.state = 'grab';
    for (let i = 0; i < 10 && world.player.alive; i++) stepHome(world, { x: 0, y: 0 }, 100);
    expect(world.player.alive).toBe(false);
    expect(world.book.entries.some((e) => e.key === 'farmhouse:swallow')).toBe(true);
    expect(winner.swallows).toBe(1);
    expect(winner.scale).toBeGreaterThan(2);
    expect(loser.swallows).toBe(0);
  });

  it('holds a dead heat without a swallow', () => {
    const world = createHomeWorld({ seed: 3, populate: false, mercyMs: 0 });
    const left = addBuilding(world, 'tavern', world.player.x - 36, world.player.y);
    const right = addBuilding(world, 'bakery', world.player.x + 36, world.player.y);
    left.state = 'grab';
    right.state = 'grab';
    for (let i = 0; i < 8; i++) stepHome(world, { x: 0, y: 0 }, 100);
    expect(world.player.alive).toBe(true);
    expect(world.tug?.stalemate).toBe(true);
    expect(world.book.totalDeaths).toBe(0);
  });

  it('puts you back outside after a death, still counted in the book', () => {
    const world = createHomeWorld({ seed: 9, populate: false, mercyMs: 0 });
    const shack = addBuilding(world, 'outhouse', world.player.x, world.player.y + 18);
    shack.state = 'strike';
    shack.attackId = 'door_jaw';
    shack.resolved = false;
    stepHome(world, { x: 0, y: 0 }, 16);
    expect(world.player.alive).toBe(false);
    const homeScale = shack.scale;
    for (let i = 0; i < 20; i++) stepHome(world, { x: 0, y: 0 }, 100);
    expect(world.player.alive).toBe(true);
    expect(world.deaths).toBe(1);
    expect(world.book.entries[0]?.count).toBe(1);
    expect(shack.scale).toBe(homeScale);
    expect(shack.state).toBe('doze');
    expect(world.mercyMs).toBeGreaterThan(0);
  });
});
