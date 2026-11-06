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
  GRASS_WORLD_TEX,
  HERO_TEX,
  HOUSE2_TEX,
  SHADOW_TEX,
  grassWorldFrame,
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
 * Meander offset in tiles (perpendicular / along r) for visual road curve.
 * Pure — used by groundPaintFor tests indirectly via road set expansion.
 */
export function roadMeanderOffset(q: number): number {
  return Math.round(
    1.1 * Math.sin(q * 0.13) + 0.55 * Math.sin(q * 0.37 + 1.1),
  );
}

/** Expand sim road cells into a meandering visual ribbon (presentation only). */
export function expandMeanderRoadKeys(roadKeys: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of roadKeys) {
    const [qs, rs] = key.split(',');
    const q = Number(qs);
    const r = Number(rs);
    const off = roadMeanderOffset(q);
    out.add(`${q},${r + off}`);
    // occasional half-step width for organic edge (not a fat bar)
    if (Math.abs(Math.sin(q * 0.29)) > 0.65) out.add(`${q},${r + off - 1}`);
  }
  return out;
}

export function groundPaintFor(tile: TileRenderView): GroundPaint {
  if (isRoadBiome(tile.biomeId)) {
    const entry = lookupAsset('road.road') ?? lookupAsset('road.track');
    return { kind: 'road', key: 'sheet-ground', frame: String(entry?.frame ?? 5) };
  }
  // World-space grass frame (seamless across tiles)
  return { kind: 'grass', key: GRASS_WORLD_TEX, frame: grassWorldFrame(tile.q, tile.r) };
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

function placeSheetTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  key: string,
  frame: string,
  depth: number,
  flipY = false,
  flipX = false,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  if (host.textures.exists(key) && host.textures.get(key).has(frame)) {
    const img = host.add.image(cx, cy, key, frame);
    img.setDisplaySize(TILE_PX + 3, TILE_PX + 3); // overlap kills seams
    img.setFlipY(flipY);
    img.setFlipX(flipX);
    img.setDepth(depth);
    container.add(img);
    return;
  }
  if (host.textures.exists(key)) {
    const img = host.add.image(cx, cy, key);
    img.setDisplaySize(TILE_PX + 3, TILE_PX + 3);
    img.setDepth(depth);
    container.add(img);
    return;
  }
  container.add(host.add.rectangle(cx, cy, TILE_PX, TILE_PX, 0x80ba44));
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
    img.setDisplaySize(TILE_PX + 3, TILE_PX + 3);
    img.setDepth(depth);
    container.add(img);
    return;
  }
  container.add(host.add.rectangle(cx, cy, TILE_PX, TILE_PX, 0x80ba44));
}

/** 8-neighbor road autotile → dirt / edge / corner treatment. */
function paintRoadAutotile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
  roads: Set<string>,
): void {
  // Grass underlay first (world-space)
  const gFrame = grassWorldFrame(tile.q, tile.r);
  if (host.textures.exists(GRASS_WORLD_TEX) && host.textures.get(GRASS_WORLD_TEX).has(gFrame)) {
    placeSheetTile(host, container, tile, GRASS_WORLD_TEX, gFrame, 0);
  } else {
    placeFullTile(host, container, tile, `${GRASS_CALM_TEX}-0`, 0);
  }

  const n = roads.has(`${tile.q},${tile.r - 1}`);
  const s = roads.has(`${tile.q},${tile.r + 1}`);
  const e = roads.has(`${tile.q + 1},${tile.r}`);
  const w = roads.has(`${tile.q - 1},${tile.r}`);
  const ne = roads.has(`${tile.q + 1},${tile.r - 1}`);
  const nw = roads.has(`${tile.q - 1},${tile.r - 1}`);
  const se = roads.has(`${tile.q + 1},${tile.r + 1}`);
  const sw = roads.has(`${tile.q - 1},${tile.r + 1}`);
  const dirtVar = String(12 + (hash2(tile.q, tile.r) % 3));
  const cardinal = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);

  // Interior / thick
  if (cardinal >= 3 || (n && s) || (e && w && (n || s))) {
    placeSheetTile(host, container, tile, 'sheet-ground', dirtVar, 0.5);
    return;
  }
  // North edge only
  if (!n && s && !e && !w) {
    placeSheetTile(host, container, tile, 'sheet-ground', '6', 0.5);
    return;
  }
  if (n && !s && !e && !w) {
    placeSheetTile(host, container, tile, 'sheet-ground', '6', 0.5, true);
    return;
  }
  // East/west corridor (meander horizontal)
  if ((e || w) && !n && !s) {
    if (host.textures.exists(DIRT_EDGE_TEX)) {
      placeFullTile(host, container, tile, DIRT_EDGE_TEX, 0.5);
    } else {
      placeSheetTile(host, container, tile, 'sheet-ground', dirtVar, 0.5);
    }
    return;
  }
  // Corners / diagonals — dirt with soft edge
  if (ne || nw || se || sw || cardinal >= 1) {
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
  meanderKeys?: Set<string>,
): void {
  const roads = meanderKeys ?? roadKeys ?? new Set<string>();
  const onRoad =
    isRoadBiome(tile.biomeId) || roads.has(`${tile.q},${tile.r}`);

  if (onRoad && roads.size > 0) {
    paintRoadAutotile(host, container, tile, roads);
    return;
  }
  if (isRoadBiome(tile.biomeId)) {
    // Sim road but outside meander expand — still paint
    paintRoadAutotile(host, container, tile, roadKeys ?? new Set([`${tile.q},${tile.r}`]));
    return;
  }

  const choice = groundPaintFor(tile);
  if (choice.kind === 'grass') {
    if (host.textures.exists(GRASS_WORLD_TEX) && host.textures.get(GRASS_WORLD_TEX).has(choice.frame)) {
      placeSheetTile(host, container, tile, GRASS_WORLD_TEX, choice.frame, 0);
    } else {
      placeFullTile(host, container, tile, `${GRASS_CALM_TEX}-0`, 0);
    }
  }

  // Sparse organic tufts (world-hashed, not grid-locked density)
  if (hash2(tile.q * 3, tile.r * 7) % 13 === 0) {
    const foot = tileFootWorld(tile.q, tile.r);
    const ox = (hash2(tile.r, tile.q) % 9) - 4;
    const oy = (hash2(tile.q, tile.r + 5) % 5) - 2;
    const g = host.add.rectangle(foot.x + ox, foot.y - 5 + oy, 2, 5, 0x3d6b28);
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
 * Irregular terrace cliff: contour meanders in r, ends taper into slopes,
 * upper plateau (above lip) stays normal grass; lower band shaded.
 */
export function paintCliffStrip(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 16,
): void {
  const texKey = 'sheet-cliff';
  if (!host.textures.exists(texKey)) return;
  const tex = host.textures.get(texKey);

  for (let i = 0; i < widthTiles; i++) {
    const t = i / Math.max(1, widthTiles - 1);
    // Irregular contour (not a straight wall)
    // Gentle irregular contour (±1 tile) so faces abut into one ridge
    const wobble = Math.round(0.85 * Math.sin(i * 0.4 + 0.2) + 0.4 * Math.sin(i * 0.95));
    const localR = r + wobble;
    const endDist = Math.min(i, widthTiles - 1 - i);
    const taper = endDist < 2 ? 0.45 + endDist * 0.28 : 1;
    if (endDist === 0 && taper < 0.5) {
      /* terminus slope only */
    }

    const foot = tileFootWorld(q + i, localR);
    const col = i % 4;

    const lipFr = tex.has('lip') ? 'lip' : String(col);
    if (tex.has(lipFr)) {
      const lip = host.add.image(foot.x, foot.y - 2, texKey, lipFr);
      lip.setOrigin(0.5, 1);
      lip.setDisplaySize(TILE_PX + 2, TILE_PX * 0.5 * Math.min(1, taper + 0.2));
      lip.setDepth(foot.y - 0.4);
      lip.setAlpha(0.95);
      container?.add(lip);
    }

    if (taper > 0.45) {
      const faceFr = tex.has('face') ? 'face' : String(4 + col);
      if (tex.has(faceFr)) {
        const face = host.add.image(
          foot.x,
          foot.y + TILE_PX * (0.55 + 0.5 * taper),
          texKey,
          faceFr,
        );
        face.setOrigin(0.5, 1);
        face.setDisplaySize(TILE_PX + 2, TILE_PX * (0.55 + 0.65 * taper));
        face.setDepth(foot.y + 0.5);
        container?.add(face);
      }
    }

    if (taper > 0.7) {
      const baseFr = tex.has('base') ? 'base' : String(8 + col);
      if (tex.has(baseFr)) {
        const base = host.add.image(
          foot.x,
          foot.y + TILE_PX * (1.1 + 0.55 * taper),
          texKey,
          baseFr,
        );
        base.setOrigin(0.5, 1);
        base.setDisplaySize(TILE_PX + 2, TILE_PX * 0.45);
        base.setDepth(foot.y + 1.0);
        container?.add(base);
      }
    }

    // End slope: short dirt wedge instead of full face
    if (endDist < 2 && taper <= 0.45) {
      const wedge = host.add.rectangle(
        foot.x,
        foot.y + 8,
        TILE_PX * 0.9,
        10 + endDist * 6,
        0x7a6238,
      );
      wedge.setDepth(foot.y + 0.3);
      container?.add(wedge);
    }
  }
}

/** Darker lower terrace following the same irregular contour. */
export function paintLowerTerraceShade(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
  widthTiles = 16,
  depthTiles = 6,
): void {
  for (let i = 0; i < widthTiles; i++) {
    const wobble = Math.round(0.85 * Math.sin(i * 0.4 + 0.2) + 0.4 * Math.sin(i * 0.95));
    const localR = r + wobble;
    const endDist = Math.min(i, widthTiles - 1 - i);
    if (endDist === 0) continue;
    for (let dr = 1; dr <= depthTiles; dr++) {
      const { x, y } = tileToWorld(q + i, localR + dr);
      const cx = x + TILE_PX / 2;
      const cy = y + TILE_PX / 2;
      // Blend darker toward cliff, lighter farther
      const a = Math.max(0.25, 0.72 - dr * 0.08);
      const shade = host.add.rectangle(cx, cy, TILE_PX + 3, TILE_PX + 3, 0x356028, a);
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
  container?.add(trunk);
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

  // Inn stamp
  let innTop = foot.y - TILE_PX * 4.0;
  if (host.textures.exists('sheet-buildings') && host.textures.get('sheet-buildings').has('inn')) {
    addSoftShadow(host, container, foot.x, foot.y, 2.0);
    const img = host.add.image(foot.x, foot.y, 'sheet-buildings', 'inn');
    applySpriteSort(img);
    img.setDisplaySize(TILE_PX * 4.2, TILE_PX * 4.0);
    container?.add(img);
    innTop = foot.y - TILE_PX * 4.0;
  }

  // Real sheet house2 (ansimuz extract)
  const houseFoot = { x: foot.x + TILE_PX * 3.4, y: foot.y + 8 };
  addSoftShadow(host, container, houseFoot.x, houseFoot.y, 1.5);
  if (host.textures.exists(HOUSE2_TEX)) {
    const h2 = host.add.image(houseFoot.x, houseFoot.y, HOUSE2_TEX);
    applySpriteSort(h2);
    h2.setDisplaySize(TILE_PX * 2.6, TILE_PX * 3.8);
    container?.add(h2);
  } else {
    const wall = host.add.rectangle(houseFoot.x, houseFoot.y - 36, 40, 56, 0xb8a07a);
    wall.setStrokeStyle(2, 0x5a4030, 1);
    applySpriteSort(wall);
    const roof = host.add.rectangle(houseFoot.x, houseFoot.y - 68, 48, 14, 0xa84532);
    roof.setDepth(houseFoot.y + 0.3);
    container?.add(wall);
    container?.add(roof);
  }

  for (const [dq, dr, v] of [
    [-2.4, 0.2, 0],
    [-1.8, -0.6, 1],
    [5.0, 0.4, 2],
    [5.6, -0.3, 0],
  ] as const) {
    paintTree(host, container, town.q + dq, town.r + dr, v);
  }

  paintFence(host, container, town.q - 1.5, town.r + 1.4, 8);
  paintCrate(host, container, town.q + 1.2, town.r + 0.8);
  paintCrate(host, container, town.q + 1.6, town.r + 0.9);
  paintCrate(host, container, town.q - 0.8, town.r + 0.6);

  // Villagers south of fence — clear of label
  paintVillager(host, container, town.q + 0.6, town.r + 1.15, '7');
  paintVillager(host, container, town.q + 2.0, town.r + 0.95, '4');
  paintVillager(host, container, town.q - 0.4, town.r + 1.35, '1', true);
  paintVillager(host, container, town.q + 3.5, town.r + 1.05, '7');

  // Label ABOVE roofs with clearance — never overlaps villagers
  const labelY = Math.min(innTop, houseFoot.y - TILE_PX * 3.8) - 16;
  const label = host.add
    .text(foot.x + TILE_PX * 1.5, labelY, town.id.replace(/_/g, ' '), {
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
  // Ensure meander cells that aren't in chunk.tiles still get painted if in bbox
  const byKey = new Map(chunk.tiles.map((t) => [`${t.q},${t.r}`, t]));
  for (const key of meander) {
    if (byKey.has(key)) continue;
    const [qs, rs] = key.split(',');
    const q = Number(qs);
    const r = Number(rs);
    // Only fill if inside chunk tile extent
    const inChunk = chunk.tiles.some(
      (t) => Math.abs(t.q - q) <= 1 && Math.abs(t.r - r) <= 2,
    );
    if (!inChunk) continue;
    byKey.set(key, { q, r, biomeId: 'road', warmth: 0.55 });
  }
  for (const tile of byKey.values()) {
    paintGroundTile(host, container, tile, roadKeys, meander);
  }
  return container;
}
