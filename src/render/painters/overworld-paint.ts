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
import { FEEL } from '../feel';

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
    const img = host.add.image(originQ * TILE_PX - 3, originR * TILE_PX - 3, tex);
    img.setOrigin(0, 0);
    img.setDisplaySize(size + 8, size + 8);
    img.setDepth(0);
    container.add(img);
  } else {
    const rect = host.add.rectangle(
      originQ * TILE_PX + size / 2,
      originR * TILE_PX + size / 2,
      size + 2,
      size + 2,
      0x74af51,
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

/** Sparse world-space poisson tufts/flowers — two layers so grass isn't a flat fill. */
function paintPoissonGrassDetail(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  originQ: number,
  originR: number,
  chunkTiles: number,
): void {
  const ox = originQ * TILE_PX;
  const oy = originR * TILE_PX;
  const size = chunkTiles * TILE_PX;

  const cellA = Math.max(20, FEEL.worldScale.tuftH * 3);
  // Layer A: mid tufts + flowers (larger, readable)
  paintPoissonLayer(host, container, ox, oy, size, originQ, originR, cellA, 20, 0x3d6b28, true);
  // Layer B: darker, sparser tufts
  paintPoissonLayer(host, container, ox, oy, size, originQ + 17, originR + 9, cellA + 12, 14, 0x2a4f1c, false);
}

function paintPoissonLayer(
  host: PaintHost,
  container: Phaser.GameObjects.Container,
  ox: number,
  oy: number,
  size: number,
  seedQ: number,
  seedR: number,
  cell: number,
  keepPct: number,
  tuftColor: number,
  allowFlowers: boolean,
): void {
  const cols = Math.ceil(size / cell);
  const rows = Math.ceil(size / cell);
  for (let gy = -1; gy <= rows; gy++) {
    for (let gx = -1; gx <= cols; gx++) {
      const h = hash2(seedQ * 64 + gx * 3 + 11, seedR * 64 + gy * 5 + 19);
      if (h % 100 >= keepPct) continue;
      const jx = ((h >> 8) % cell) - cell / 2;
      const jy = ((h >> 16) % cell) - cell / 2;
      const wx = ox + gx * cell + cell / 2 + jx;
      const wy = oy + gy * cell + cell / 2 + jy;
      if (wx < ox - 4 || wy < oy - 4 || wx > ox + size + 4 || wy > oy + size + 4) continue;
      const kind = h % 9;
      const ws = FEEL.worldScale;
      if (!allowFlowers || kind <= 5) {
        const ht = tuftColor === 0x2a4f1c ? ws.tuftH - 2 + (h % 3) : ws.tuftH;
        const g = host.add.rectangle(wx, wy - ht / 2, 3, ht, tuftColor);
        g.setAlpha(tuftColor === 0x2a4f1c ? 0.55 : 0.75);
        g.setDepth(0.15);
        container.add(g);
      } else {
        const fs = ws.flowerPx;
        const fl = host.add.rectangle(wx, wy - fs, fs, fs, kind === 6 ? 0xf0d878 : 0xe8a0c0);
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
      const s = 1 + (variant % 3) * 0.1;
      const ws = FEEL.worldScale;
      img.setDisplaySize(TILE_PX * ws.treeWTiles * s, TILE_PX * ws.treeHTiles * s);
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
  const ws = FEEL.worldScale;
  for (let i = 0; i < tiles; i++) {
    const foot = tileFootWorld(q0 + i * 0.6, r);
    const post = host.add.rectangle(foot.x, foot.y - ws.fencePostH / 2, 4, ws.fencePostH, 0x6b4423);
    applySpriteSort(post);
    container?.add(post);
    if (i < tiles - 1) {
      const rail = host.add.rectangle(foot.x + 10, foot.y - ws.fencePostH * 0.65, 18, ws.fenceRailH, 0x8b5a2b);
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
    const ws = FEEL.worldScale;
    const post = host.add.rectangle(foot.x, foot.y - ws.fencePostH / 2, 4, ws.fencePostH, 0x6b4423);
    applySpriteSort(post);
    container?.add(post);
    if (i < posts - 1) {
      const nextQ = q + 0.7;
      const nextR = townR + 0.35 + roadMeanderOffset(Math.floor(nextQ)) - 0.5;
      const nextFoot = tileFootWorld(nextQ, nextR);
      const mx = (foot.x + nextFoot.x) / 2;
      const my = (foot.y + nextFoot.y) / 2 - ws.fencePostH * 0.65;
      const len = Math.hypot(nextFoot.x - foot.x, nextFoot.y - foot.y) * 0.85;
      const rail = host.add.rectangle(mx, my, Math.max(10, len), ws.fenceRailH, 0x8b5a2b);
      rail.setDepth(Math.max(foot.y, nextFoot.y) + 0.1);
      container?.add(rail);
    }
  }
}


/** Place villagers with screen-space AABB gaps (sprite ~32×48 at scale 2). */
function paintSpacedVillagers(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
  candidates: [number, number, string, boolean][],
): void {
  // Screen-space: clear if dx OR dy clears scaled sprite (16*scale + gap)
  const minAxis = FEEL.worldScale.villagerScale * 16 + 16;
  const placed: { x: number; y: number }[] = [];
  for (const [dq, dr, frame, flip] of candidates) {
    let q = town.q + dq;
    let r = town.r + dr;
    let foot = tileFootWorld(q, r);
    for (let attempt = 0; attempt < 12; attempt++) {
      const overlaps = placed.some((p) => {
        const dx = Math.abs(foot.x - p.x);
        const dy = Math.abs(foot.y - p.y);
        return dx < minAxis && dy < minAxis;
      });
      if (!overlaps) break;
      r += 0.85;
      q += attempt % 2 === 0 ? 1.1 : -0.6;
      foot = tileFootWorld(q, r);
    }
    placed.push(foot);
    paintVillager(host, container, q, r, frame, flip);
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
    sp.setScale(FEEL.worldScale.villagerScale);
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
  const cs = FEEL.worldScale.cratePx;
  const box = host.add.rectangle(foot.x, foot.y - cs * 0.45, cs, cs * 0.85, 0x8b6914);
  box.setStrokeStyle(1, 0x5a4010, 1);
  applySpriteSort(box);
  container?.add(box);
}


/** Scatter bushes/rocks/logs/stumps/sign/hay/flower patches with min spacing. */
function paintScatterProps(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
): void {
  const ws = FEEL.worldScale;
  const min = ws.scatterMinPx;
  type Kind = 'bush' | 'rock' | 'log' | 'stump' | 'sign' | 'hay' | 'flowers';
  const candidates: { dq: number; dr: number; kind: Kind }[] = [
    { dq: -4.5, dr: 1.2, kind: 'bush' },
    { dq: -1.0, dr: 2.4, kind: 'rock' },
    { dq: 3.0, dr: 2.0, kind: 'log' },
    { dq: 6.8, dr: 1.0, kind: 'stump' },
    { dq: -0.5, dr: -1.2, kind: 'sign' },
    { dq: 1.5, dr: 3.2, kind: 'hay' },
    { dq: -2.5, dr: 6.5, kind: 'bush' },
    { dq: 1.0, dr: 8.5, kind: 'flowers' },
    { dq: 5.5, dr: 7.2, kind: 'rock' },
    { dq: 8.0, dr: 5.0, kind: 'bush' },
    { dq: -4.0, dr: 8.0, kind: 'log' },
    { dq: 2.5, dr: 5.8, kind: 'stump' },
    { dq: 7.5, dr: 8.8, kind: 'flowers' },
    { dq: -1.5, dr: 9.5, kind: 'hay' },
  ];
  const placed: { x: number; y: number }[] = [];
  for (const c of candidates) {
    const foot = tileFootWorld(town.q + c.dq, town.r + c.dr);
    if (placed.some((p) => Math.hypot(p.x - foot.x, p.y - foot.y) < min)) continue;
    placed.push(foot);
    paintScatterOne(host, container, foot.x, foot.y, c.kind);
  }
}

function paintScatterOne(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  kind: 'bush' | 'rock' | 'log' | 'stump' | 'sign' | 'hay' | 'flowers',
): void {
  const ws = FEEL.worldScale;
  addSoftShadow(host, container, x, y, kind === 'log' ? 1.1 : 0.6);
  if (kind === 'bush') {
    const b = host.add.ellipse(x, y - ws.bushR * 0.6, ws.bushR * 2, ws.bushR * 1.5, 0x3a6e28);
    applySpriteSort(b);
    container?.add(b);
  } else if (kind === 'rock') {
    const r = host.add.ellipse(x, y - ws.rockR * 0.4, ws.rockR * 2, ws.rockR * 1.3, 0x7a756c);
    applySpriteSort(r);
    container?.add(r);
  } else if (kind === 'log') {
    const log = host.add.rectangle(x, y - ws.logH / 2, ws.logW, ws.logH, 0x6b4423);
    applySpriteSort(log);
    container?.add(log);
  } else if (kind === 'stump') {
    const st = host.add.ellipse(x, y - ws.stumpR * 0.3, ws.stumpR * 2, ws.stumpR, 0x5a3a1a);
    applySpriteSort(st);
    container?.add(st);
  } else if (kind === 'sign') {
    const post = host.add.rectangle(x, y - ws.signH / 2, 4, ws.signH, 0x6b4423);
    applySpriteSort(post);
    const board = host.add.rectangle(x, y - ws.signH + 4, 16, 10, 0xc4a574);
    board.setDepth(y + 0.1);
    container?.add(post);
    container?.add(board);
  } else if (kind === 'hay') {
    const hay = host.add.ellipse(x, y - ws.hayH * 0.4, ws.hayW, ws.hayH, 0xd4b84a);
    applySpriteSort(hay);
    container?.add(hay);
  } else {
    // flower patch cluster
    for (const [ox, oy, col] of [
      [0, 0, 0xf0d878],
      [6, -3, 0xe8a0c0],
      [-5, -2, 0xf0d878],
      [3, 4, 0xe8a0c0],
    ] as const) {
      const fl = host.add.rectangle(x + ox, y + oy - 4, ws.flowerPx, ws.flowerPx, col);
      fl.setDepth(y + 0.16);
      container?.add(fl);
    }
  }
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

  // Fuller tree clusters (layered canopy) west + east of settlement
  for (const [dq, dr, v] of [
    [-2.8, 0.15, 0],
    [-3.4, -0.55, 1],
    [-2.2, -0.7, 2],
    [-3.6, 0.35, 0],
    [5.0, 0.25, 2],
    [5.7, -0.45, 0],
    [5.4, -0.9, 1],
    [6.2, 0.1, 2],
  ] as const) {
    paintTree(host, container, town.q + dq, town.r + dr, v);
  }

  // Crates at porch (upper terrace) — larger via worldScale
  paintCrate(host, container, town.q + 0.15, town.r + 0.45);
  paintCrate(host, container, town.q + 1.2, town.r + 0.4);
  paintCrate(host, container, town.q + 2.25, town.r + 0.45);

  paintFenceAlongRoad(host, container, town.q + 0.5, town.r, 8);

  // Scatter props so open grass isn't empty (min spacing from worldScale)
  paintScatterProps(host, container, town);

  paintSpacedVillagers(host, container, town, [
    [-3.2, 5.6, '1', true],
    [0.2, 7.4, '7', false],
    [3.8, 5.5, '4', false],
    [7.4, 6.9, '7', true],
  ]);

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
