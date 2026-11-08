/** Pure map render views for TileSource consumers (no Phaser / dyn). */

export type ChunkCoord = { cx: number; cy: number };

export type TileRenderView = {
  q: number;
  r: number;
  biomeId: string;
  warmth: number;
};

export type FacilityRenderView = {
  id: string;
  type: string;
  state: string;
  warmth: number;
  position: { x: number; y: number };
};

export type ChunkTiles = {
  cx: number;
  cy: number;
  tiles: TileRenderView[];
  props: FacilityRenderView[];
};
