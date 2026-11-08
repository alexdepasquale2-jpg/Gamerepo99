/** M1 wander demo types (kept for world.ts). */
export type Npc = {
  id: string;
  x: number;
  y: number;
};

export type Tile = {
  walkable: boolean;
  kind: 'grass' | 'path' | 'stone';
};

export type WorldConfig = {
  seed: number;
  width: number;
  height: number;
  npcCount: number;
};

export * from './data';
export * from './runtime';
