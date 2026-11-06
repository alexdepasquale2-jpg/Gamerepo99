/**
 * Atlas frame configs for BAKED_SHEETS + ansimuz hero + world grass.
 * Call registerSheetFrames after images are loaded (BootScene.create).
 *
 * Named stamp rects (Pass 2):
 *   inn     sheet-buildings (39,9,149,141)
 *   tree    sheet-buildings (8,21,30,129)
 *   tree-b  sheet-buildings (39,18,31,132)
 *   house2  stamp-house2.png (full texture; ansimuz town pack extract)
 *   cliff   lip/face/base grid 0/4/8
 *   grass   grass-world 256² → 32×32 world-aligned frames 0..63
 *   road    sheet-ground 12–14 dirt, 6–8 edges; dirt-edge soft N/S
 *   hero    16×16 ansimuz rows side/back/front
 */
import type Phaser from 'phaser';
import { BAKED_SHEETS } from './asset-manifest';
import { toPublicUrl } from './sheet-url';

export const HERO_TEX = 'hero-ansimuz';
export const SHADOW_TEX = 'soft-shadow';
export const GRASS_CALM_TEX = 'grass-calm';
export const GRASS_WORLD_TEX = 'grass-world';
export const DIRT_CALM_TEX = 'dirt-calm';
export const DIRT_EDGE_TEX = 'dirt-edge';
export const HOUSE2_TEX = 'stamp-house2';
export const SETTLEMENT_TEX = 'stamp-settlement';

export type SheetFrameConfig = {
  key: string;
  repoPath: string;
  frameWidth: number;
  frameHeight: number;
};

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

export const NAMED_STAMP_RECTS = {
  inn: { sheet: 'sheet-buildings', x: 39, y: 9, w: 149, h: 141 },
  tree: { sheet: 'sheet-buildings', x: 8, y: 21, w: 30, h: 129 },
  'tree-b': { sheet: 'sheet-buildings', x: 39, y: 18, w: 31, h: 132 },
  house2: { sheet: HOUSE2_TEX, x: 0, y: 0, w: 88, h: 132 },
  settlement: { sheet: SETTLEMENT_TEX, x: 0, y: 0, w: 207, h: 120 },
  'cliff-lip': { sheet: 'sheet-cliff', frame: '0' },
  'cliff-face': { sheet: 'sheet-cliff', frame: '4' },
  'cliff-base': { sheet: 'sheet-cliff', frame: '8' },
  'grass-world': { sheet: GRASS_WORLD_TEX, frameW: 32, frameH: 32, cols: 8, rows: 8 },
  'road-dirt': { sheet: 'sheet-ground', frames: [12, 13, 14] },
  'road-edge-ns': { sheet: 'sheet-ground', frames: [6, 7, 8] },
  hero: {
    sheet: HERO_TEX,
    idle: 7,
    walkDown: [6, 7, 8],
    walkUp: [3, 4, 5],
    walkSide: [0, 1, 2],
  },
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
  load.image(HOUSE2_TEX, toPublicUrl('assets/sprites/stamp-house2.png'));
  load.image(SETTLEMENT_TEX, toPublicUrl('assets/sprites/stamp-settlement.png'));
  load.image(GRASS_WORLD_TEX, toPublicUrl('assets/sprites/grass-world.png'));
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
    try {
      tex.remove(frameName);
    } catch {
      /* ignore */
    }
  }
  tex.add(frameName, 0, x, y, w, h);
}

export function registerNamedStamps(textures: Phaser.Textures.TextureManager): void {
  addNamedFrame(textures, 'sheet-buildings', 'inn', 39, 9, 149, 141);
  addNamedFrame(textures, 'sheet-buildings', 'tree', 8, 21, 30, 129);
  addNamedFrame(textures, 'sheet-buildings', 'tree-b', 39, 18, 31, 132);
  addNamedFrame(textures, 'sheet-cliff', 'lip', 0, 0, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'face', 0, 32, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'base', 0, 64, 64, 32);
  // World-aligned grass frames: frame index = (q&7) + ((r&7)*8)
  if (textures.exists(GRASS_WORLD_TEX)) {
    const tex = textures.get(GRASS_WORLD_TEX);
    if (!tex.has('0')) {
      let idx = 0;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          tex.add(String(idx), 0, col * 32, row * 32, 32, 32);
          idx += 1;
        }
      }
    }
  }
}

/** World-space grass frame for tile q,r — neighbors share edges (no grid flash). */
export function grassWorldFrame(q: number, r: number): string {
  const col = ((q % 8) + 8) % 8;
  const row = ((r % 8) + 8) % 8;
  return String(col + row * 8);
}

export function generateSoftShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHADOW_TEX)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(16, 6, 28, 10);
  g.generateTexture(SHADOW_TEX, 32, 12);
  g.destroy();
}

/** Fallback calm tiles + dirt/edge if grass-world missing. */
export function generateCalmGround(scene: Phaser.Scene): void {
  const mkSolid = (key: string, rgb: number) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(rgb, 1);
    g.fillRect(0, 0, 32, 32);
    g.generateTexture(key, 32, 32);
    g.destroy();
  };
  mkSolid(`${GRASS_CALM_TEX}-0`, 0x80ba44);
  mkSolid(`${GRASS_CALM_TEX}-1`, 0x76a83a);
  mkSolid(`${GRASS_CALM_TEX}-2`, 0x8cc850);
  if (!scene.textures.exists(GRASS_CALM_TEX)) mkSolid(GRASS_CALM_TEX, 0x80ba44);
  if (!scene.textures.exists(DIRT_CALM_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x9a7a48, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x8a6a3a, 0.3);
    g.fillRect(6, 8, 9, 5);
    g.fillRect(18, 18, 8, 4);
    g.generateTexture(DIRT_CALM_TEX, 32, 32);
    g.destroy();
  }
  if (!scene.textures.exists(DIRT_EDGE_TEX)) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(32, 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        const edgeN = Math.min(y, 31 - y);
        const edgeE = Math.min(x, 31 - x);
        const edge = Math.min(edgeN, edgeE);
        const a = edge <= 4 ? Math.floor((edge / 4) * 230) : 255;
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
