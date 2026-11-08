/**
 * Tiny pixel painter: crisp 1x canvas art (no anti-aliasing) registered as a Phaser texture and shown
 * at ART_SCALE. Every code-drawn prop, building and thing in the world area is made with this.
 */
import type Phaser from 'phaser';

/** Code-drawn art is painted at 1x and shown at 2x, like the vendor sheets. */
export const ART_SCALE = 2;

export type Px = {
  readonly w: number;
  readonly h: number;
  rect(x: number, y: number, w: number, h: number, c: string, a?: number): Px;
  /** Filled ellipse centred on (cx, cy) with radii rx, ry, pixel-exact. */
  disc(cx: number, cy: number, rx: number, ry: number, c: string, a?: number): Px;
  /** A gable roof: rows narrowing from `w` at the eave (y + h) to a ridge at y. */
  roof(x: number, y: number, w: number, h: number, c: string, light?: string): Px;
  px(x: number, y: number, c: string): Px;
  /** Soft contact shadow under a foot at (cx, bottom). */
  shadow(cx: number, rx: number, ry?: number): Px;
};

export function painter(ctx: CanvasRenderingContext2D, w: number, h: number): Px {
  const p: Px = {
    w, h,
    rect(x, y, rw, rh, c, a = 1) {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
      ctx.globalAlpha = 1;
      return p;
    },
    disc(cx, cy, rx, ry, c, a = 1) {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        const t = (y + 0.5 - cy) / ry;
        if (t * t > 1) continue;
        const half = rx * Math.sqrt(1 - t * t);
        const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
        if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
      }
      ctx.globalAlpha = 1;
      return p;
    },
    roof(x, y, rw, rh, c, light) {
      for (let i = 0; i < rh; i++) {
        const inset = Math.round(((rh - 1 - i) / rh) * (rw / 2 - 1));
        p.rect(x + inset, y + i, rw - inset * 2, 1, c);
        if (light && i % 3 === 1) p.rect(x + inset + 1, y + i, rw - inset * 2 - 2, 1, light);
      }
      return p;
    },
    px(x, y, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      return p;
    },
    shadow(cx, rx, ry = Math.max(2, Math.round(rx / 3))) {
      return p.disc(cx, h - ry, rx, ry, '#000000', 0.22);
    },
  };
  return p;
}

/** Paint a w x h texture once under `key` (no-op if it exists). Returns the key. */
export function makeTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: Px) => void): string {
  if (scene.textures.exists(key)) return key;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(painter(ctx, w, h));
  scene.textures.addCanvas(key, canvas);
  return key;
}

/** Hex colour string -> 0xRRGGBB. */
export const hexNum = (s: string): number => parseInt(s.replace('#', ''), 16);

/** Darken or lighten a #rrggbb colour by factor k. */
export function shade(c: string, k: number): string {
  const n = hexNum(c);
  const ch = (v: number) => Math.min(255, Math.max(0, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Stable 32-bit hash of a string (for picking variants). */
export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Stable [0,1) hash of integers. */
export function ihash(a: number, b: number, c = 0): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
