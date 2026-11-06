import { createEventBus, type EventBus } from './event-bus';
import { createRng, type Rng } from './rng';
import type { Npc, Tile, WorldConfig } from './types';

export type World = {
  seed: number;
  width: number;
  height: number;
  tick: number;
  tiles: Tile[][];
  npcs: Npc[];
  rng: Rng;
  bus: EventBus;
};

const NPC_COLORS = [0xe8a87c, 0x85dcb8, 0xc38d9e, 0x41b3a3, 0xe27d60];

function buildTiles(width: number, height: number, rng: Rng): Tile[][] {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < width; x++) {
      const roll = rng.next();
      if (roll < 0.12) row.push({ walkable: true, kind: 'path' });
      else if (roll < 0.18) row.push({ walkable: false, kind: 'stone' });
      else row.push({ walkable: true, kind: 'grass' });
    }
    tiles.push(row);
  }
  // Keep center clear so NPCs always have space.
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        tiles[y][x] = { walkable: true, kind: 'path' };
      }
    }
  }
  return tiles;
}

function spawnNpcs(count: number, width: number, height: number, tiles: Tile[][], rng: Rng): Npc[] {
  const npcs: Npc[] = [];
  let attempts = 0;
  while (npcs.length < count && attempts < count * 40) {
    attempts++;
    const x = rng.nextInt(0, width);
    const y = rng.nextInt(0, height);
    if (!tiles[y][x].walkable) continue;
    if (npcs.some((n) => n.x === x && n.y === y)) continue;
    npcs.push({
      id: `npc-${npcs.length + 1}`,
      x,
      y,
      color: NPC_COLORS[npcs.length % NPC_COLORS.length],
    });
  }
  return npcs;
}

export function createWorld(config: WorldConfig): World {
  const rng = createRng(config.seed);
  const tiles = buildTiles(config.width, config.height, rng);
  const npcs = spawnNpcs(config.npcCount, config.width, config.height, tiles, rng);
  return {
    seed: config.seed,
    width: config.width,
    height: config.height,
    tick: 0,
    tiles,
    npcs,
    rng,
    bus: createEventBus(),
  };
}
