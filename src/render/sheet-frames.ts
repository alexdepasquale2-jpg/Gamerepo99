/**
 * Atlas frame configs for BAKED_SHEETS + ansimuz hero.
 * Call registerSheetFrames after images are loaded (BootScene.create).
 */
import type Phaser from 'phaser';
import { BAKED_SHEETS } from './asset-manifest';
import { toPublicUrl } from './sheet-url';

export const HERO_TEX = 'hero-ansimuz';
export const SHADOW_TEX = 'soft-shadow';
export const GRASS_CALM_TEX = 'grass-calm';
export const DIRT_CALM_TEX = 'dirt-calm';

export type SheetFrameConfig = {
  /** Texture key after load (basename without .png preferred). */
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

/** Queue image loads for all baked sheets + hero. */
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
  if (tex.has(frameName)) return;
  tex.add(frameName, 0, x, y, w, h);
}

/** Inn/tree/terrace crops that match mockup v4 better than uniform grids. */
export function registerNamedStamps(textures: Phaser.Textures.TextureManager): void {
  // Alive inn complex (trees + two-story INN) — covers cells 0/1/4/5 of the 160×100 grid
  addNamedFrame(textures, 'sheet-buildings', 'inn', 0, 0, 320, 200);
  addNamedFrame(textures, 'sheet-buildings', 'inn-roof', 0, 0, 320, 100);
  addNamedFrame(textures, 'sheet-buildings', 'tree', 4, 8, 56, 180);
  addNamedFrame(textures, 'sheet-buildings', 'tree-b', 48, 20, 48, 160);
  // Waystation / camp-ish side wing (cell 2+6 area)
  addNamedFrame(textures, 'sheet-buildings', 'wing', 320, 0, 160, 200);
  // Terrace cliff strip (grass lip + dirt face)
  addNamedFrame(textures, 'sheet-cliff', 'terrace', 0, 0, 256, 100);
  addNamedFrame(textures, 'sheet-cliff', 'lip', 0, 0, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'face', 0, 32, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'base', 0, 64, 64, 32);
  addNamedFrame(textures, 'sheet-cliff', 'face-l', 2, 104, 78, 24);
  addNamedFrame(textures, 'sheet-cliff', 'face-r', 83, 104, 45, 24);
}

/** Soft elliptical shadow under stamps / hero. */
export function generateSoftShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHADOW_TEX)) return;
  const g = scene.make.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(16, 6, 28, 10);
  g.generateTexture(SHADOW_TEX, 32, 12);
  g.destroy();
}

/**
 * Calm grass + dirt (v4): solid mean color, ±2 micro noise, soft blob tint.
 * Avoids sheet-ground frame hashing that reads as a checkerboard.
 */
export function generateCalmGround(scene: Phaser.Scene): void {
  const mk = (key: string, rgb: number, blobRgb: number, size = 32) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(rgb, 1);
    g.fillRect(0, 0, size, size);
    // Soft irregular blob (not square tile structure)
    g.fillStyle(blobRgb, 0.18);
    g.fillCircle(size * 0.35, size * 0.4, size * 0.45);
    g.fillStyle(blobRgb, 0.12);
    g.fillCircle(size * 0.7, size * 0.65, size * 0.35);
    g.generateTexture(key, size, size);
    g.destroy();
  };
  // Mean of ansimuz grass (~138,184,65) nudged greener like v4 reignited
  mk(`${GRASS_CALM_TEX}-0`, 0x82b84a, 0x6a9e38);
  mk(`${GRASS_CALM_TEX}-1`, 0x84ba4c, 0x5f9434);
  mk(`${GRASS_CALM_TEX}-2`, 0x80b648, 0x72a840);
  // Alias primary
  if (!scene.textures.exists(GRASS_CALM_TEX)) {
    mk(GRASS_CALM_TEX, 0x82b84a, 0x6a9e38);
  }
  // Dirt / road fill (tan)
  mk(DIRT_CALM_TEX, 0x9a7a48, 0x8a6a3a);
  mk(`${DIRT_CALM_TEX}-edge`, 0x8e7344, 0x7a6238);
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
  // Rows: 0 side, 1 back, 2 front — cols walk cycle (16×16 ansimuz)
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
