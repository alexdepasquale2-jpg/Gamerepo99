/**
 * Canvas-baked cliff terrace + road ribbon strips (presentation only).
 * Continuous pixel-column cliff; smooth stroke road with soft feather.
 */
import { TILE_PX } from '../../sim/map/constants';

export type StripHost = {
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
};

function hash2(a: number, b: number): number {
  return Math.abs((a * 73856093) ^ (b * 19349663)) >>> 0;
}

/** Continuous meander offset in tiles (float) for smooth ribbon curves. */
export function roadMeanderOffsetFloat(q: number): number {
  // Lower spatial frequency → gentler Catmull-Rom curves
  return 0.75 * Math.sin(q * 0.07) + 0.35 * Math.sin(q * 0.17 + 1.1);
}

/** Integer meander for tile-key expansion / grass skip. */
export function roadMeanderOffset(q: number): number {
  return Math.round(roadMeanderOffsetFloat(q));
}

/** Expand sim road cells into a meandering visual ribbon. */
export function expandMeanderRoadKeys(roadKeys: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of roadKeys) {
    const [qs, rs] = key.split(',');
    const q = Number(qs);
    const r = Number(rs);
    const off = roadMeanderOffset(q);
    out.add(`${q},${r + off}`);
    if (Math.abs(Math.sin(q * 0.29)) > 0.72) out.add(`${q},${r + off - 1}`);
  }
  return out;
}

/** Smooth cliff contour in pixels (continuous, not tile-stepped). */
export function cliffContourY(xPx: number, baseY: number): number {
  return (
    baseY +
    9 * Math.sin(xPx * 0.016 + 0.4) +
    4.5 * Math.sin(xPx * 0.037 + 1.3) +
    2 * Math.sin(xPx * 0.08)
  );
}

/**
 * Bake one continuous cliff strip with lower terrace shade baked in.
 * Procedural rock (no 64px sample wrap seams).
 */
export function bakeCliffStrip(
  host: StripHost,
  key: string,
  widthTiles: number,
): Phaser.GameObjects.Image | null {
  const w = Math.max(64, widthTiles * TILE_PX);
  const lipH = 12;
  const faceH = 40;
  const baseH = 10;
  const lowerShade = 4 * TILE_PX; // Pass 5: short shade tied to rock face
  const pad = 20;
  const h = pad + lipH + faceH + baseH + lowerShade + 8;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);

  const baseY = pad + lipH;
  for (let x = 0; x < w; x++) {
    const cy = cliffContourY(x, baseY);
    const end = Math.min(x, w - 1 - x);
    // Wide soft terminus (~128px): slope/ramp into grass, no hard vertical cut
    const taper = end < 160 ? end / 160 : 1;
    if (taper < 0.012) continue;
    const endFade = Math.min(1, end / 120);
    const rampZone = taper < 0.55; // grassy ramp termini

    // Face grows from taper 0.25 with ease-in so left edge is a long slope
    const faceT = Math.max(0, Math.min(1, (taper - 0.25) / 0.75));
    const faceEase = faceT * faceT * faceT; // cubic ease-in: slow start
    const faceHt = Math.max(0, Math.floor(faceH * faceEase));
    const lipHt = rampZone
      ? Math.max(2, Math.floor(12 * Math.pow(taper, 0.75)))
      : Math.max(5, Math.floor(lipH));
    const baseHt = faceHt > 6 ? Math.max(2, Math.floor(baseH * faceEase)) : 0;

    // Low-freq rock noise (no 64 period)
    const n =
      0.5 +
      0.25 * Math.sin(x * 0.07 + 0.2) +
      0.15 * Math.sin(x * 0.019) +
      0.1 * Math.sin(x * 0.13 + 2.1);

    // Lip — grassy edge
    for (let dy = 0; dy < lipHt; dy++) {
      const y = Math.round(cy - lipHt + dy);
      if (y < 0 || y >= h) continue;
      const t = dy / lipHt;
      // Ends: reignited grass ramp; middle: rocky lip
      if (rampZone) {
        // Match calm grass (~0x76b84a) so termini don't smear dark green
        const gr = 118 + n * 8;
        const gg = 184 + n * 10;
        const gb = 74 + n * 4;
        put(img, w, x, y, gr, gg, gb, Math.floor(200 * endFade * taper));
      } else {
        put(img, w, x, y, 95 + n * 20, 140 + n * 25, 55 + n * 10, Math.floor(255 * endFade));
        if (t > 0.7) put(img, w, x, y, 150 + n * 15, 125 + n * 10, 80, Math.floor(255 * endFade));
      }
    }
    // Face — continuous rock, pebble flecks (no green ramp wedge smear)
    for (let dy = 0; dy < faceHt; dy++) {
      const y = Math.round(cy + dy);
      if (y < 0 || y >= h) continue;
      const shade = 1 - (dy / faceHt) * 0.28;
      let r = (155 + n * 25) * shade;
      let g = (125 + n * 15) * shade;
      let b = (80 + n * 10) * shade;
      const hsh = hash2(x * 3 + dy, dy * 7 + x);
      if (hsh % 47 === 0) {
        r += 30;
        g += 25;
        b += 15;
      }
      if (dy % 7 === 0) {
        r *= 0.88;
        g *= 0.88;
        b *= 0.88;
      }
      put(img, w, x, y, r, g, b, Math.floor(255 * endFade));
    }
    // Base tuck
    for (let dy = 0; dy < baseHt; dy++) {
      const y = Math.round(cy + faceHt + dy);
      if (y < 0 || y >= h) continue;
      put(img, w, x, y, 65, 50, 32, Math.floor((210 - dy * 15) * endFade));
    }
    // Lower terrace shade ONLY under rock face — grows with faceEase (no free-floating rectangle)
    if (faceHt > 2) {
      const shadeDepth = Math.floor(lowerShade * faceEase);
      const shadePeak = 55 * faceEase;
      for (let dy = 0; dy < shadeDepth; dy++) {
        const y = Math.round(cy + faceHt + baseHt + dy);
        if (y < 0 || y >= h) continue;
        const fall = 1 - dy / Math.max(1, shadeDepth);
        // Extra horizontal soften near strip ends already in faceEase/endFade
        const a = Math.floor(shadePeak * fall * fall * endFade);
        if (a < 5) continue;
        put(img, w, x, y, 42, 80, 34, a);
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  // Blur rock face only (skip lower shade band) to avoid green smear bleed
  blurHRockOnly(ctx, w, h, pad + lipH + faceH + baseH + 4, 1);

  if (host.textures.exists(key)) host.textures.remove(key);
  host.textures.addCanvas(key, canvas);
  return host.add.image(0, 0, key).setOrigin(0, 0);
}

function put(
  img: ImageData,
  w: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const i = (y * w + x) * 4;
  img.data[i] = Math.max(0, Math.min(255, r | 0));
  img.data[i + 1] = Math.max(0, Math.min(255, g | 0));
  img.data[i + 2] = Math.max(0, Math.min(255, b | 0));
  img.data[i + 3] = Math.max(0, Math.min(255, a | 0));
}

function blurH(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number): void {
  blurHRockOnly(ctx, w, h, h, radius);
}

/** Horizontal blur limited to y < yMax (keeps terrace shade edges clean). */
function blurHRockOnly(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  yMax: number,
  radius: number,
): void {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  dst.data.set(src.data);
  const yLim = Math.min(h, yMax);
  for (let y = 0; y < yLim; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const xx = Math.max(0, Math.min(w - 1, x + dx));
        const i = (y * w + xx) * 4;
        const aa = src.data[i + 3]!;
        if (aa < 1) continue;
        r += src.data[i]! * aa;
        g += src.data[i + 1]! * aa;
        b += src.data[i + 2]! * aa;
        a += aa;
        n += aa;
      }
      const o = (y * w + x) * 4;
      if (n < 1) continue;
      dst.data[o] = r / n;
      dst.data[o + 1] = g / n;
      dst.data[o + 2] = b / n;
      dst.data[o + 3] = a / (radius * 2 + 1);
    }
  }
  ctx.putImageData(dst, 0, 0);
}

/**
 * Smooth stroke road ribbon — continuous fill along centerline, then soft alpha feather.
 */
export function bakeRoadRibbon(
  host: StripHost,
  key: string,
  roadKeys: Set<string>,
  chunkOriginQ: number,
  chunkOriginR: number,
  chunkTiles: number,
): Phaser.GameObjects.Image | null {
  if (roadKeys.size === 0) return null;
  const size = chunkTiles * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  // Stroke connected raster neighbours without projecting onto X: supports
  // north/south roads, forks and loops, with no invented extra meander.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [width, color] of [[26, 'rgba(112,89,54,0.3)'], [21, '#8c6e40'], [12, '#9a7a48']] as const) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const k of roadKeys) {
      const [q, r] = k.split(',').map(Number) as [number, number];
      const x = (q - chunkOriginQ + 0.5) * TILE_PX;
      const y = (r - chunkOriginR + 1) * TILE_PX;
      for (const [dq, dr] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        if (!roadKeys.has(`${q + dq!},${r + dr!}`)) continue;
        ctx.moveTo(x, y);
        ctx.lineTo(x + dq! * TILE_PX, y + dr! * TILE_PX);
      }
      // Carry the dirt ribbon all the way to the chunk boundary.
      if (q === chunkOriginQ || q === chunkOriginQ + chunkTiles - 1 || r === chunkOriginR || r === chunkOriginR + chunkTiles - 1) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + (q === chunkOriginQ ? -TILE_PX : q === chunkOriginQ + chunkTiles - 1 ? TILE_PX : 0), y + (r === chunkOriginR ? -TILE_PX : r === chunkOriginR + chunkTiles - 1 ? TILE_PX : 0));
      }
      ctx.moveTo(x + width / 2, y);
      ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  if (host.textures.exists(key)) host.textures.remove(key);
  host.textures.addCanvas(key, canvas);
  const img = host.add.image(chunkOriginQ * TILE_PX, chunkOriginR * TILE_PX, key);
  img.setOrigin(0, 0);
  img.setDepth(0.5);
  return img;
}

/** Subtle low-frequency multiply tint so grass doesn't lock to 32px. */
export function addGrassTintOverlay(
  host: StripHost,
  container: Phaser.GameObjects.Container,
  originQ: number,
  originR: number,
  chunkTiles: number,
): void {
  const size = chunkTiles * TILE_PX;
  const key = `grass-tint-${originQ},${originR}`;
  if (!host.textures.exists(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = originQ * TILE_PX + x;
        const wy = originR * TILE_PX + y;
        // Period >= 256px (2π/256 ≈ 0.0245); keep coeffs well under that
        const n =
          Math.sin(wx * 0.012 + 0.2) * 0.5 +
          Math.sin(wy * 0.011 - 0.5) * 0.35 +
          Math.sin((wx + wy) * 0.009) * 0.15;
        const i = (y * size + x) * 4;
        // Multiply identity ≈ 255; <=3% amplitude
        const v = Math.floor(255 * (1 + n * 0.03));
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    host.textures.addCanvas(key, canvas);
  }
  const overlay = host.add.image(originQ * TILE_PX, originR * TILE_PX, key);
  overlay.setOrigin(0, 0);
  overlay.setDepth(0.12);
  overlay.setBlendMode(2); // MULTIPLY
  overlay.setAlpha(1);
  container.add(overlay);
}
