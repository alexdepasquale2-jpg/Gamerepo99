/** Render-side painters for continuous overworld chunks. Presentation only. */

import type Phaser from 'phaser';
import type { ChunkTiles, FacilityRenderView, TileRenderView } from '../../sim/map/types';
import { CHUNK_SIZE, TILE_PX } from '../../sim/map/constants';
import { lookupAsset } from '../asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from '../depth-sort';
import {
  GRASS_CALM_TEX,
  GRASS_WORLD_TEX,
  HERO_TEX,
  SETTLEMENT_TEX,
  SHADOW_TEX,
  sheetTextureKey,
} from '../sheet-frames';
import {
  addGrassTintOverlay,
  bakeCliffStrip,
  bakeRoadRibbon,
  expandMeanderRoadKeys,
  roadMeanderOffset,
} from './chunk-strips';

export { expandMeanderRoadKeys, roadMeanderOffset };

export type PaintHost = {
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
};

export const PROP_ASSET: Record<string, string> = {
  field: 'crop.crop_wheat',
  mine: 'facility.mine.idle',
  camp: 'facility.lumber_camp.idle',
  waystation: 'facility.waystation.idle',
};

export type GroundPaint =
  | { kind: 'grass'; key: string; frame: string }
  | { kind: 'biome'; key: string; frame: string }
  | { kind: 'road'; key: string; frame: string };

function hash2(a: number, b: number): number {
  return Math.abs((a * 73856093) ^ (b * 19349663)) >>> 0;
}

export function isRoadBiome(biomeId: string): boolean {
  return biomeId === 'road' || biomeId.startsWith('road');
}

/**
 * Break 8×8 atlas repeat: hash (q,r) into all 64 frames (not world-aligned cols).
 */
export function grassFrameHashed(q: number, r: number): {
  frame: string;
  flipX: boolean;
  flipY: boolean;
} {
  const h = hash2(q * 17 + 3, r * 29 + 7);
  return {
    frame: String(h % 64),
    flipX: (h & 64) !== 0,
    flipY: (h & 128) !== 0,
  };
}

export function groundPaintFor(tile: TileRenderView): GroundPaint {
  if (isRoadBiome(tile.biomeId)) {
    const entry = lookupAsset('road.road') ?? lookupAsset('road.track');
    return { kind: 'road', key: 'sheet-ground', frame: String(entry?.frame ?? 5) };
  }
  const { frame } = grassFrameHashed(tile.q, tile.r);
  return { kind: 'grass', key: GRASS_WORLD_TEX, frame };
}

export function biomeAccentFor(
  tile: TileRenderView,
): { key: string; frame: string } | null {
  if (isRoadBiome(tile.biomeId)) return null;
  const biome = lookupAsset(`biome.${tile.biomeId}`);
  if (!biome) return null;
  if (hash2(tile.q + 1, tile.r + 3) % 5 !== 0) return null;
  return { key: sheetTextureKey(biome.sheet), frame: String(biome.frame) };
}

export function heroWalkAnim(dx: number, dy: number): { key: string; flipX: boolean } {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0
      ? { key: 'hero-walk-left', flipX: false }
      : { key: 'hero-walk-right', flipX: true };
  }
  return dy < 0
    ? { key: 'hero-walk-up', flipX: false }
    : { key: 'hero-walk-down', flipX: false };
}

export function addSoftShadow(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  footX: number,
  footY: number,
  scaleX = 1,
): Phaser.GameObjects.Image | null {
  if (!host.textures.exists(SHADOW_TEX)) return null;
  const sh = host.add.image(footX, footY - 2, SHADOW_TEX);
  sh.setOrigin(0.5, 0.5);
  sh.setScale(scaleX, 1);
  sh.setDepth(footY - 0.5);
  sh.setAlpha(0.85);
  container?.add(sh);
  return sh;
}

function paintGrassTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  const { frame, flipX, flipY } = grassFrameHashed(tile.q, tile.r);
  if (host.textures.exists(GRASS_WORLD_TEX) && host.textures.get(GRASS_WORLD_TEX).has(frame)) {
    const img = host.add.image(cx, cy, GRASS_WORLD_TEX, frame);
    img.setDisplaySize(TILE_PX + 3, TILE_PX + 3);
    img.setFlipX(flipX);
    img.setFlipY(flipY);
    img.setDepth(0);
    container.add(img);
  } else {
    const key = `${GRASS_CALM_TEX}-0`;
    const img = host.add.image(cx, cy, host.textures.exists(key) ? key : GRASS_CALM_TEX);
    img.setDisplaySize(TILE_PX + 3, TILE_PX + 3);
    img.setDepth(0);
    container.add(img);
  }

  if (hash2(tile.q * 3, tile.r * 7) % 13 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const ox = (hash2(tile.r, tile.q) % 9) - 4;
    const g = host.add.rectangle(foot.x + ox, foot.y - 5, 2, 5, 0x3d6b28);
    g.setAlpha(0.7);
    g.setDepth(0.15);
    container.add(g);
  }
  if (hash2(tile.q + 9, tile.r + 2) % 31 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const fl = host.add.rectangle(foot.x - 3, foot.y - 7, 2, 2, 0xf0d878);
    fl.setDepth(0.16);
    container.add(fl);
  }
}

export function paintGroundTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  _roadKeys?: Set<string>,
  meanderKeys?: Set<string>,
): void {
  // Roads are baked as a ribbon strip — skip per-tile dirt (still paint grass under)
  const onMeander = meanderKeys?.has(`${tile.q},${tile.r}`);
  paintGrassTile(host, container, tile);
  if (onMeander || isRoadBiome(tile.biomeId)) {
    // Leave grass; ribbon draw sits above at depth 0.5
    return;
  }
}

export function paintProp(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  prop: FacilityRenderView,
): void {
  const foot = tileFootWorld(prop.position.x, prop.position.y);
  const assetKey = PROP_ASSET[prop.type] ?? `facility.${prop.type}.${prop.state || 'idle'}`;
  const entry = lookupAsset(assetKey);
  addSoftShadow(host, container, foot.x, foot.y, prop.type === 'field' ? 0.7 : 1.0);

  if (prop.type === 'field') {
    const texKey = entry ? sheetTextureKey(entry.sheet) : 'sheet-crops';
    const fr = entry ? String(entry.frame) : '0';
    if (host.textures.exists(texKey) && host.textures.get(texKey).has(fr)) {
      const img = host.add.image(foot.x, foot.y, texKey, fr);
      applySpriteSort(img);
      img.setDisplaySize(TILE_PX * 0.95, TILE_PX * 0.95);
      container?.add(img);
      return;
    }
    const sheaf = host.add.rectangle(foot.x, foot.y - 6, 10, 14, 0xd4b84a);
    applySpriteSort(sheaf);
    container?.add(sheaf);
    return;
  }

  const colors: Record<string, number> = {
    mine: 0x6a6a72,
    camp: 0x8b5a2b,
    waystation: 0xc4a574,
  };
  const wall = host.add.rectangle(foot.x, foot.y - 14, 22, 26, colors[prop.type] ?? 0x8b5a2b);
  applySpriteSort(wall);
  const roof = host.add.rectangle(foot.x, foot.y - 30, 26, 10, 0xa84532);
  roof.setDepth(foot.y + 0.2);
  container?.add(wall);
  container?.add(roof);
}

/** @deprecated Prefer bakeCliffStrip — kept for API compat / tests. */
export function paintCliffStrip(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 16,
): void {
  const key = `cliff-strip-${q},${r},${widthTiles}`;
  const img = bakeCliffStrip(host, key, widthTiles);
  if (!img) return;
  const origin = tileToWorld(q, r);
  img.setPosition(origin.x, origin.y - 20);
  img.setDepth(origin.y + TILE_PX);
  container?.add(img);
}

/** Lower terrace shade band under a baked cliff (same contour idea). */
export function paintLowerTerraceShade(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 16,
  depthTiles = 6,
): void {
  for (let i = 0; i < widthTiles; i++) {
    const xPx = i * TILE_PX;
    const wobble = Math.round(
      (10 * Math.sin(xPx * 0.018 + 0.4) + 5 * Math.sin(xPx * 0.041 + 1.3)) / TILE_PX,
    );
    const localR = r + wobble;
    const endDist = Math.min(i, widthTiles - 1 - i);
    if (endDist === 0) continue;
    for (let dr = 1; dr <= depthTiles; dr++) {
      const { x, y } = tileToWorld(q + i, localR + dr);
      const a = Math.max(0.25, 0.72 - dr * 0.08);
      const shade = host.add.rectangle(
        x + TILE_PX / 2,
        y + TILE_PX / 2,
        TILE_PX + 3,
        TILE_PX + 3,
        0x356028,
        a,
      );
      shade.setDepth(0.08);
      container?.add(shade);
    }
  }
}

export function paintTree(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  variant = 0,
): void {
  const foot = tileFootWorld(q, r);
  addSoftShadow(host, container, foot.x, foot.y, 0.7);
  if (host.textures.exists('sheet-buildings')) {
    const tex = host.textures.get('sheet-buildings');
    const fr =
      variant % 2 === 0 && tex.has('tree') ? 'tree' : tex.has('tree-b') ? 'tree-b' : 'tree';
    if (tex.has(fr)) {
      const img = host.add.image(foot.x, foot.y, 'sheet-buildings', fr);
      applySpriteSort(img);
      const s = 0.95 + (variant % 3) * 0.12;
      img.setDisplaySize(TILE_PX * 0.95 * s, TILE_PX * 2.6 * s);
      container?.add(img);
      return;
    }
  }
}

function paintFence(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q0: number,
  r: number,
  tiles: number,
): void {
  for (let i = 0; i < tiles; i++) {
    const foot = tileFootWorld(q0 + i * 0.55, r);
    const post = host.add.rectangle(foot.x, foot.y - 6, 3, 12, 0x6b4423);
    applySpriteSort(post);
    container?.add(post);
    if (i < tiles - 1) {
      const rail = host.add.rectangle(foot.x + 8, foot.y - 10, 14, 2, 0x8b5a2b);
      rail.setDepth(foot.y + 0.1);
      container?.add(rail);
    }
  }
}

function paintVillager(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  frame: string,
  flipX = false,
): void {
  const foot = tileFootWorld(q, r);
  addSoftShadow(host, container, foot.x, foot.y, 0.8);
  if (host.textures.exists(HERO_TEX) && host.textures.get(HERO_TEX).has(frame)) {
    const sp = host.add.image(foot.x, foot.y, HERO_TEX, frame);
    sp.setScale(2);
    sp.setFlipX(flipX);
    applySpriteSort(sp);
    container?.add(sp);
  }
}

function paintCrate(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
): void {
  const foot = tileFootWorld(q, r);
  addSoftShadow(host, container, foot.x, foot.y, 0.5);
  const box = host.add.rectangle(foot.x, foot.y - 6, 12, 10, 0x8b6914);
  box.setStrokeStyle(1, 0x5a4010, 1);
  applySpriteSort(box);
  container?.add(box);
}

export function paintTownMarker(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { id: string; q: number; r: number },
): void {
  const foot = tileFootWorld(town.q, town.r);

  // Single seamless settlement stamp (inn + walkway + house) — no join seam
  addSoftShadow(host, container, foot.x + TILE_PX, foot.y, 2.4);
  if (host.textures.exists(SETTLEMENT_TEX)) {
    const img = host.add.image(foot.x + TILE_PX * 0.8, foot.y, SETTLEMENT_TEX);
    applySpriteSort(img);
    img.setDisplaySize(TILE_PX * 6.4, TILE_PX * 3.8);
    container?.add(img);
  } else if (
    host.textures.exists('sheet-buildings') &&
    host.textures.get('sheet-buildings').has('inn')
  ) {
    const img = host.add.image(foot.x, foot.y, 'sheet-buildings', 'inn');
    applySpriteSort(img);
    img.setDisplaySize(TILE_PX * 4.2, TILE_PX * 4.0);
    container?.add(img);
  }

  for (const [dq, dr, v] of [
    [-2.6, 0.2, 0],
    [-3.0, -0.5, 1],
    [5.2, 0.3, 2],
    [5.8, -0.4, 0],
  ] as const) {
    paintTree(host, container, town.q + dq, town.r + dr, v);
  }

  paintFence(host, container, town.q - 1.5, town.r + 1.45, 8);
  paintCrate(host, container, town.q + 1.2, town.r + 0.85);
  paintCrate(host, container, town.q + 1.6, town.r + 0.95);
  paintCrate(host, container, town.q - 0.8, town.r + 0.65);

  paintVillager(host, container, town.q + 0.6, town.r + 1.2, '7');
  paintVillager(host, container, town.q + 2.0, town.r + 1.0, '4');
  paintVillager(host, container, town.q - 0.4, town.r + 1.4, '1', true);
  paintVillager(host, container, town.q + 3.5, town.r + 1.1, '7');

  const labelY = foot.y - TILE_PX * 4.2 - 12;
  const label = host.add
    .text(foot.x + TILE_PX * 1.2, labelY, town.id.replace(/_/g, ' '), {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#f2e9e4',
      backgroundColor: '#00000099',
      padding: { x: 4, y: 2 },
    })
    .setOrigin(0.5, 1)
    .setDepth(foot.y + 30);
  container?.add(label);
}

export function paintChunkContents(
  host: PaintHost,
  chunk: ChunkTiles,
): Phaser.GameObjects.Container {
  const container = host.add.container(0, 0);
  const roadKeys = new Set(
    chunk.tiles.filter((t) => isRoadBiome(t.biomeId)).map((t) => `${t.q},${t.r}`),
  );
  const meander = expandMeanderRoadKeys(roadKeys);

  const baseQ = chunk.cx * CHUNK_SIZE;
  const baseR = chunk.cy * CHUNK_SIZE;

  for (const tile of chunk.tiles) {
    paintGroundTile(host, container, tile, roadKeys, meander);
  }

  addGrassTintOverlay(host, container, baseQ, baseR, CHUNK_SIZE);

  // Organic road ribbon (soft edges) — one bake per chunk
  if (meander.size > 0) {
    const key = `road-ribbon-${chunk.cx},${chunk.cy}`;
    const ribbon = bakeRoadRibbon(host, key, meander, baseQ, baseR, CHUNK_SIZE);
    if (ribbon) container.add(ribbon);
  }

  return container;
}

/** Scene-level continuous cliff near first settlement. */
export function paintTownCliff(
  host: PaintHost,
  town: { q: number; r: number },
): void {
  const cq = town.q - 5;
  const cr = town.r + 4;
  // Lower shade is baked into the cliff strip canvas (no tile grid)
  paintCliffStrip(host, null, cq, cr, 20);
}
