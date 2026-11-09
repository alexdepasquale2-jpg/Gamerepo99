/**
 * Art-pack frames blended into the code-drawn world (data/art/overworld-assets.json): ore boulders, cart
 * loads, a caravan's pack mule, a scavenging rat, and the ground's biome patches and plant decals. Only
 * where the code-drawn look had nothing, or something weak; everything else keeps its painted look.
 *
 * The packs load off the boot path (assets.loadManifestArt) the first time anything asks. Until they
 * arrive callers get null and keep their code-drawn look; packVersion() ticks when they land, so a layer
 * that cached a look can redraw (or listen for PACK_ART_EVENT). A pack frame is drawn at a finer pixel than the world's 1x art shown at
 * 2x, so each one is re-sampled once onto the 1x grid (area average, hard alpha) and shown at ART_SCALE:
 * one pixel size across the whole world.
 */
import type Phaser from 'phaser';
import { MANIFEST_ART_KEYS, loadManifestArt, manifestFrame } from '../assets';
import { setGroundDecals, type GroundDecal } from '../ground-paint';

type Load = { version: number; started: boolean };
const loads = new WeakMap<Phaser.Textures.TextureManager, Load>();
const loadOf = (scene: Phaser.Scene): Load => {
  let l = loads.get(scene.textures);
  if (!l) { l = { version: 0, started: false }; loads.set(scene.textures, l); }
  return l;
};

/** Emitted on game.events when pack art lands, for layers whose looks only redraw on a state change. */
export const PACK_ART_EVENT = 'pack-art-ready';

/** Start the pack load once (every caller may ask; only the first does anything). */
export function startPackArt(scene: Phaser.Scene): void {
  const l = loadOf(scene);
  if (l.started) return;
  l.started = true;
  installGroundDecals(scene);
  void loadManifestArt(scene).then((keys) => {
    // A load cut short (its scene stopped) lets the next caller try again.
    if (keys.length < MANIFEST_ART_KEYS) l.started = false;
    if (!keys.length) return;
    installGroundDecals(scene);
    l.version++;
    scene.game.events.emit(PACK_ART_EVENT);
  });
}

/** Ticks each time more pack art becomes drawable (0 until the packs have loaded). */
export const packVersion = (scene: Phaser.Scene): number => loadOf(scene).version;

/**
 * Re-sample a source rect onto the world's 1x grid, `f` source px per 1x px (`fy` down, when a frame is
 * squashed to sit flat), trimmed to its opaque pixels. Area-averaged colour (alpha weighted) with a hard
 * alpha edge keeps it crisp pixel art.
 */
export function resample(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, f: number, fy = f): HTMLCanvasElement | null {
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  const d = g.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3]! > 0) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const tw = Math.max(1, Math.round(w / f)), th = Math.max(1, Math.round(h / fy));
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const og = out.getContext('2d')!;
  const img = og.createImageData(tw, th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const ax = x0 + Math.floor((tx * w) / tw), bx = Math.max(ax + 1, x0 + Math.floor(((tx + 1) * w) / tw));
    const ay = y0 + Math.floor((ty * h) / th), by = Math.max(ay + 1, y0 + Math.floor(((ty + 1) * h) / th));
    let r = 0, gg = 0, b = 0, a = 0, n = 0;
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
      const i = (y * sw + x) * 4, al = d[i + 3]!;
      r += d[i]! * al; gg += d[i + 1]! * al; b += d[i + 2]! * al; a += al; n++;
    }
    if (a < n * 127.5) continue;
    const o = (ty * tw + tx) * 4;
    img.data[o] = r / a; img.data[o + 1] = gg / a; img.data[o + 2] = b / a; img.data[o + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

/** Re-sample one frame of a loaded texture (see resample). Null if the texture or frame is missing. */
function resampleFrame(scene: Phaser.Scene, tex: string, frame: string, f: number, fy = f): HTMLCanvasElement | null {
  if (!scene.textures.exists(tex) || !scene.textures.get(tex).has(frame)) return null;
  const fr = scene.textures.getFrame(tex, frame);
  return resample(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, f, fy);
}

/**
 * A manifest key's frame as a 1x world texture (`f` source px per 1x px), or null while its pack is not
 * loaded (or the key has no pack source). Baked once per key and factor, then shared.
 */
/** Bakes that came out empty (a blank frame): never retried, as callers ask every refresh or frame. */
const blank = new Set<string>();

export function packTex(scene: Phaser.Scene, key: string, f = 2, fy = f): string | null {
  startPackArt(scene);
  const name = `pk-${key}-${f}x${fy}`;
  if (scene.textures.exists(name)) return name;
  const mf = blank.has(name) ? null : manifestFrame(scene, key);
  if (!mf) return null;
  const canvas = resampleFrame(scene, mf.tex, mf.frame, f, fy);
  if (!canvas) { blank.add(name); return null; }
  scene.textures.addCanvas(name, canvas);
  return name;
}

/**
 * Same, for one frame of an 8-way heading strip (caravan.caravaner frames N, NE, E … NW). `post` finishes
 * the baked canvas once (the caller's outline, say) before it becomes a texture.
 */
export function packHeadingTex(scene: Phaser.Scene, key: string, heading: number, f = 2, post?: (c: HTMLCanvasElement) => HTMLCanvasElement): string | null {
  startPackArt(scene);
  const name = `pk-${key}-h${heading}-${f}`;
  if (scene.textures.exists(name)) return name;
  const mf = blank.has(name) ? null : manifestFrame(scene, key);
  if (!mf) return null;
  const base = scene.textures.get(mf.tex).get(mf.frame), img = base.source.image as HTMLImageElement;
  // The keyed frame is the strip's first (N); its headings follow it left to right on the same row.
  const x = base.cutX + (((heading % 8) + 8) % 8) * base.cutWidth;
  const canvas = x + base.cutWidth <= img.width ? resample(img, x, base.cutY, base.cutWidth, base.cutHeight, f) : null;
  if (!canvas) { blank.add(name); return null; }
  scene.textures.addCanvas(name, post ? post(canvas) : canvas);
  return name;
}

/*
 * Ground decals for the chunk painter. Biome patches are a soft, dither-edged oval of the biome's own
 * ground art laid thinly over the painted ground; plant decals (reeds at the water, wild barley in the
 * heath) are pack sprites painted straight into the chunk. The four baked-sheet biomes are there from
 * boot; the pack ones join when the packs land (chunks painted after that carry them).
 */
const PATCH_W = 12, PATCH_H = 7;
/** Biome key -> where its art is: a baked boot sheet frame, or a manifest pack key. */
const BOOT_BIOMES: Record<string, string> = { river_margin: '0', ash_wood: '2', mill_heath: '4', glare_approach: '6' };
const PACK_BIOMES = ['peat_fen', 'chalk_downs', 'brine_marsh', 'slag_verge'];

function patchOf(tile: HTMLCanvasElement | null, id: string): GroundDecal | null {
  if (!tile) return null;
  const c = document.createElement('canvas');
  c.width = PATCH_W;
  c.height = PATCH_H;
  const g = c.getContext('2d')!;
  g.drawImage(tile, 0, 0, PATCH_W, PATCH_H, 0, 0, PATCH_W, PATCH_H);
  const img = g.getImageData(0, 0, PATCH_W, PATCH_H);
  const cx = (PATCH_W - 1) / 2, cy = (PATCH_H - 1) / 2;
  for (let y = 0; y < PATCH_H; y++) for (let x = 0; x < PATCH_W; x++) {
    const e = ((x - cx) / (PATCH_W / 2)) ** 2 + ((y - cy) / (PATCH_H / 2)) ** 2;
    // Solid core, checkerboard rim: a dithered edge, never a smooth fade, so it stays pixel art.
    if (e < 0.55 || (e < 1 && ((x + y) & 1) === 0)) continue;
    img.data[(y * PATCH_W + x) * 4 + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  return { id: `biome.${id}`, img: c, w: PATCH_W, h: PATCH_H, alpha: 0.4 };
}

function spriteOf(scene: Phaser.Scene, key: string, f: number): GroundDecal | null {
  const mf = manifestFrame(scene, key);
  const c = mf && resampleFrame(scene, mf.tex, mf.frame, f);
  return c ? { id: key, img: c, w: c.width, h: c.height, alpha: 1 } : null;
}

function installGroundDecals(scene: Phaser.Scene): void {
  const patch: Record<string, GroundDecal> = {};
  for (const [id, frame] of Object.entries(BOOT_BIOMES)) {
    const p = patchOf(resampleFrame(scene, 'sheet-biomes', frame, 2), id);
    if (p) patch[id] = p;
  }
  for (const id of PACK_BIOMES) {
    const mf = manifestFrame(scene, `biome.${id}`);
    const p = patchOf(mf && resampleFrame(scene, mf.tex, mf.frame, 2), id);
    if (p) patch[id] = p;
  }
  // The manifest's road.* frame numbers land on grass in the baked ground sheet; its dirt is the last row
  // (frames 12-17), so the road speckle samples that.
  const dirt = resampleFrame(scene, 'sheet-ground', '13', 2) ?? undefined;
  setGroundDecals({ patch, reed: spriteOf(scene, 'crop.crop_reed', 3), tuft: spriteOf(scene, 'crop.crop_barley', 2), road: dirt });
}
