import { paintSettlement } from './settlement-art';
import { FORD_BIOME, paintFordTile } from './ford-paint';
import { BIOME_COLOR, type Biome } from '../../sim/map/terrain';
/** Render-side painters for continuous overworld chunks. Presentation only. */

import type Phaser from 'phaser';
import type { ChunkTiles, FacilityRenderView, TileRenderView } from '../../sim/map/types';
import { CHUNK_SIZE, TILE_PX } from '../../sim/map/constants';
import { lookupAsset } from '../asset-manifest';
import { applySpriteSort, tileFootWorld, tileToWorld } from '../depth-sort';
import {
  GRASS_CALM_TEX,
  HERO_TEX,
  TREES_TEX,
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

  const ws = FEEL.worldScale;
  // Layer A: mid tufts + flowers (readable Stardew density)
  paintPoissonLayer(host, container, ox, oy, size, originQ, originR, ws.poissonCellA, ws.poissonKeepA, 0x3d6b28, true);
  // Layer B: darker tufts
  paintPoissonLayer(host, container, ox, oy, size, originQ + 17, originR + 9, ws.poissonCellB, ws.poissonKeepB, 0x2a4f1c, false);
  // Layer C: extra flower/tuft sprinkle so open grass isn't empty
  paintPoissonLayer(host, container, ox, oy, size, originQ + 31, originR + 19, ws.poissonCellC, ws.poissonKeepC, 0x4a7a32, true);
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
  const color = BIOME_COLOR[tile.biomeId as Biome];
  if (color) {
    const tint = host.add.rectangle(tile.q * TILE_PX, tile.r * TILE_PX, TILE_PX, TILE_PX, color);
    tint.setOrigin(0, 0).setAlpha(tile.biomeId === 'water' ? 0.92 : 0.28).setDepth(0.3);
    container.add(tint);
  }
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
  addSoftShadow(host, container, foot.x, foot.y, 1.1);
  // Integer uniform scale only (same x/y) — never setDisplaySize stretch.
  // Prefer remapped+flattened ansimuz Trees & Bushes (town olive flat bands) at scale 1 — authored large.
  // Fallback: town-pack pines from sheet-buildings at artScale.
  if (host.textures.exists(TREES_TEX)) {
    const tex = host.textures.get(TREES_TEX);
    const pick = variant % 3 === 0 ? 'tree-oak' : variant % 3 === 1 ? 'tree-pine' : 'tree-fir';
    const fr = tex.has(pick) ? pick : tex.has('tree-oak') ? 'tree-oak' : tex.has('tree-pine') ? 'tree-pine' : null;
    if (fr) {
      const img = host.add.image(foot.x, foot.y, TREES_TEX, fr);
      applySpriteSort(img);
      img.setScale(1);
      container?.add(img);
      return;
    }
  }
  if (host.textures.exists('sheet-buildings')) {
    const tex = host.textures.get('sheet-buildings');
    const fr =
      variant % 2 === 0 && tex.has('tree') ? 'tree' : tex.has('tree-b') ? 'tree-b' : 'tree';
    if (tex.has(fr)) {
      const img = host.add.image(foot.x, foot.y, 'sheet-buildings', fr);
      applySpriteSort(img);
      img.setScale(FEEL.worldScale.artScale);
      container?.add(img);
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


/** Place villagers with screen-space AABB gaps (16×artScale → 32px at artScale 2). */
function paintSpacedVillagers(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
  candidates: [number, number, string, boolean][],
): void {
  // Screen-space: clear if dx OR dy clears scaled sprite (16*artScale + gap)
  const minAxis = FEEL.worldScale.artScale * 16 + 12;
  const placed: { x: number; y: number }[] = [];
  // Cliff strip at town.r+4 — feet must be north of (cliffR - 0.4) OR south of cliffR+clear
  const cliffR = town.r + 4;
  const clear = FEEL.worldScale.cliffClearTiles;
  const maxUpperR = cliffR - 0.6;
  const minLowerR = cliffR + clear;
  for (const [dq, dr, frame, flip] of candidates) {
    let q = town.q + dq;
    let r = town.r + dr;
    // Snap into a legal band from the intended side
    if (r < cliffR) {
      if (r > maxUpperR) r = maxUpperR;
    } else if (r < minLowerR) {
      r = minLowerR;
    }
    let foot = tileFootWorld(q, r);
    for (let attempt = 0; attempt < 14; attempt++) {
      const overlaps = placed.some((p) => {
        const dx = Math.abs(foot.x - p.x);
        const dy = Math.abs(foot.y - p.y);
        return dx < minAxis && dy < minAxis;
      });
      // Strict interior of cliff band only (maxUpperR itself is legal upper meadow)
      const onCliff = r > maxUpperR && r < minLowerR;
      if (!overlaps && !onCliff) break;
      q += attempt % 2 === 0 ? 1.5 : -1.2;
      if (r <= maxUpperR || (r < cliffR && onCliff)) {
        r = Math.min(r - 0.25, maxUpperR); // nudge north away from face
      } else {
        r = Math.max(r + 0.25, minLowerR);
      }
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
    sp.setScale(FEEL.worldScale.artScale);
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



/** CC0 ansimuz bush-round (flat town-olive), or procedural flat-band bush. */
function paintBush(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  q: number,
  r: number,
): void {
  const foot = tileFootWorld(q, r);
  paintScatterOne(host, container, foot.x, foot.y, 'bush');
}

/**
 * Small tilled wheat patch south of the roadside fence (not on it).
 * Tiny stalks (~⅓–½ tile), jittered rows — never sheet-crops veggie icons.
 */
function paintRoadsideCrops(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
): void {
  // Clearly below fence/road (fence ~town.r), north of cliff
  const baseR = town.r + 1.85;
  const baseQ = town.q + 3.5;
  const rows = 3;
  const cols = 6;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const h = hash2(town.q * 17 + col * 5 + row * 11, town.r * 13 + row * 19 + col);
      // empty gaps
      if (h % 100 < 28) continue;
      const jx = (((h >> 8) % 1000) / 1000 - 0.5) * 0.45;
      const jy = (((h >> 16) % 1000) / 1000 - 0.5) * 0.35;
      const q = baseQ + col * 0.42 + jx;
      const r = baseR + row * 0.42 + jy;
      const foot = tileFootWorld(q, r);
      paintWheatStalk(host, container, foot.x, foot.y, h);
    }
  }
}

/** Tiny wheat stalk (≤ half tile), stem + small gold tip. */
function paintWheatStalk(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  x: number,
  y: number,
  seed: number,
): void {
  const h = 8 + (seed % 4); // 8–11px ≈ ¼–⅓ tile
  const stem = host.add.rectangle(x, y - h / 2, 1, h, 0x5a7a28);
  applySpriteSort(stem);
  container?.add(stem);
  const head = host.add.rectangle(x, y - h - 1, 3, 3, seed % 2 === 0 ? 0xd4b84a : 0xc4a840);
  head.setDepth(y + 0.12);
  container?.add(head);
}


/**
 * Jittered poisson clusters for left flank + lower meadow.
 * Varied spacing + skip chance leave empty grass (no rigid grid rows).
 */
function paintMeadowFillRing(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
): void {
  const ws = FEEL.worldScale;
  const cliffR = town.r + 4;
  const clear = ws.cliffClearTiles;
  const exQ = ws.treeExcludeQ;
  const exR = ws.treeExcludeR;
  type Kind = 'bush' | 'rock' | 'log' | 'stump' | 'hay' | 'flowers';
  const kinds: Kind[] = ['bush', 'flowers', 'rock', 'flowers', 'bush', 'stump', 'hay', 'rock', 'flowers'];
  const placed: { x: number; y: number }[] = [];

  const tryPlace = (dq: number, dr: number, kind: Kind, minPx: number) => {
    if (Math.abs(dq - 0.8) < exQ && Math.abs(dr) < exR) return;
    const absR = town.r + dr;
    if (absR >= cliffR - 0.3 && absR < cliffR + clear) return;
    const foot = tileFootWorld(town.q + dq, absR);
    if (placed.some((p) => Math.hypot(p.x - foot.x, p.y - foot.y) < minPx)) return;
    placed.push(foot);
    paintScatterOne(host, container, foot.x, foot.y, kind);
  };

  // Cluster seeds (irregular), then 2–4 jittered members each — not a lattice
  const clusters: { dq: number; dr: number; n: number; cell: number }[] = [
    // left flank
    { dq: -7.2, dr: 0.6, n: 3, cell: 1.1 },
    { dq: -8.4, dr: 2.1, n: 4, cell: 1.0 },
    { dq: -6.4, dr: 2.8, n: 2, cell: 1.2 },
    { dq: -9.0, dr: 1.4, n: 2, cell: 0.9 },
    // lower meadow (south of cliff)
    { dq: -6.5, dr: 7.0, n: 3, cell: 1.15 },
    { dq: -3.0, dr: 7.8, n: 4, cell: 1.05 },
    { dq: 0.5, dr: 7.2, n: 3, cell: 1.2 },
    { dq: 3.8, dr: 8.0, n: 4, cell: 1.0 },
    { dq: 7.0, dr: 7.5, n: 3, cell: 1.15 },
    { dq: -5.0, dr: 9.5, n: 3, cell: 1.1 },
    { dq: -1.2, dr: 10.0, n: 2, cell: 1.25 },
    { dq: 2.5, dr: 9.8, n: 3, cell: 1.05 },
    { dq: 6.2, dr: 10.4, n: 3, cell: 1.1 },
    { dq: 9.0, dr: 9.2, n: 2, cell: 1.2 },
    { dq: -8.0, dr: 11.0, n: 3, cell: 1.0 },
    { dq: 0.0, dr: 12.2, n: 2, cell: 1.3 },
    { dq: 4.5, dr: 12.0, n: 3, cell: 1.15 },
  ];

  let ki = 0;
  for (const c of clusters) {
    // ~25% chance to skip whole cluster → empty grass pockets
    const ch = hash2(Math.floor(town.q + c.dq * 10), Math.floor(town.r + c.dr * 10));
    if (ch % 100 < 25) continue;
    for (let i = 0; i < c.n; i++) {
      const h = hash2(Math.floor(c.dq * 40) + i * 17, Math.floor(c.dr * 40) + i * 23 + ch);
      // per-member skip for more empty grass
      if (h % 100 < 22) continue;
      const jx = (((h >> 8) % 1000) / 1000 - 0.5) * c.cell * 2.2;
      const jy = (((h >> 16) % 1000) / 1000 - 0.5) * c.cell * 2.2;
      const minPx = ws.scatterMinPx * (0.75 + ((h >> 4) % 50) / 100); // varied spacing
      tryPlace(c.dq + jx, c.dr + jy, kinds[ki % kinds.length]!, minPx);
      ki += 1;
    }
  }
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
  // Porch accents only — left/lower density comes from jittered poisson clusters
  const candidates: { dq: number; dr: number; kind: Kind }[] = [
    { dq: -4.5, dr: 1.2, kind: 'bush' },
    { dq: -1.0, dr: 2.4, kind: 'rock' },
    { dq: 3.0, dr: 2.0, kind: 'log' },
    { dq: 6.8, dr: 1.0, kind: 'stump' },
    { dq: -0.5, dr: -1.2, kind: 'sign' },
    { dq: 1.5, dr: 3.2, kind: 'hay' },
    { dq: -5.5, dr: 0.4, kind: 'flowers' },
    { dq: 8.5, dr: 2.2, kind: 'bush' },
    { dq: 4.2, dr: -0.8, kind: 'rock' },
    { dq: 9.6, dr: 1.4, kind: 'flowers' },
  ];
  const placed: { x: number; y: number }[] = [];
  const cliffR = town.r + 4;
  const clear = FEEL.worldScale.cliffClearTiles;
  for (const c of candidates) {
    const absR = town.r + c.dr;
    // Keep scatter off the cliff face band
    if (absR >= cliffR - 0.3 && absR < cliffR + clear) continue;
    const foot = tileFootWorld(town.q + c.dq, absR);
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
    // Flat town-olive bush (3 bands) — matches building shading; CC0 palette from ansimuz remap
    const shade = host.add.ellipse(x + 1, y - ws.bushR * 0.35, ws.bushR * 2.2, ws.bushR * 1.25, 0x3a4216);
    applySpriteSort(shade);
    const mid = host.add.ellipse(x, y - ws.bushR * 0.65, ws.bushR * 2.05, ws.bushR * 1.55, 0x688028);
    applySpriteSort(mid);
    const lit = host.add.ellipse(x - 2, y - ws.bushR * 1.0, ws.bushR * 1.15, ws.bushR * 0.75, 0xa8b848);
    applySpriteSort(lit);
    container?.add(shade);
    container?.add(mid);
    container?.add(lit);
  } else if (kind === 'rock') {
    const shade = host.add.ellipse(x + 1, y - ws.rockR * 0.25, ws.rockR * 2.1, ws.rockR * 1.1, 0x5a554c);
    applySpriteSort(shade);
    const r = host.add.ellipse(x, y - ws.rockR * 0.4, ws.rockR * 2, ws.rockR * 1.3, 0x7a756c);
    applySpriteSort(r);
    const lit = host.add.ellipse(x - 2, y - ws.rockR * 0.7, ws.rockR * 0.9, ws.rockR * 0.55, 0x9a958c);
    applySpriteSort(lit);
    container?.add(shade);
    container?.add(r);
    container?.add(lit);
  } else if (kind === 'log') {
    const log = host.add.rectangle(x, y - ws.logH / 2, ws.logW, ws.logH, 0x6b4423);
    applySpriteSort(log);
    container?.add(log);
  } else if (kind === 'stump') {
    const st = host.add.ellipse(x, y - ws.stumpR * 0.3, ws.stumpR * 2, ws.stumpR, 0x5a3a1a);
    applySpriteSort(st);
    const top = host.add.ellipse(x, y - ws.stumpR * 0.7, ws.stumpR * 1.5, ws.stumpR * 0.55, 0x7a5a3a);
    applySpriteSort(top);
    container?.add(st);
    container?.add(top);
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
    // Flower patch — tight cluster (not scatter noise)
    for (const [ox, oy, col] of [
      [0, 0, 0xf0d878],
      [5, -2, 0xe8a0c0],
      [-5, -1, 0xf0d878],
      [3, 4, 0xe8a0c0],
      [-3, 3, 0xf0d878],
      [7, 2, 0xe8a0c0],
      [-7, 1, 0xf0d878],
      [1, -5, 0xe8a0c0],
    ] as const) {
      const fl = host.add.rectangle(x + ox, y + oy - 4, ws.flowerPx, ws.flowerPx, col);
      fl.setDepth(y + 0.16);
      container?.add(fl);
    }
  }
}

export function paintTownMarker(
  host: PaintHost, container: Phaser.GameObjects.Container | null,
  town: import('../../sim/map/world-layout').LayoutSettlement & { name?: string },
): void { paintSettlement(host, town, container); }

export function paintChunkContents(
  host: PaintHost,
  chunk: ChunkTiles,
): Phaser.GameObjects.Container {
  const container = host.add.container(0, 0);
  const roadKeys = new Set(
    chunk.tiles.filter((t) => isRoadBiome(t.biomeId)).map((t) => `${t.q},${t.r}`),
  );

  const baseQ = chunk.cx * CHUNK_SIZE;
  const baseR = chunk.cy * CHUNK_SIZE;

  // Pass 4: one solid calm fill per chunk — kills per-tile color blocks entirely
  paintChunkGrassFill(host, container, baseQ, baseR, CHUNK_SIZE);
  paintPoissonGrassDetail(host, container, baseQ, baseR, CHUNK_SIZE);
  addGrassTintOverlay(host, container, baseQ, baseR, CHUNK_SIZE);

  // Coherent regional terrain over the art fill. A single graphics object per
  // chunk keeps water/forest/hills visible without thousands of scene objects.
  const terrain = host.add.graphics();
  terrain.setDepth(0.3);
  for (const tile of chunk.tiles) {
    if (tile.biomeId === FORD_BIOME) { paintFordTile(terrain, tile.q, tile.r); continue; }
    const color = BIOME_COLOR[tile.biomeId as Biome];
    if (!color) continue;
    terrain.fillStyle(color, tile.biomeId === 'water' ? 0.94 : 0.36);
    terrain.fillRect(tile.q * TILE_PX, tile.r * TILE_PX, TILE_PX, TILE_PX);
  }
  container.add(terrain);

  // Organic road ribbon (soft edges) — one bake per chunk
  if (roadKeys.size > 0) {
    const key = `road-ribbon-${chunk.cx},${chunk.cy}`;
    const ribbon = bakeRoadRibbon(host, key, roadKeys, baseQ, baseR, CHUNK_SIZE);
    if (ribbon) container.add(ribbon);
  }

  // Joined plank decks, with rails only at the outside edges (not every tile).
  const bridges = host.add.graphics();
  const deck = new Set(chunk.tiles.filter((t) => t.biomeId === 'road_bridge' || t.biomeId === 'bridge_deck').map((t) => `${t.q},${t.r}`));
  for (const key of deck) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const x = q * TILE_PX, y = r * TILE_PX;
    bridges.fillStyle(0x473122).fillRect(x, y, TILE_PX, TILE_PX);
    for (let row = 0; row < 4; row++) bridges.fillStyle(row % 2 ? 0xa57548 : 0xb88954).fillRect(x, y + row * 8 + 1, TILE_PX, 6);
    bridges.lineStyle(3, 0x65442b);
    if (!deck.has(`${q - 1},${r}`) && q > baseQ) bridges.lineBetween(x + 1, y, x + 1, y + TILE_PX);
    if (!deck.has(`${q + 1},${r}`) && q < baseQ + CHUNK_SIZE - 1) bridges.lineBetween(x + TILE_PX - 1, y, x + TILE_PX - 1, y + TILE_PX);
  }
  container.add(bridges);
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
