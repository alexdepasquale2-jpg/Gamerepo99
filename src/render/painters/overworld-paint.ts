/** Render-side painters for continuous overworld chunks. Presentation only. */

import type Phaser from 'phaser';
import type { ChunkTiles, FacilityRenderView, TileRenderView } from '../../sim/map/types';
import { CHUNK_SIZE, TILE_PX } from '../../sim/map/constants';
import { lookupAsset } from '../asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from '../depth-sort';
import {
  GRASS_CALM_TEX,
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
  // Pass 4: single calm base — no per-tile color variation
  return { kind: 'grass', key: GRASS_CALM_TEX, frame: '0' };
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


function paintChunkGrassFill(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  originQ: number,
  originR: number,
  chunkTiles: number,
): void {
  const size = chunkTiles * TILE_PX;
  const key = `${GRASS_CALM_TEX}-0`;
  const tex = host.textures.exists(key) ? key : GRASS_CALM_TEX;
  // Single stretched image — no per-tile hue variation possible
  if (host.textures.exists(tex)) {
    const img = host.add.image(originQ * TILE_PX, originR * TILE_PX, tex);
    img.setOrigin(0, 0);
    img.setDisplaySize(size + 2, size + 2);
    img.setDepth(0);
    container.add(img);
  } else {
    const rect = host.add.rectangle(
      originQ * TILE_PX + size / 2,
      originR * TILE_PX + size / 2,
      size + 2,
      size + 2,
      0x7ebe49,
    );
    rect.setDepth(0);
    container.add(rect);
  }
}

function paintGrassTile(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  tile: TileRenderView,
): void {
  const { x, y } = tileToWorld(tile.q, tile.r);
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  // Pass 4: single calm base color — detail comes from world-space poisson tufts
  const key = `${GRASS_CALM_TEX}-0`;
  const img = host.add.image(cx, cy, host.textures.exists(key) ? key : GRASS_CALM_TEX);
  img.setDisplaySize(TILE_PX + 2, TILE_PX + 2);
  img.setDepth(0);
  container.add(img);
}

/** Sparse world-space poisson tufts/flowers (not per-tile hash). */
function paintPoissonGrassDetail(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  originQ: number,
  originR: number,
  chunkTiles: number,
): void {
  const minDist = 28; // px between detail marks
  const cell = minDist;
  const ox = originQ * TILE_PX;
  const oy = originR * TILE_PX;
  const size = chunkTiles * TILE_PX;
  const cols = Math.ceil(size / cell);
  const rows = Math.ceil(size / cell);
  for (let gy = -1; gy <= rows; gy++) {
    for (let gx = -1; gx <= cols; gx++) {
      const h = hash2(originQ * 64 + gx * 3 + 11, originR * 64 + gy * 5 + 19);
      // ~18% of cells get a candidate → sparse after jitter
      if (h % 100 > 17) continue;
      const jx = ((h >> 8) % cell) - cell / 2;
      const jy = ((h >> 16) % cell) - cell / 2;
      const wx = ox + gx * cell + cell / 2 + jx;
      const wy = oy + gy * cell + cell / 2 + jy;
      if (wx < ox - 4 || wy < oy - 4 || wx > ox + size + 4 || wy > oy + size + 4) continue;
      const kind = h % 7;
      if (kind <= 4) {
        const g = host.add.rectangle(wx, wy - 3, 2, 5, 0x3d6b28);
        g.setAlpha(0.65);
        g.setDepth(0.15);
        container.add(g);
      } else {
        const fl = host.add.rectangle(wx, wy - 4, 2, 2, kind === 5 ? 0xf0d878 : 0xe8a0c0);
        fl.setDepth(0.16);
        container.add(fl);
      }
    }
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

/** Fence posts along the road's northern edge east of the courtyard. */
function paintFenceAlongRoad(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  townQ: number,
  townR: number,
  posts = 10,
): void {
  // Start east of the settlement stamp so fence follows the visible road, not the yard
  for (let i = 0; i < posts; i++) {
    const q = townQ + 2.2 + i * 0.7;
    const roadR = townR + 0.35 + roadMeanderOffset(Math.floor(q));
    const r = roadR - 0.5; // north edge of road ribbon (~halfW)
    const foot = tileFootWorld(q, r);
    const post = host.add.rectangle(foot.x, foot.y - 6, 3, 12, 0x6b4423);
    applySpriteSort(post);
    container?.add(post);
    if (i < posts - 1) {
      const nextQ = q + 0.7;
      const nextR = townR + 0.35 + roadMeanderOffset(Math.floor(nextQ)) - 0.5;
      const nextFoot = tileFootWorld(nextQ, nextR);
      const mx = (foot.x + nextFoot.x) / 2;
      const my = (foot.y + nextFoot.y) / 2 - 10;
      const len = Math.hypot(nextFoot.x - foot.x, nextFoot.y - foot.y) * 0.85;
      const rail = host.add.rectangle(mx, my, Math.max(8, len), 2, 0x8b5a2b);
      rail.setDepth(Math.max(foot.y, nextFoot.y) + 0.1);
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

  // Props + 3–4 villagers, min 24px from each other/crates/fence
  paintCrate(host, container, town.q + 0.2, town.r + 0.5);
  paintCrate(host, container, town.q + 1.15, town.r + 0.45);
  paintCrate(host, container, town.q + 2.1, town.r + 0.5);

  // Spread around settlement like v4 (west / porch / east) — 3 villagers + optional 4th SE
  paintVillager(host, container, town.q - 1.8, town.r + 1.0, '1', true);
  paintVillager(host, container, town.q + 0.4, town.r + 1.5, '7');
  paintVillager(host, container, town.q + 3.2, town.r + 1.05, '4');
  paintVillager(host, container, town.q + 5.2, town.r + 1.55, '7');

  // Fence along road edge east of courtyard (does not cross villagers)
  paintFenceAlongRoad(host, container, town.q, town.r, 9);

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

  // Pass 4: one solid calm fill per chunk — kills per-tile color blocks entirely
  paintChunkGrassFill(host, container, baseQ, baseR, CHUNK_SIZE);
  paintPoissonGrassDetail(host, container, baseQ, baseR, CHUNK_SIZE);
  addGrassTintOverlay(host, container, baseQ, baseR, CHUNK_SIZE);

  // Organic road ribbon (soft edges) — one bake per chunk
  if (roadKeys.size > 0) {
    const key = `road-ribbon-${chunk.cx},${chunk.cy}`;
    const ribbon = bakeRoadRibbon(host, key, roadKeys, baseQ, baseR, CHUNK_SIZE);
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
