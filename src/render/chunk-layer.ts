/** Mount/unmount stamp chunks into a Phaser scene. Presentation only. */

import Phaser from 'phaser';
import type { ChunkCoord, ChunkTiles, TileSource } from '../sim';
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import { BAKED_SHEETS, lookupAsset } from './asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from './depth-sort';

const GROUND = 0x2f4f3a;
const ROAD = 0x8a7355;
const TOWN = 0xd97b3a;
const PROP_FILL: Record<string, number> = {
  field: 0x6b8f3a,
  mine: 0x6a6a72,
  camp: 0x8b5a2b,
  waystation: 0xc4a574,
};

const PROP_ASSET: Record<string, string> = {
  field: 'crop.wheat',
  mine: 'facility.mine.idle',
  camp: 'facility.lumber_camp.idle',
  waystation: 'facility.waystation.idle',
};

export type ChunkLayerHost = {
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
};

export type ChunkLayer = {
  sync: (coords: ChunkCoord[]) => void;
  destroy: () => void;
};

function biomeColor(biomeId: string): number {
  if (biomeId === 'road' || biomeId.startsWith('road')) return ROAD;
  return GROUND;
}

function tryPropImage(
  host: ChunkLayerHost,
  container: Phaser.GameObjects.Container,
  type: string,
  x: number,
  y: number,
): boolean {
  const key = PROP_ASSET[type];
  if (!key) return false;
  const entry = lookupAsset(key);
  if (!entry) return false;
  const sheetPath =
    (BAKED_SHEETS as Record<string, string | undefined>)[entry.sheet] ?? entry.sheet;
  const texKey = String(sheetPath).split('/').pop()?.replace(/\.png$/, '') ?? entry.sheet;
  if (!host.textures.exists(texKey)) return false;
  const img = host.add.image(x, y, texKey);
  applySpriteSort(img);
  img.setDisplaySize(TILE_PX, TILE_PX);
  container.add(img);
  return true;
}

function paintChunk(host: ChunkLayerHost, chunk: ChunkTiles): Phaser.GameObjects.Container {
  const baseX = chunk.cx * CHUNK_SIZE * TILE_PX;
  const baseY = chunk.cy * CHUNK_SIZE * TILE_PX;
  const container = host.add.container(0, 0);

  const under = host.add.rectangle(
    baseX + (CHUNK_SIZE * TILE_PX) / 2,
    baseY + (CHUNK_SIZE * TILE_PX) / 2,
    CHUNK_SIZE * TILE_PX,
    CHUNK_SIZE * TILE_PX,
    GROUND,
  );
  container.add(under);

  for (const tile of chunk.tiles) {
    if (tile.biomeId !== 'road' && !tile.biomeId.startsWith('road')) continue;
    const { x, y } = tileToWorld(tile.q, tile.r);
    container.add(
      host.add.rectangle(
        x + TILE_PX / 2,
        y + TILE_PX / 2,
        TILE_PX,
        TILE_PX,
        biomeColor(tile.biomeId),
      ),
    );
  }

  for (const prop of chunk.props) {
    const foot = tileFootWorld(prop.position.x, prop.position.y);
    if (!tryPropImage(host, container, prop.type, foot.x, foot.y)) {
      const fill = PROP_FILL[prop.type] ?? 0x888888;
      const rect = host.add.rectangle(foot.x, foot.y, TILE_PX * 0.7, TILE_PX * 0.9, fill);
      applySpriteSort(rect);
      container.add(rect);
    }
  }

  return container;
}

/** Stream TileSource chunks: mount listed coords, destroy the rest. */
export function createChunkLayer(
  host: ChunkLayerHost,
  source: TileSource,
  townMarkers: { id: string; q: number; r: number }[],
): ChunkLayer {
  const mounted = new Map<string, Phaser.GameObjects.Container>();
  const keyOf = (c: ChunkCoord) => `${c.cx},${c.cy}`;

  const towns = host.add.container(0, 0);
  for (const town of townMarkers) {
    const foot = tileFootWorld(town.q, town.r);
    const rect = host.add.rectangle(foot.x, foot.y, TILE_PX * 1.2, TILE_PX * 1.2, TOWN);
    applySpriteSort(rect);
    towns.add(rect);
    towns.add(
      host.add
        .text(foot.x, foot.y - TILE_PX * 1.2, town.id, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#f2e9e4',
        })
        .setOrigin(0.5, 1)
        .setDepth(foot.y + 1),
    );
  }

  return {
    sync(coords: ChunkCoord[]) {
      const want = new Set(coords.map(keyOf));
      for (const [k, container] of mounted) {
        if (!want.has(k)) {
          container.destroy(true);
          mounted.delete(k);
        }
      }
      for (const coord of coords) {
        const k = keyOf(coord);
        if (mounted.has(k)) continue;
        mounted.set(k, paintChunk(host, source.getChunk(coord)));
      }
    },
    destroy() {
      for (const c of mounted.values()) c.destroy(true);
      mounted.clear();
      towns.destroy(true);
    },
  };
}
