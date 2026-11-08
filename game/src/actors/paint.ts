/**
 * Tiny pixel painter shared by the actor sprite sheets: rects on a 2D canvas, colour shading, and a dark
 * outline pass so small figures read against any ground. Pure canvas; no Phaser.
 */

export type Pen = {
  /** Fill a rect (frame-local pixels). Skips when colour is empty. */
  r(x: number, y: number, w: number, h: number, color: string): void;
  /** One pixel. */
  p(x: number, y: number, color: string): void;
};

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  return { canvas, g };
}

/** A pen that draws into one frame cell at (ox, oy). */
export function pen(g: CanvasRenderingContext2D, ox: number, oy: number, fw: number, fh: number): Pen {
  const r = (x: number, y: number, w: number, h: number, color: string): void => {
    if (!color || w <= 0 || h <= 0) return;
    // Clip to the cell so a sprite never bleeds into its neighbour frame.
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(fw, x + w), y1 = Math.min(fh, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    g.fillStyle = color;
    g.fillRect(ox + x0, oy + y0, x1 - x0, y1 - y0);
  };
  return { r, p: (x, y, color) => r(x, y, 1, 1, color) };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Lighten (f > 0) or darken (f < 0) a #rrggbb colour by a fraction. */
export function shade(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`;
}

export const hexNum = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

/**
 * Dark 1px outline around every opaque shape, cell by cell (never across a frame edge).
 * `fw`/`fh` are the frame size; the canvas is a grid of such frames.
 */
export function outline(g: CanvasRenderingContext2D, w: number, h: number, fw: number, fh: number, color = [27, 22, 18, 230]): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => d[(y * w + x) * 4 + 3]! > 40;
  const marks: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      const cx = x % fw, cy = y % fh;
      const n =
        (cx > 0 && solid(x - 1, y)) || (cx < fw - 1 && solid(x + 1, y)) ||
        (cy > 0 && solid(x, y - 1)) || (cy < fh - 1 && solid(x, y + 1));
      if (n) marks.push((y * w + x) * 4);
    }
  }
  for (const i of marks) { d[i] = color[0]!; d[i + 1] = color[1]!; d[i + 2] = color[2]!; d[i + 3] = color[3]!; }
  g.putImageData(img, 0, 0);
}

/** FNV-1a string hash (stable across runs). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
