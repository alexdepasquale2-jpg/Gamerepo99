import type { World } from './world';

const DIRS: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, 0],
];

function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function tick(world: World): void {
  world.tick += 1;

  for (const npc of world.npcs) {
    const [dx, dy] = DIRS[world.rng.nextInt(0, DIRS.length)];
    const nx = npc.x + dx;
    const ny = npc.y + dy;
    if (!inBounds(world, nx, ny)) continue;
    if (!world.tiles[ny][nx].walkable) continue;
    npc.x = nx;
    npc.y = ny;
    world.bus.emit('moved', { id: npc.id, x: npc.x, y: npc.y, tick: world.tick });
  }

  world.bus.emit('tick', { tick: world.tick });
}
