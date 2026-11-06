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
  const lowerShade = 7 * TILE_PX;
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
    const taper = end < 128 ? end / 128 : 1;
    if (taper < 0.015) continue;
    const endFade = Math.min(1, end / 96);
    const rampZone = taper < 0.7; // wide grassy ramp termini

    // Smooth ease into rock face (no sudden vertical wall)
    const faceT = rampZone ? 0 : (taper - 0.7) / 0.3;
    const faceEase = faceT * faceT * (3 - 2 * faceT);
    const faceHt = Math.max(0, Math.floor(faceH * faceEase));
    const lipHt = rampZone
      ? Math.max(2, Math.floor(14 * Math.pow(taper, 0.7)))
      : Math.max(5, Math.floor(lipH));
    const baseHt = faceHt > 8 ? Math.max(2, Math.floor(baseH * faceEase)) : 0;

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
        const gr = 110 + n * 12;
        const gg = 175 + n * 18;
        const gb = 60 + n * 8;
        put(img, w, x, y, gr, gg, gb, Math.floor(255 * endFade * (0.55 + 0.45 * taper)));
      } else {
        put(img, w, x, y, 95 + n * 20, 140 + n * 25, 55 + n * 10, Math.floor(255 * endFade));
        if (t > 0.7) put(img, w, x, y, 150 + n * 15, 125 + n * 10, 80, Math.floor(255 * endFade));
      }
    }
    // Grass ramp wedge at termini (slopes into lower terrace)
    if (rampZone && taper > 0.05) {
      const rampH = Math.floor(28 * taper);
      for (let dy = 0; dy < rampH; dy++) {
        const y = Math.round(cy + dy);
        if (y < 0 || y >= h) continue;
        const t = dy / rampH;
        const a = Math.floor((180 * (1 - t) * taper) * endFade);
        put(img, w, x, y, 100 + n * 10, 160 + n * 15, 55 + n * 6, a);
      }
    }

    // Face — continuous rock, pebble flecks
    for (let dy = 0; dy < faceHt; dy++) {
      const y = Math.round(cy + dy);
      if (y < 0 || y >= h) continue;
      const shade = 1 - (dy / faceHt) * 0.28;
      let r = (155 + n * 25) * shade;
      let g = (125 + n * 15) * shade;
      let b = (80 + n * 10) * shade;
      // sparse pebbles (hash, not periodic)
      const hsh = hash2(x * 3 + dy, dy * 7 + x);
      if (hsh % 47 === 0) {
        r += 30;
        g += 25;
        b += 15;
      }
      // horizontal strata
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
    // Lower terrace shade (baked). Ramp ends: soft grass darkening only.
    const shadeDepth = rampZone ? Math.floor(lowerShade * 0.45 * taper) : lowerShade;
    for (let dy = 0; dy < shadeDepth; dy++) {
      const y = Math.round(cy + faceHt + baseHt + dy);
      if (y < 0 || y >= h) continue;
      const a = Math.max(12, (rampZone ? 70 : 150) - dy * 1.6);
      put(img, w, x, y, 45, 85, 35, Math.floor(a * endFade));
    }
  }

  ctx.putImageData(img, 0, 0);
  // Mild horizontal blur to kill any residual column seams
  blurH(ctx, w, h, 1);

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
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
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

  // Prefer raw sim road cells; apply continuous float meander for smooth Catmull-Rom
  const raw: { q: number; r: number }[] = [];
  for (const k of roadKeys) {
    const [qq, rr] = k.split(',').map(Number);
    if (qq! < chunkOriginQ - 2 || qq! >= chunkOriginQ + chunkTiles + 2) continue;
    raw.push({ q: qq!, r: rr! });
  }
  // Dedup by q (keep median r) — strip prior integer-meander duplicates
  const byQ = new Map<number, number[]>();
  for (const p of raw) {
    const arr = byQ.get(p.q) ?? [];
    arr.push(p.r);
    byQ.set(p.q, arr);
  }
  const uniqQ = [...byQ.keys()].sort((a, b) => a - b);
  if (uniqQ.length < 1) return null;

  const pts: { x: number; y: number }[] = [];
  for (const q of uniqQ) {
    const rs = byQ.get(q)!;
    // Base r: if values look meander-expanded (span), take min as approx sim r
    const baseR = Math.min(...rs);
    const yTile = baseR + roadMeanderOffsetFloat(q);
    pts.push({
      x: (q - chunkOriginQ) * TILE_PX + TILE_PX / 2,
      y: (yTile - chunkOriginR) * TILE_PX + TILE_PX / 2,
    });
  }
  if (pts.length < 2) return null;

  // Insert midpoints so Catmull-Rom has denser controls at bends
  const denser: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    denser.push(a);
    denser.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  denser.push(pts[pts.length - 1]!);
  const samples = densifyCatmullRom(denser, 2);
  // Build left/right edge polygons for a continuous ribbon
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const t = i / Math.max(1, samples.length - 1);
    const halfW = 10 + 2.8 * Math.sin(t * Math.PI * 2.6 + pts[0]!.x * 0.01);
    left.push({ x: p.x + nx * halfW, y: p.y + ny * halfW });
    right.push({ x: p.x - nx * halfW, y: p.y - ny * halfW });
  }

  // Fill solid dirt body
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fillStyle = '#9a7a48';
  ctx.fill();

  // Inner slightly lighter band
  ctx.beginPath();
  const inset = 0.55;
  ctx.moveTo(
    left[0]!.x * inset + samples[0]!.x * (1 - inset),
    left[0]!.y * inset + samples[0]!.y * (1 - inset),
  );
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const l = left[i]!;
    ctx.lineTo(l.x * 0.4 + p.x * 0.6, l.y * 0.4 + p.y * 0.6);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const p = samples[i]!;
    const r = right[i]!;
    ctx.lineTo(r.x * 0.4 + p.x * 0.6, r.y * 0.4 + p.y * 0.6);
  }
  ctx.closePath();
  ctx.fillStyle = '#a88854';
  ctx.fill();

  // Soft feather: draw edge stroke with low alpha then blur
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const width of [14, 10, 6]) {
    ctx.strokeStyle = `rgba(154,122,72,${0.12 + width * 0.01})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(samples[0]!.x, samples[0]!.y);
    for (const p of samples) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  // Sparse pebbles
  for (let i = 0; i < samples.length; i += 6) {
    const p = samples[i]!;
    const h = hash2(Math.floor(p.x * 3), Math.floor(p.y * 5));
    if (h % 3 !== 0) continue;
    ctx.fillStyle = 'rgba(110,88,55,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x + (h % 5) - 2, p.y + ((h >> 3) % 5) - 2, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Alpha feather pass on the whole canvas edges of opaque region
  featherAlpha(ctx, size, size, 5);

  if (host.textures.exists(key)) host.textures.remove(key);
  host.textures.addCanvas(key, canvas);
  const img = host.add.image(chunkOriginQ * TILE_PX, chunkOriginR * TILE_PX, key);
  img.setOrigin(0, 0);
  img.setDepth(0.5);
  return img;
}

function densifyCatmullRom(
  pts: { x: number; y: number }[],
  step: number,
): { x: number; y: number }[] {
  if (pts.length < 2) return pts.slice();
  const out: { x: number; y: number }[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const segs = Math.max(1, Math.ceil(dist / step));
    for (let k = 0; k < segs; k++) {
      const t = k / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      // Centripetal-ish Catmull-Rom (uniform form)
      const x =
        0.5 *
        ((2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        ((2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x, y });
    }
  }
  out.push(pts[n - 1]!);
  return out;
}

function featherAlpha(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number): void {
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  dst.data.set(src.data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src.data[i + 3]! < 8) continue;
      // distance to transparent
      let minD = radius + 1;
      for (let dy = -radius; dy <= radius && minD > 0; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) {
            minD = Math.min(minD, Math.hypot(dx, dy));
            continue;
          }
          if (src.data[(yy * w + xx) * 4 + 3]! < 8) {
            minD = Math.min(minD, Math.hypot(dx, dy));
          }
        }
      }
      if (minD <= radius) {
        const f = minD / (radius + 0.01);
        dst.data[i + 3] = Math.floor(src.data[i + 3]! * Math.min(1, f));
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
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
