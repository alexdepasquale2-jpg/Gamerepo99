/** Render-side painters for continuous overworld chunks. Presentation only. */

import type Phaser from 'phaser';
import type { ChunkTiles, FacilityRenderView, TileRenderView } from '../../sim/map/types';
import { TILE_PX } from '../../sim/map/constants';
import { lookupAsset } from '../asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from '../depth-sort';
import {
  DIRT_CALM_TEX,
  GRASS_CALM_TEX,
  SHADOW_TEX,
  sheetTextureKey,
} from '../sheet-frames';

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
 * Pure ground/road choice for tests + callers.
 * Grass → calm procedural variants (not noisy sheet-ground 0–2).
 * Road → manifest road.* frame on sheet-ground (contract); painter may underlay dirt.
 */
export function groundPaintFor(tile: TileRenderView): GroundPaint {
  if (isRoadBiome(tile.biomeId)) {
    const entry = lookupAsset('road.road') ?? lookupAsset('road.track');
    return { kind: 'road', key: 'sheet-ground', frame: String(entry?.frame ?? 5) };
  }
  const variant = hash2(tile.q, tile.r) % 3;
  return { kind: 'grass', key: `${GRASS_CALM_TEX}-${variant}`, frame: '__FULL__' };
}

/** Biome accents disabled for live paint (square sheet-biomes patches read as seams). */
export function biomeAccentFor(
  tile: TileRenderView,
): { key: string; frame: string } | null {
  if (isRoadBiome(tile.biomeId)) return null;
  const biome = lookupAsset(`biome.${tile.biomeId}`);
  if (!biome) return null;
  // Keep pure helper for tests, but require a rare hit so callers can still unit-test.
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

function placeFullTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  key: string,
  depth: number,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  if (host.textures.exists(key)) {
    const img = host.add.image(cx, cy, key);
    img.setDisplaySize(TILE_PX + 1, TILE_PX + 1); // +1 kills hairline seams
    img.setDepth(depth);
    container.add(img);
    return;
  }
  container.add(host.add.rectangle(cx, cy, TILE_PX, TILE_PX, 0x82b84a));
}

function placeSheetTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  key: string,
  frame: string,
  depth: number,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  if (host.textures.exists(key) && host.textures.get(key).has(frame)) {
    const img = host.add.image(cx, cy, key, frame);
    img.setDisplaySize(TILE_PX + 1, TILE_PX + 1);
    img.setDepth(depth);
    container.add(img);
    return;
  }
  placeFullTile(host, container, tile, DIRT_CALM_TEX, depth);
}

/** Dirt fill frame on sheet-ground row 2 (visual road); edge frames 6–11 = grass/dirt split. */
function roadVisualFrame(
  tile: TileRenderView,
  roadKeys: Set<string>,
): { frame: string; useDirtCalm: boolean } {
  const n = roadKeys.has(`${tile.q},${tile.r - 1}`);
  const s = roadKeys.has(`${tile.q},${tile.r + 1}`);
  const e = roadKeys.has(`${tile.q + 1},${tile.r}`);
  const w = roadKeys.has(`${tile.q - 1},${tile.r}`);
  // North edge of ribbon (grass above, dirt below) → frame 6–8 family
  if (!n && s) return { frame: '6', useDirtCalm: false };
  // South edge
  if (n && !s) return { frame: '7', useDirtCalm: false };
  // Isolated / interior
  if (n || s || e || w) return { frame: '12', useDirtCalm: true };
  return { frame: '12', useDirtCalm: true };
}

export function paintGroundTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  roadKeys?: Set<string>,
): void {
  const choice = groundPaintFor(tile);
  if (choice.kind === 'road') {
    // Calm grass underlay so ribbon doesn't punch holes
    const gVar = hash2(tile.q, tile.r) % 3;
    placeFullTile(host, container, tile, `${GRASS_CALM_TEX}-${gVar}`, 0);
    const roads = roadKeys ?? new Set<string>();
    const vis = roadVisualFrame(tile, roads);
    if (vis.useDirtCalm && host.textures.exists(DIRT_CALM_TEX)) {
      placeFullTile(host, container, tile, DIRT_CALM_TEX, 0.5);
    } else {
      placeSheetTile(host, container, tile, 'sheet-ground', vis.frame, 0.5);
    }
    return;
  }

  const key = host.textures.exists(choice.key) ? choice.key : GRASS_CALM_TEX;
  placeFullTile(host, container, tile, key, 0);

  // Sparse organic tufts / flowers (presentation only — not grid-locked squares)
  if (hash2(tile.q * 3, tile.r * 7) % 9 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const ox = (hash2(tile.r, tile.q) % 7) - 3;
    const g = host.add.rectangle(foot.x + ox, foot.y - 5, 2, 5, 0x3d6b28);
    g.setAlpha(0.75);
    g.setDepth(0.15);
    container.add(g);
  }
  if (hash2(tile.q + 9, tile.r + 2) % 23 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const fl = host.add.rectangle(foot.x - 3, foot.y - 7, 2, 2, 0xf0d878);
    fl.setDepth(0.16);
    container.add(fl);
  }
}

export function paintProp(
  host: PaintHost,
  target: Phaser.GameObjects.Container | PaintHost,
  prop: FacilityRenderView,
): void {
  const foot = tileFootWorld(prop.position.x, prop.position.y);
  const assetKey = PROP_ASSET[prop.type] ?? `facility.${prop.type}.${prop.state || 'idle'}`;
  const entry = lookupAsset(assetKey);
  const container = 'add' in target && !('list' in (target as object)) ? null : (target as Phaser.GameObjects.Container);
  const addTo = (obj: Phaser.GameObjects.GameObject) => {
    if (container && 'add' in container) container.add(obj);
  };

  addSoftShadow(host, container, foot.x, foot.y, prop.type === 'field' ? 0.7 : 1.15);

  // Crops / fields — sheet-crops
  if (prop.type === 'field') {
    const texKey = entry ? sheetTextureKey(entry.sheet) : 'sheet-crops';
    const fr = entry ? String(entry.frame) : '0';
    if (host.textures.exists(texKey) && host.textures.get(texKey).has(fr)) {
      const img = host.add.image(foot.x, foot.y, texKey, fr);
      applySpriteSort(img);
      img.setDisplaySize(TILE_PX * 0.95, TILE_PX * 0.95);
      addTo(img);
      return;
    }
    // Wheat stub — golden stalks
    const sheaf = host.add.rectangle(foot.x, foot.y - 6, 10, 14, 0xd4b84a);
    applySpriteSort(sheaf);
    addTo(sheaf);
    return;
  }

  // Facilities — prefer named wing/inn stamps (grid cells on sheet-buildings are mostly empty)
  if (host.textures.exists('sheet-buildings')) {
    const tex = host.textures.get('sheet-buildings');
    const stamp =
      prop.type === 'waystation' && tex.has('wing')
        ? 'wing'
        : tex.has('inn')
          ? 'inn'
          : null;
    if (stamp) {
      const img = host.add.image(foot.x, foot.y, 'sheet-buildings', stamp);
      applySpriteSort(img);
      img.setDisplaySize(
        prop.type === 'waystation' ? TILE_PX * 2.2 : TILE_PX * 3.2,
        prop.type === 'waystation' ? TILE_PX * 2.6 : TILE_PX * 3.6,
      );
      addTo(img);
      return;
    }
  }

  // Readable geometric fallback (no black boxes)
  const wall = host.add.rectangle(foot.x, foot.y - 18, 28, 32, 0xc4a574);
  applySpriteSort(wall);
  const roof = host.add.rectangle(foot.x, foot.y - 40, 34, 14, 0xa84532);
  roof.setDepth(foot.y + 0.2);
  addTo(wall);
  addTo(roof);
}

export function paintCliffStrip(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 10,
): void {
  const texKey = 'sheet-cliff';
  const foot0 = tileFootWorld(q, r);

  if (host.textures.exists(texKey) && host.textures.get(texKey).has('terrace')) {
    const img = host.add.image(
      foot0.x + (widthTiles * TILE_PX) / 2 - TILE_PX / 2,
      foot0.y + 8,
      texKey,
      'terrace',
    );
    img.setOrigin(0.5, 1);
    img.setDisplaySize(widthTiles * TILE_PX, TILE_PX * 2.4);
    img.setDepth(foot0.y - 1);
    container?.add(img);
    return;
  }

  if (!host.textures.exists(texKey)) return;
  const tex = host.textures.get(texKey);
  for (let i = 0; i < widthTiles; i++) {
    const foot = tileFootWorld(q + i, r);
    for (const [fr, yOff, scaleY] of [
      ['lip', -TILE_PX * 0.85, 0.9],
      ['face', -TILE_PX * 0.35, 1.1],
      ['base', TILE_PX * 0.15, 0.8],
    ] as const) {
      if (!tex.has(fr)) continue;
      const img = host.add.image(foot.x, foot.y + yOff, texKey, fr);
      img.setOrigin(0.5, 1);
      img.setDisplaySize(TILE_PX + 2, TILE_PX * scaleY);
      img.setDepth(foot.y + yOff);
      container?.add(img);
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
  addSoftShadow(host, container, foot.x, foot.y, 0.85);
  if (host.textures.exists('sheet-buildings')) {
    const tex = host.textures.get('sheet-buildings');
    const fr = variant % 2 === 0 && tex.has('tree') ? 'tree' : tex.has('tree-b') ? 'tree-b' : 'tree';
    if (tex.has(fr)) {
      const img = host.add.image(foot.x, foot.y, 'sheet-buildings', fr);
      applySpriteSort(img);
      const s = 0.9 + (variant % 3) * 0.15;
      img.setDisplaySize(TILE_PX * 1.1 * s, TILE_PX * 2.4 * s);
      container?.add(img);
      return;
    }
  }
  // Geometric pine fallback
  const trunk = host.add.rectangle(foot.x, foot.y - 8, 5, 14, 0x5a3a22);
  applySpriteSort(trunk);
  const c1 = host.add.circle(foot.x, foot.y - 28, 14, 0x2f5a28);
  c1.setDepth(foot.y + 0.2);
  const c2 = host.add.circle(foot.x, foot.y - 42, 10, 0x3a6e30);
  c2.setDepth(foot.y + 0.3);
  container?.add(trunk);
  container?.add(c1);
  container?.add(c2);
}

export function paintTownMarker(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { id: string; q: number; r: number },
): void {
  const foot = tileFootWorld(town.q, town.r);
  addSoftShadow(host, container, foot.x, foot.y, 2.2);

  if (host.textures.exists('sheet-buildings') && host.textures.get('sheet-buildings').has('inn')) {
    const img = host.add.image(foot.x, foot.y, 'sheet-buildings', 'inn');
    applySpriteSort(img);
    img.setDisplaySize(TILE_PX * 5.5, TILE_PX * 4.2);
    container?.add(img);
  } else {
    // Layered building fallback (always visible)
    const wall = host.add.rectangle(foot.x, foot.y - 36, 72, 70, 0xd2b48c);
    wall.setStrokeStyle(2, 0x5a4030, 1);
    applySpriteSort(wall);
    const door = host.add.rectangle(foot.x, foot.y - 14, 14, 22, 0x4a3020);
    door.setDepth(foot.y + 0.2);
    const roof = host.add.rectangle(foot.x, foot.y - 78, 84, 28, 0xa84532);
    roof.setDepth(foot.y + 0.3);
    container?.add(wall);
    container?.add(door);
    container?.add(roof);
  }

  // Side trees
  for (const [dq, v] of [
    [-2.2, 0],
    [2.4, 1],
    [-1.2, 2],
  ] as const) {
    paintTree(host, container, town.q + dq, town.r + 0.3, v);
  }

  const label = host.add
    .text(foot.x, foot.y - 130, town.id, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#f2e9e4',
    })
    .setOrigin(0.5, 1)
    .setDepth(foot.y + 5);
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
  for (const tile of chunk.tiles) {
    paintGroundTile(host, container, tile, roadKeys);
  }
  // Props are painted by chunk-layer onto the y-sort layer (not buried under later chunks)
  return container;
}
