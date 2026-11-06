export type Npc = {
  id: string;
  x: number;
  y: number;
  color: number;
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
