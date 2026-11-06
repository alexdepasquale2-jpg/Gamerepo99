/**
 * Atlas frame configs for BAKED_SHEETS + ansimuz hero.
 * Call registerSheetFrames after images are loaded (BootScene.create).
 *
 * Named stamp rects (sheet-buildings, after near-white scrub):
 *   inn   (39,9)-(188,150)  149×141
 *   house (300,8)-(396,150) 96×142  — side fragments; prefer geometric house2
 *   tree  (8,21)-(38,150)   30×129
 *   tree-b(39,18)-(70,150)  31×132
 *
 * Cliff grid (sheet-cliff 64×32): lip 0–3, face 4–7, base 8–11
 * Ground (sheet-ground 32×32): grass 0–2, edge 6–11, dirt 12–17
 * Hero (ansimuz 16×16): row0 side 0–2, row1 back 3–5, row2 front 6–8
 */
import type Phaser from 'phaser';
import { BAKED_SHEETS } from './asset-manifest';
import { toPublicUrl } from './sheet-url';

export const HERO_TEX = 'hero-ansimuz';
export const SHADOW_TEX = 'soft-shadow';
export const GRASS_CALM_TEX = 'grass-calm';
export const DIRT_CALM_TEX = 'dirt-calm';
export const DIRT_EDGE_TEX = 'dirt-edge';

export type SheetFrameConfig = {
  key: string;
  repoPath: string;
  frameWidth: number;
  frameHeight: number;
};

/** Uniform grid sheets — frame indices match assets/manifest/overworld-assets.json. */
export const SHEET_FRAME_CONFIGS: SheetFrameConfig[] = [
  { key: 'sheet-ground', repoPath: BAKED_SHEETS.ground, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-biomes', repoPath: BAKED_SHEETS.biomes, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-crops', repoPath: BAKED_SHEETS.crops, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-ores', repoPath: BAKED_SHEETS.ores, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-fauna', repoPath: BAKED_SHEETS.fauna, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-caravans', repoPath: BAKED_SHEETS.caravans, frameWidth: 32, frameHeight: 32 },
  { key: 'sheet-buildings', repoPath: BAKED_SHEETS.buildings, frameWidth: 160, frameHeight: 100 },
  { key: 'sheet-cliff', repoPath: BAKED_SHEETS.cliff, frameWidth: 64, frameHeight: 32 },
];

/** Documented named-stamp rects for Forge review. */
export const NAMED_STAMP_RECTS = {
  inn: { sheet: 'sheet-buildings', x: 39, y: 9, w: 149, h: 141 },
  house: { sheet: 'sheet-buildings', x: 300, y: 8, w: 96, h: 142 },
  tree: { sheet: 'sheet-buildings', x: 8, y: 21, w: 30, h: 129 },
  'tree-b': { sheet: 'sheet-buildings', x: 39, y: 18, w: 31, h: 132 },
  'cliff-lip': { sheet: 'sheet-cliff', frame: '0' },
  'cliff-face': { sheet: 'sheet-cliff', frame: '4' },
  'cliff-base': { sheet: 'sheet-cliff', frame: '8' },
  'grass-calm': { keys: ['grass-calm-0', 'grass-calm-1', 'grass-calm-2'] },
  'road-dirt': { sheet: 'sheet-ground', frames: [12, 13, 14] },
  'road-edge-ns': { sheet: 'sheet-ground', frames: [6, 7, 8] },
  hero: { sheet: HERO_TEX, frameW: 16, frameH: 16, idle: 7, walkDown: [6, 7, 8], walkUp: [3, 4, 5], walkSide: [0, 1, 2] },
} as const;

export function sheetTextureKey(sheetId: string): string {
  if (sheetId.startsWith('sheet-')) return sheetId;
  const map: Record<string, string> = {
    ground: 'sheet-ground',
    cliff: 'sheet-cliff',
    buildings: 'sheet-buildings',
    buildingsSide: 'sheet-buildings-side',
    biomes: 'sheet-biomes',
    fauna: 'sheet-fauna',
    crops: 'sheet-crops',
    ores: 'sheet-ores',
    caravans: 'sheet-caravans',
  };
  return map[sheetId] ?? sheetId;
}

export function preloadOverworldSheets(load: Phaser.Loader.LoaderPlugin): void {
  for (const cfg of SHEET_FRAME_CONFIGS) {
    load.image(cfg.key, toPublicUrl(cfg.repoPath));
  }
  load.image('sheet-buildings-side', toPublicUrl(BAKED_SHEETS.buildingsSide));
  load.image(HERO_TEX, toPublicUrl('assets/vendor/ansimuz-hero.png'));
}

function addGridFrames(
  textures: Phaser.Textures.TextureManager,
  key: string,
  frameWidth: number,
  frameHeight: number,
): void {
  if (!textures.exists(key)) return;
  const tex = textures.get(key);
  if (tex.has('0') || tex.frameTotal > 1) return;
  const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = 'width' in src ? src.width : 0;
  const h = 'height' in src ? src.height : 0;
  let idx = 0;
  for (let y = 0; y + frameHeight <= h; y += frameHeight) {
    for (let x = 0; x + frameWidth <= w; x += frameWidth) {
      tex.add(String(idx), 0, x, y, frameWidth, frameHeight);
      idx += 1;
    }
  }
}

function addNamedFrame(
  textures: Phaser.Textures.TextureManager,
  key: string,
  frameName: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!textures.exists(key)) return;
  const tex = textures.get(key);
  if (tex.has(frameName)) {
    // Replace stale rects from earlier boots in HMR — remove then re-add
    try {
      tex.remove(frameName);
    } catch {
      /* ignore */
    }
  }
  tex.add(frameName, 0, x, y, w, h);
}

/** Connected-component stamps (warm half only; white scrubbed on sheet). */
export function registerNamedStamps(textures: Phaser.Textures.TextureManager): void {
  addNamedFrame(textures, 'sheet-buildings', 'inn', 39, 9, 149, 141);
  addNamedFrame(textures, 'sheet-buildings', 'house', 300, 8, 96, 142);
  addNamedFrame(textures, 'sheet-buildings', 'tree', 8, 21, 30, 129);
  addNamedFrame(textures, 'sheet-buildings', 'tree-b', 39, 18, 31, 132);
  // Cliff lip / face / base = grid frames 0, 4, 8 (also aliased by name)
  addNamedFrame(textures, 'sheet-cliff', 'lip', 0, 0, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'face', 0, 32, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'base', 0, 64, 64, 32);
}

export function generateSoftShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHADOW_TEX)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(16, 6, 28, 10);
  g.generateTexture(SHADOW_TEX, 32, 12);
  g.destroy();
}

/**
 * Calm grass (v4): flat base + ±2 micro noise + soft low-freq blob tint.
 * No fillCircle swirls (those read as repeating polka dots).
 */
export function generateCalmGround(scene: Phaser.Scene): void {
  const size = 32;
  const mkGrass = (key: string, br: number, bg: number, bb: number, seed: number) => {
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    // Low-freq value noise via bilinear upsample of 4×4
    const cell = 4;
    const grid: number[][] = [];
    let s = seed >>> 0;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return (s & 0xffff) / 0xffff;
    };
    for (let gy = 0; gy <= cell; gy++) {
      grid[gy] = [];
      for (let gx = 0; gx <= cell; gx++) grid[gy]![gx] = rnd();
    }
    const sample = (x: number, y: number) => {
      const fx = (x / size) * cell;
      const fy = (y / size) * cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const v00 = grid[y0]![x0]!;
      const v10 = grid[y0]![Math.min(cell, x0 + 1)]!;
      const v01 = grid[Math.min(cell, y0 + 1)]![x0]!;
      const v11 = grid[Math.min(cell, y0 + 1)]![Math.min(cell, x0 + 1)]!;
      const a = v00 + (v10 - v00) * tx;
      const b = v01 + (v11 - v01) * tx;
      return a + (b - a) * ty;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const micro = ((Math.imul(x + seed, 374761393) ^ Math.imul(y, 668265263)) & 7) - 3;
        const blob = sample(x, y); // 0..1
        const warm = (blob - 0.42) * 18;
        img.data[i] = Math.max(0, Math.min(255, br + micro + warm));
        img.data[i + 1] = Math.max(0, Math.min(255, bg + micro + warm * 0.6));
        img.data[i + 2] = Math.max(0, Math.min(255, bb + micro - warm * 0.4));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, canvas);
  };

  mkGrass(`${GRASS_CALM_TEX}-0`, 128, 186, 68, 0x11);
  mkGrass(`${GRASS_CALM_TEX}-1`, 118, 168, 58, 0x22); // cooler moss patch
  mkGrass(`${GRASS_CALM_TEX}-2`, 140, 192, 78, 0x33); // warmer sun patch
  if (!scene.textures.exists(GRASS_CALM_TEX)) {
    mkGrass(GRASS_CALM_TEX, 130, 184, 70, 0x11);
  }

  // Solid dirt fill
  if (!scene.textures.exists(DIRT_CALM_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x9a7a48, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x8a6a3a, 0.25);
    g.fillRect(4, 6, 8, 5);
    g.fillRect(18, 20, 7, 4);
    g.generateTexture(DIRT_CALM_TEX, 32, 32);
    g.destroy();
  }

  // Dirt with soft N/S alpha fade for 1-tile road edges over grass
  if (!scene.textures.exists(DIRT_EDGE_TEX)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        const edge = Math.min(y, 31 - y);
        const a = edge <= 5 ? Math.floor((edge / 5) * 220) : 255;
        const micro = ((x * 13 + y * 7) & 5) - 2;
        img.data[i] = 154 + micro;
        img.data[i + 1] = 122 + micro;
        img.data[i + 2] = 72 + micro;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(DIRT_EDGE_TEX, canvas);
  }
}

export function registerSheetFrames(textures: Phaser.Textures.TextureManager): void {
  for (const cfg of SHEET_FRAME_CONFIGS) {
    addGridFrames(textures, cfg.key, cfg.frameWidth, cfg.frameHeight);
  }
  addGridFrames(textures, HERO_TEX, 16, 16);
  registerNamedStamps(textures);
}

export function createHeroAnims(anims: Phaser.Animations.AnimationManager): void {
  const mk = (key: string, frames: number[]) => {
    if (anims.exists(key)) return;
    anims.create({
      key,
      frames: frames.map((f) => ({ key: HERO_TEX, frame: String(f) })),
      frameRate: 6,
      repeat: -1,
    });
  };
  mk('hero-walk-down', [6, 7, 8]);
  mk('hero-walk-up', [3, 4, 5]);
  mk('hero-walk-left', [0, 1, 2]);
  mk('hero-walk-right', [0, 1, 2]);
  if (!anims.exists('hero-idle-down')) {
    anims.create({
      key: 'hero-idle-down',
      frames: [{ key: HERO_TEX, frame: '7' }],
      frameRate: 1,
    });
  }
}
