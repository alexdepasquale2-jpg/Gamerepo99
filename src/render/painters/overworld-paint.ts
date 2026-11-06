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

/** Short crop strip along the road east of town (sheet-crops frames 0–2). */
function paintRoadsideCrops(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
): void {
  if (!host.textures.exists('sheet-crops')) return;
  const tex = host.textures.get('sheet-crops');
  // South of road ribbon, north of cliff — keeps the path itself clear
  const rowR = town.r + 1.15;
  for (let i = 0; i < 6; i++) {
    const q = town.q + 3.2 + i * 0.95;
    const foot = tileFootWorld(q, rowR);
    const fr = String(i % 3);
    if (!tex.has(fr)) continue;
    addSoftShadow(host, container, foot.x, foot.y, 0.55);
    const img = host.add.image(foot.x, foot.y, 'sheet-crops', fr);
    applySpriteSort(img);
    img.setDisplaySize(TILE_PX * 0.9, TILE_PX * 0.9);
    container?.add(img);
  }
}


/** Fill visible empty grass: just below cliff + left flank. Respects cliff/building exclusion. */
function paintMeadowFillRing(
  host: PaintHost,
  container: Phaser.GameObjects.Container | null,
  town: { q: number; r: number },
): void {
  const ws = FEEL.worldScale;
  const min = ws.scatterMinPx * 0.92;
  const cliffR = town.r + 4;
  const clear = ws.cliffClearTiles;
  const exQ = ws.treeExcludeQ;
  const exR = ws.treeExcludeR;
  type Kind = 'bush' | 'rock' | 'log' | 'stump' | 'hay' | 'flowers';
  const kinds: Kind[] = ['bush', 'flowers', 'rock', 'bush', 'flowers', 'stump', 'hay', 'bush', 'rock', 'flowers'];
  const placed: { x: number; y: number }[] = [];
  const spots: { dq: number; dr: number }[] = [];
  // South of cliff — first 3 tiles of lower meadow (boot-visible)
  for (let dq = -9; dq <= 10; dq += 1.35) {
    for (let dr = clear + 0.35; dr <= clear + 3.2; dr += 1.15) {
      spots.push({ dq, dr: 4 + dr });
    }
  }
  // Left flank upper terrace (west of settlement AABB)
  for (let dq = -9.5; dq <= -5.2; dq += 1.2) {
    for (let dr = -0.2; dr <= 3.4; dr += 1.1) {
      spots.push({ dq, dr });
    }
  }
  let ki = 0;
  for (const s of spots) {
    if (Math.abs(s.dq - 0.8) < exQ && Math.abs(s.dr) < exR) continue;
    const absR = town.r + s.dr;
    if (absR >= cliffR - 0.3 && absR < cliffR + clear) continue;
    const foot = tileFootWorld(town.q + s.dq, absR);
    if (placed.some((p) => Math.hypot(p.x - foot.x, p.y - foot.y) < min)) continue;
    placed.push(foot);
    paintScatterOne(host, container, foot.x, foot.y, kinds[ki % kinds.length]!);
    ki += 1;
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
  // Upper terrace + left flank + lower meadow (south of cliff). Cliff band filtered below.
  const candidates: { dq: number; dr: number; kind: Kind }[] = [
    // porch / upper terrace
    { dq: -4.5, dr: 1.2, kind: 'bush' },
    { dq: -1.0, dr: 2.4, kind: 'rock' },
    { dq: 3.0, dr: 2.0, kind: 'log' },
    { dq: 6.8, dr: 1.0, kind: 'stump' },
    { dq: -0.5, dr: -1.2, kind: 'sign' },
    { dq: 1.5, dr: 3.2, kind: 'hay' },
    { dq: -5.5, dr: 0.4, kind: 'flowers' },
    { dq: 8.5, dr: 2.2, kind: 'bush' },
    { dq: 4.2, dr: -0.8, kind: 'rock' },
    { dq: -6.8, dr: 1.8, kind: 'flowers' },
    { dq: -7.2, dr: 2.6, kind: 'bush' },
    { dq: -6.0, dr: 3.2, kind: 'rock' },
    { dq: 9.6, dr: 1.4, kind: 'flowers' },
    { dq: 10.2, dr: 2.8, kind: 'bush' },
    // meadow south of cliff (dr past cliffClear) — fill the big empty lower field
    { dq: -2.5, dr: 7.2, kind: 'bush' },
    { dq: 1.0, dr: 8.5, kind: 'flowers' },
    { dq: 5.5, dr: 7.5, kind: 'rock' },
    { dq: 8.0, dr: 9.2, kind: 'bush' },
    { dq: -4.0, dr: 8.5, kind: 'log' },
    { dq: 2.5, dr: 9.8, kind: 'stump' },
    { dq: 7.5, dr: 10.5, kind: 'flowers' },
    { dq: -1.5, dr: 10.2, kind: 'hay' },
    { dq: -6.0, dr: 9.0, kind: 'flowers' },
    { dq: 3.5, dr: 11.2, kind: 'bush' },
    { dq: -3.2, dr: 11.0, kind: 'rock' },
    { dq: 6.2, dr: 8.2, kind: 'hay' },
    { dq: 0.2, dr: 12.0, kind: 'flowers' },
    { dq: 9.0, dr: 11.5, kind: 'log' },
    { dq: -5.0, dr: 12.0, kind: 'stump' },
    { dq: 4.8, dr: 12.5, kind: 'bush' },
    { dq: -0.8, dr: 7.0, kind: 'flowers' },
    // left lower meadow
    { dq: -7.5, dr: 7.4, kind: 'bush' },
    { dq: -8.2, dr: 8.6, kind: 'flowers' },
    { dq: -6.8, dr: 9.8, kind: 'rock' },
    { dq: -9.0, dr: 10.2, kind: 'bush' },
    { dq: -7.8, dr: 11.4, kind: 'flowers' },
    { dq: -5.6, dr: 13.0, kind: 'bush' },
    { dq: -8.6, dr: 12.6, kind: 'stump' },
    { dq: -4.4, dr: 13.4, kind: 'flowers' },
    { dq: -9.4, dr: 7.8, kind: 'log' },
    // center/right lower meadow fill
    { dq: 0.8, dr: 13.2, kind: 'bush' },
    { dq: 2.2, dr: 14.0, kind: 'flowers' },
    { dq: 5.8, dr: 13.6, kind: 'rock' },
    { dq: 7.2, dr: 14.2, kind: 'bush' },
    { dq: 9.4, dr: 13.0, kind: 'flowers' },
    { dq: 1.6, dr: 7.8, kind: 'bush' },
    { dq: 3.8, dr: 8.8, kind: 'flowers' },
    { dq: -2.0, dr: 13.8, kind: 'hay' },
    { dq: 6.8, dr: 11.8, kind: 'stump' },
    { dq: -1.0, dr: 14.4, kind: 'rock' },
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

  // Town-palette CC0 oaks/pines in clusters west/east — footprints clear of building stamp
  const exQ = FEEL.worldScale.treeExcludeQ;
  const exR = FEEL.worldScale.treeExcludeR;
  for (const [dq, dr, v] of [
    [-4.2, 0.3, 0],
    [-5.0, -0.5, 1],
    [-4.6, -1.1, 0],
    [-5.4, 0.6, 2],
    [-3.8, -1.4, 1],
    [6.2, 0.3, 1],
    [7.0, -0.4, 0],
    [6.6, -1.0, 2],
    [7.6, 0.2, 0],
    [7.2, -1.2, 1],
  ] as const) {
    // Exclusion AABB around settlement origin (inn+house stamp)
    if (Math.abs(dq - 0.8) < exQ && Math.abs(dr) < exR) continue;
    paintTree(host, container, town.q + dq, town.r + dr, v);
  }

  // Crates at porch (upper terrace) — larger via worldScale
  paintCrate(host, container, town.q + 0.15, town.r + 0.45);
  paintCrate(host, container, town.q + 1.2, town.r + 0.4);
  paintCrate(host, container, town.q + 2.25, town.r + 0.45);

  paintFenceAlongRoad(host, container, town.q + 0.5, town.r, 8);

  // Crop row south of the east road (josehzz sheet-crops) — keeps path readable
  paintRoadsideCrops(host, container, town);

  // Extra CC0 bushes/small trees on left flank + lower meadow (outside building AABB)
  for (const [dq, dr, v] of [
    [-7.0, 0.2, 2],
    [-8.0, 1.0, 2],
    [-7.5, 7.0, 2],
    [-8.5, 9.5, 0],
    [1.5, 13.5, 2],
    [8.5, 12.8, 2],
    [-3.5, 13.0, 1],
  ] as const) {
    if (Math.abs(dq - 0.8) < exQ && Math.abs(dr) < exR) continue;
    const absR = town.r + dr;
    const cliffR = town.r + 4;
    if (absR >= cliffR - 0.3 && absR < cliffR + FEEL.worldScale.cliffClearTiles) continue;
    if (v === 2) {
      paintBush(host, container, town.q + dq, absR);
    } else {
      paintTree(host, container, town.q + dq, absR, v);
    }
  }

  // Scatter props so open grass isn't empty (min spacing from worldScale)
  paintScatterProps(host, container, town);
  // Dense ring just south of cliff + left flank (visible boot framing)
  paintMeadowFillRing(host, container, town);

  // Meadow south of cliff (r+4); paintSpacedVillagers also enforces cliffClearTiles
  // Boot camera: place on upper meadow (south of stamp, north of cliff at r+4) — on-screen & clear of face
  paintSpacedVillagers(host, container, town, [
    [-4.2, 2.2, '1', true],
    [8.4, 2.3, '7', false],
    [-5.2, 3.0, '4', false],
    [9.2, 3.1, '7', true],
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
