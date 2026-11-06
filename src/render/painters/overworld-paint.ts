/** Render-side painters for continuous overworld chunks. Presentation only. */

import type Phaser from 'phaser';
import type { ChunkTiles, FacilityRenderView, TileRenderView } from '../../sim/map/types';
import { TILE_PX } from '../../sim/map/constants';
import { lookupAsset } from '../asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from '../depth-sort';
import {
  DIRT_CALM_TEX,
  DIRT_EDGE_TEX,
  GRASS_CALM_TEX,
  HERO_TEX,
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

export function groundPaintFor(tile: TileRenderView): GroundPaint {
  if (isRoadBiome(tile.biomeId)) {
    const entry = lookupAsset('road.road') ?? lookupAsset('road.track');
    return { kind: 'road', key: 'sheet-ground', frame: String(entry?.frame ?? 5) };
  }
  // Rare warm/cool patch (~1/7) — same base otherwise so no checkerboard
  const h = hash2(tile.q, tile.r);
  const variant = h % 7 === 0 ? 1 : h % 11 === 0 ? 2 : 0;
  return { kind: 'grass', key: `${GRASS_CALM_TEX}-${variant}`, frame: '__FULL__' };
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
    img.setDisplaySize(TILE_PX + 1, TILE_PX + 1);
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
  flipY = false,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  if (host.textures.exists(key) && host.textures.get(key).has(frame)) {
    const img = host.add.image(cx, cy, key, frame);
    img.setDisplaySize(TILE_PX + 1, TILE_PX + 1);
    img.setFlipY(flipY);
    img.setDepth(depth);
    container.add(img);
    return;
  }
  placeFullTile(host, container, tile, DIRT_CALM_TEX, depth);
}

/**
 * Road autotile from sheet-ground dirt row + edge row.
 * 1-tile corridors use DIRT_EDGE_TEX (soft N/S alpha) over grass.
 */
function paintRoadTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  roadKeys: Set<string>,
): void {
  placeFullTile(host, container, tile, `${GRASS_CALM_TEX}-0`, 0);

  const n = roadKeys.has(`${tile.q},${tile.r - 1}`);
  const s = roadKeys.has(`${tile.q},${tile.r + 1}`);
  const e = roadKeys.has(`${tile.q + 1},${tile.r}`);
  const w = roadKeys.has(`${tile.q - 1},${tile.r}`);
  const dirtVar = String(12 + (hash2(tile.q, tile.r) % 3));

  // Thick corridor (has N or S neighbor road) → dirt fill + edge frames
  if (n && s) {
    placeSheetTile(host, container, tile, 'sheet-ground', dirtVar, 0.5);
    return;
  }
  if (!n && s) {
    // Northern lip of ribbon: grass-top / dirt-bottom
    placeSheetTile(host, container, tile, 'sheet-ground', '6', 0.5);
    return;
  }
  if (n && !s) {
    // Southern lip: flip edge frame
    placeSheetTile(host, container, tile, 'sheet-ground', '6', 0.5, true);
    return;
  }
  // Single-tile (E/W corridor) or isolated — soft-edge dirt over grass
  if (e || w) {
    if (host.textures.exists(DIRT_EDGE_TEX)) {
      placeFullTile(host, container, tile, DIRT_EDGE_TEX, 0.5);
    } else {
      placeSheetTile(host, container, tile, 'sheet-ground', dirtVar, 0.5);
    }
    return;
  }
  placeFullTile(host, container, tile, DIRT_CALM_TEX, 0.5);
}

export function paintGroundTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  roadKeys?: Set<string>,
): void {
  const choice = groundPaintFor(tile);
  if (choice.kind === 'road') {
    paintRoadTile(host, container, tile, roadKeys ?? new Set());
    return;
  }

  const key = host.textures.exists(choice.key) ? choice.key : GRASS_CALM_TEX;
  placeFullTile(host, container, tile, key, 0);

  // Sparse organic tufts / flowers
  if (hash2(tile.q * 3, tile.r * 7) % 11 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const ox = (hash2(tile.r, tile.q) % 7) - 3;
    const g = host.add.rectangle(foot.x + ox, foot.y - 5, 2, 5, 0x3d6b28);
    g.setAlpha(0.75);
    g.setDepth(0.15);
    container.add(g);
  }
  if (hash2(tile.q + 9, tile.r + 2) % 29 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const fl = host.add.rectangle(foot.x - 3, foot.y - 7, 2, 2, 0xf0d878);
    fl.setDepth(0.16);
    container.add(fl);
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
  const addTo = (obj: Phaser.GameObjects.GameObject) => {
    container?.add(obj);
  };

  addSoftShadow(host, container, foot.x, foot.y, prop.type === 'field' ? 0.7 : 1.0);

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
    const sheaf = host.add.rectangle(foot.x, foot.y - 6, 10, 14, 0xd4b84a);
    applySpriteSort(sheaf);
    addTo(sheaf);
    return;
  }

  // Compact facility markers (avoid huge sliced sheet cells)
  paintFacilityStub(host, container, foot.x, foot.y, prop.type);
}

function paintFacilityStub(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  type: string,
): void {
  const colors: Record<string, number> = {
    mine: 0x6a6a72,
    camp: 0x8b5a2b,
    waystation: 0xc4a574,
  };
  const wall = host.add.rectangle(x, y - 14, 22, 26, colors[type] ?? 0x8b5a2b);
  applySpriteSort(wall);
  const roof = host.add.rectangle(x, y - 30, 26, 10, 0xa84532);
  roof.setDepth(y + 0.2);
  container?.add(wall);
  container?.add(roof);
}

/**
 * Terrace cliff edge: lip along the drop line, face hanging down, base at bottom.
 * Call paintLowerTerraceShade south of this so upper/lower heights read apart.
 */
export function paintCliffStrip(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 14,
): void {
  const texKey = 'sheet-cliff';
  if (!host.textures.exists(texKey)) return;
  const tex = host.textures.get(texKey);

  for (let i = 0; i < widthTiles; i++) {
    const foot = tileFootWorld(q + i, r);
    const col = i % 4;
    // Lip sits ON the upper terrace edge
    const lipFr = tex.has('lip') ? 'lip' : String(col);
    if (tex.has(lipFr)) {
      const lip = host.add.image(foot.x, foot.y - 2, texKey, lipFr);
      lip.setOrigin(0.5, 1);
      lip.setDisplaySize(TILE_PX + 2, TILE_PX * 0.55);
      lip.setDepth(foot.y - 0.4);
      container?.add(lip);
    }
    // Face hangs south (down-screen) — the vertical drop
    const faceFr = tex.has('face') ? 'face' : String(4 + col);
    if (tex.has(faceFr)) {
      const face = host.add.image(foot.x, foot.y + TILE_PX * 0.95, texKey, faceFr);
      face.setOrigin(0.5, 1);
      face.setDisplaySize(TILE_PX + 2, TILE_PX * 1.15);
      face.setDepth(foot.y + 0.5);
      container?.add(face);
    }
    // Base tuck under face
    const baseFr = tex.has('base') ? 'base' : String(8 + col);
    if (tex.has(baseFr)) {
      const base = host.add.image(foot.x, foot.y + TILE_PX * 1.55, texKey, baseFr);
      base.setOrigin(0.5, 1);
      base.setDisplaySize(TILE_PX + 2, TILE_PX * 0.5);
      base.setDepth(foot.y + 1.0);
      container?.add(base);
    }
  }
}

/** Darker grass band south of cliff so the drop reads as two ground heights. */
export function paintLowerTerraceShade(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 14,
  depthTiles = 5,
): void {
  for (let dr = 1; dr <= depthTiles; dr++) {
    for (let i = 0; i < widthTiles; i++) {
      const { x, y } = tileToWorld(q + i, r + dr);
      const cx = x + TILE_PX / 2;
      const cy = y + TILE_PX / 2;
      const shade = host.add.rectangle(cx, cy, TILE_PX + 1, TILE_PX + 1, 0x5a8a38, 1);
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
  const trunk = host.add.rectangle(foot.x, foot.y - 8, 5, 14, 0x5a3a22);
  applySpriteSort(trunk);
  const c1 = host.add.circle(foot.x, foot.y - 28, 12, 0x2f5a28);
  c1.setDepth(foot.y + 0.2);
  container?.add(trunk);
  container?.add(c1);
}

/** Timber house painted when sheet fragment would slice. */
function paintTimberHouse(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  footX: number,
  footY: number,
  scale = 1,
): void {
  addSoftShadow(host, container, footX, footY, 1.5 * scale);
  const w = 40 * scale;
  const wallH = 56 * scale;
  const wall = host.add.rectangle(footX, footY - wallH / 2, w, wallH, 0xb8a07a);
  wall.setStrokeStyle(2, 0x5a4030, 1);
  applySpriteSort(wall);
  // Beam
  const beam = host.add.rectangle(footX, footY - wallH * 0.55, w - 2, 4 * scale, 0x6b4423);
  beam.setDepth(footY + 0.15);
  const door = host.add.rectangle(footX, footY - 14 * scale, 11 * scale, 20 * scale, 0x4a3020);
  door.setDepth(footY + 0.2);
  const win = host.add.rectangle(footX, footY - 40 * scale, 10 * scale, 8 * scale, 0x2a3540);
  win.setDepth(footY + 0.2);
  const roof = host.add.rectangle(footX, footY - wallH - 6 * scale, w * 1.2, 14 * scale, 0xa84532);
  roof.setDepth(footY + 0.3);
  const chim = host.add.rectangle(footX + w * 0.28, footY - wallH - 16 * scale, 7 * scale, 14 * scale, 0x8a8a90);
  chim.setDepth(footY + 0.35);
  for (const o of [wall, beam, door, win, roof, chim]) container?.add(o);
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
    return;
  }
  const stub = host.add.rectangle(foot.x, foot.y - 8, 10, 16, 0xc4784a);
  applySpriteSort(stub);
  container?.add(stub);
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

  // Inn (exact stamp — no white bg after sheet scrub)
  if (host.textures.exists('sheet-buildings') && host.textures.get('sheet-buildings').has('inn')) {
    addSoftShadow(host, container, foot.x, foot.y, 2.0);
    const img = host.add.image(foot.x, foot.y, 'sheet-buildings', 'inn');
    applySpriteSort(img);
    // Native ~149×141 → ~4.5×4.2 tiles
    img.setDisplaySize(TILE_PX * 4.2, TILE_PX * 4.0);
    container?.add(img);
  } else {
    paintTimberHouse(host, container, foot.x, foot.y, 1.2);
  }

  // Second house to the east (geometric — sheet "house" is sliced fragments)
  paintTimberHouse(host, container, foot.x + TILE_PX * 3.2, foot.y + 6, 0.85);

  // Trees cluster
  for (const [dq, dr, v] of [
    [-2.4, 0.2, 0],
    [-1.8, -0.6, 1],
    [4.6, 0.4, 2],
    [5.2, -0.3, 0],
  ] as const) {
    paintTree(host, container, town.q + dq, town.r + dr, v);
  }

  // Fence south of plaza
  paintFence(host, container, town.q - 1.5, town.r + 1.4, 8);

  // Crates / props
  paintCrate(host, container, town.q + 1.2, town.r + 0.8);
  paintCrate(host, container, town.q + 1.6, town.r + 0.9);
  paintCrate(host, container, town.q - 0.8, town.r + 0.6);

  // Villagers — one ansimuz frame per spot (4-dir idle)
  paintVillager(host, container, town.q + 0.6, town.r + 1.1, '7');
  paintVillager(host, container, town.q + 2.0, town.r + 0.9, '4');
  paintVillager(host, container, town.q - 0.4, town.r + 1.3, '1', true);
  paintVillager(host, container, town.q + 3.4, town.r + 1.0, '7');

  // Label BELOW settlement so it doesn't collide with HUD at top of screen
  const label = host.add
    .text(foot.x + TILE_PX * 1.2, foot.y + 18, town.id.replace(/_/g, ' '), {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#f2e9e4',
      backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    })
    .setOrigin(0.5, 0)
    .setDepth(foot.y + 20);
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
  return container;
}
