/**
 * Asset loading for the whole game (the boot scene calls these). Baked sheets come from the overworld
 * manifest (data/art/overworld-assets.json), served from /sprites and /vendor (Vite publicDir ../assets).
 *
 * Texture keys other areas may rely on (kept from the old game):
 *   'hero-ansimuz' (16x16 frames 0..8), anims 'hero-walk-down|up|left|right', 'hero-idle-down',
 *   'ansimuz-npc', 'soft-shadow', 'hf-puff', 'sheet-ground|biomes|crops|ores|fauna|caravans' (32px frames),
 *   'sheet-buildings' (160x100), 'sheet-cliff' (64x32), 'ansimuz-trees-bushes' (frames tree-oak, tree-pine, tree-fir, bush-round).
 */
import type Phaser from 'phaser';
import manifest from '../data/art/overworld-assets.json';
import { paintPropTextures } from './art/prop-art';
import { paintThingTextures } from './art/thing-art';
import { paintBuildingTextures } from './art/building-art';

export const HERO_TEX = 'hero-ansimuz';
export const NPC_TEX = 'ansimuz-npc';
export const SHADOW_TEX = 'soft-shadow';
export const PUFF_TEX = 'hf-puff';
export const TREES_TEX = 'ansimuz-trees-bushes';
export const GRASS_WORLD_TEX = 'grass-world';

/** Map a repo path (assets/...) to a public URL (respects the build's base path). */
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export function toPublicUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\/+/, '');
  return BASE + (trimmed.startsWith('assets/') ? trimmed.slice('assets/'.length) : trimmed);
}

const SHEETS = manifest.bakedSheets as Record<string, string>;
/** Grid sheets: key, manifest sheet id, frame size. */
const GRID: [string, string, number, number][] = [
  ['sheet-ground', 'ground', 32, 32],
  ['sheet-biomes', 'biomes', 32, 32],
  ['sheet-crops', 'crops', 32, 32],
  ['sheet-ores', 'ores', 32, 32],
  ['sheet-fauna', 'fauna', 32, 32],
  ['sheet-caravans', 'caravans', 32, 32],
  ['sheet-buildings', 'buildings', 160, 100],
  ['sheet-cliff', 'cliff', 64, 32],
];

export function preloadWorldAssets(scene: Phaser.Scene): void {
  const load = scene.load;
  for (const [key, id] of GRID) load.image(key, toPublicUrl(SHEETS[id] ?? `assets/sprites/${key}.png`));
  load.image('sheet-buildings-side', toPublicUrl(SHEETS.buildingsSide ?? 'assets/sprites/sheet-buildings-side.png'));
  load.image(HERO_TEX, toPublicUrl('assets/vendor/ansimuz-hero.png'));
  load.image(NPC_TEX, toPublicUrl('assets/vendor/ansimuz-npc.png'));
  load.image(TREES_TEX, toPublicUrl('assets/vendor/ansimuz-trees-and-bushes.png'));
  load.image(GRASS_WORLD_TEX, toPublicUrl('assets/sprites/grass-world.png'));
  load.image('stamp-house2', toPublicUrl('assets/sprites/stamp-house2.png'));
  load.image('stamp-settlement', toPublicUrl('assets/sprites/stamp-settlement.png'));
}

function addGridFrames(textures: Phaser.Textures.TextureManager, key: string, fw: number, fh: number): void {
  if (!textures.exists(key)) return;
  const tex = textures.get(key);
  if (tex.has('0')) return;
  const src = tex.getSourceImage() as HTMLImageElement;
  let i = 0;
  for (let y = 0; y + fh <= src.height; y += fh) for (let x = 0; x + fw <= src.width; x += fw) tex.add(String(i++), 0, x, y, fw, fh);
}

function addFrame(textures: Phaser.Textures.TextureManager, key: string, name: string, x: number, y: number, w: number, h: number): void {
  if (!textures.exists(key)) return;
  const tex = textures.get(key);
  if (!tex.has(name)) tex.add(name, 0, x, y, w, h);
}

function heroAnims(anims: Phaser.Animations.AnimationManager): void {
  const mk = (key: string, frames: number[], rate = 6) => {
    if (anims.exists(key)) return;
    anims.create({ key, frames: frames.map((f) => ({ key: HERO_TEX, frame: String(f) })), frameRate: rate, repeat: -1 });
  };
  mk('hero-walk-down', [6, 7, 8]);
  mk('hero-walk-up', [3, 4, 5]);
  mk('hero-walk-left', [0, 1, 2]);
  mk('hero-walk-right', [0, 1, 2]);
  mk('hero-idle-down', [7], 1);
}

export function createWorldAssets(scene: Phaser.Scene): void {
  const t = scene.textures;
  for (const [key, , fw, fh] of GRID) addGridFrames(t, key, fw, fh);
  addGridFrames(t, HERO_TEX, 16, 16);
  addGridFrames(t, NPC_TEX, 16, 16);
  // ansimuz Trees & Bushes (CC0): native aspect, shown at scale 1 (authored large).
  addFrame(t, TREES_TEX, 'tree-oak', 23, 13, 87, 113);
  addFrame(t, TREES_TEX, 'tree-pine', 122, 19, 98, 128);
  addFrame(t, TREES_TEX, 'tree-fir', 229, 1, 53, 44);
  addFrame(t, TREES_TEX, 'bush-round', 229, 51, 39, 23);
  heroAnims(scene.anims);
  if (!t.exists(SHADOW_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.22).fillEllipse(16, 6, 28, 10);
    g.generateTexture(SHADOW_TEX, 32, 12);
    g.destroy();
  }
  if (!t.exists(PUFF_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
    g.generateTexture(PUFF_TEX, 8, 8);
    g.destroy();
  }
  paintPropTextures(scene);
  paintThingTextures(scene);
  paintBuildingTextures(scene);
}

/*
 * Manifest art: every ready entry of the overworld manifest whose sheet is listed in `artSheets` (the
 * credited packs in assets/vendor plus baked sheets) becomes a frame named by its key ('fauna.pig') on that
 * sheet's texture. Loaded on demand, off the boot path: the world's look is still the code-drawn props.
 */
type ArtSheet = { path: string; frameW: number; frameH: number };
type ArtEntry = { key: string; sheet: string; frame: number; rect?: number[]; status: string };
const ART_SHEETS = (manifest as { artSheets?: Record<string, ArtSheet> }).artSheets ?? {};
const ART_ENTRIES = Object.values(manifest.assets as Record<string, ArtEntry>).filter((e) => e.status === 'ready' && ART_SHEETS[e.sheet]);
const artTex = (sheet: string): string => `art-${sheet}`;

/** Texture and frame of a manifest key once loadManifestArt has run; null before, or for a key with no pack source. */
export function manifestFrame(scene: Phaser.Scene, key: string): { tex: string; frame: string } | null {
  const e = ART_ENTRIES.find((x) => x.key === key);
  if (!e || !scene.textures.exists(artTex(e.sheet)) || !scene.textures.get(artTex(e.sheet)).has(key)) return null;
  return { tex: artTex(e.sheet), frame: key };
}

/** Load the packs the manifest's ready entries point at and name a frame per key. Resolves with the keys. */
export function loadManifestArt(scene: Phaser.Scene): Promise<string[]> {
  const name = (): string[] => {
    for (const e of ART_ENTRIES) {
      const sheet = ART_SHEETS[e.sheet]!, key = artTex(e.sheet);
      if (!scene.textures.exists(key)) continue;
      const tex = scene.textures.get(key);
      if (tex.has(e.key)) continue;
      const src = tex.getSourceImage() as HTMLImageElement;
      const cols = Math.max(1, Math.floor(src.width / sheet.frameW));
      const [x, y, w, h] = e.rect ?? [(e.frame % cols) * sheet.frameW, Math.floor(e.frame / cols) * sheet.frameH, sheet.frameW, sheet.frameH];
      tex.add(e.key, 0, x!, y!, w!, h!);
    }
    return ART_ENTRIES.filter((e) => scene.textures.exists(artTex(e.sheet))).map((e) => e.key);
  };
  const missing = [...new Set(ART_ENTRIES.map((e) => e.sheet))].filter((s) => !scene.textures.exists(artTex(s)));
  if (!missing.length) return Promise.resolve(name());
  return new Promise((resolve) => {
    for (const s of missing) scene.load.image(artTex(s), toPublicUrl(ART_SHEETS[s]!.path));
    scene.load.once('complete', () => resolve(name()));
    scene.load.start();
  });
}
