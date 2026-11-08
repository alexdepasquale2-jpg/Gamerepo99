/**
 * One chunk's ground as a single canvas at half resolution (1 canvas px = 2 world px, the 2x art scale):
 * biome colour per pixel with chunky dithered borders, shore foam and banks, then roads as soft dirt
 * ribbons, worked tracks, plank bridges, fords and ferry pontoons laid over it. Pure canvas; no Phaser.
 */
import { CHUNK_SIZE, TILE_PX } from '../sim/map/constants';
import type { ChunkTiles } from '../sim/map/types';

const S = CHUNK_SIZE;
const CPX = TILE_PX / 2; // canvas px per tile
const SIZE = S * CPX;
const G = S + 2; // grid with a one-tile border

// Ground classes painted per pixel. Overlays (roads, tracks, decks, fords, ferries) go on top.
const MEADOW = 0, FIELDS = 1, FOREST = 2, HILLS = 3, WATER = 4;
type Rgb = [number, number, number];
const PAL: Rgb[][] = [
  [[0x6e, 0x9a, 0x48], [0x79, 0xa6, 0x50], [0x62, 0x8b, 0x40]],
  [[0x9c, 0x99, 0x56], [0xa8, 0xa4, 0x61], [0x8b, 0x88, 0x4a]],
  [[0x3f, 0x63, 0x35], [0x47, 0x6e, 0x3a], [0x35, 0x56, 0x2e]],
  [[0x8a, 0x86, 0x62], [0x98, 0x94, 0x70], [0x7a, 0x76, 0x56]],
  [[0x3f, 0x7a, 0x92], [0x4a, 0x86, 0x9f], [0x37, 0x6c, 0x83]],
];
const FOAM: Rgb = [0x9c, 0xcc, 0xcc];
const BANK: Rgb = [0x8a, 0x7a, 0x4e];
const RIPPLE: Rgb = [0x6a, 0xa4, 0xb8];

/** Overlay kinds per tile. */
export type Overlay = 'road' | 'bridge' | 'deck' | 'ford' | 'ferry' | 'track' | null;

/** Base class and overlay of a drawn ground id (generated biome, dressing, or a player edit). */
export function classify(id: string | undefined): { base: number; over: Overlay } {
  switch (id) {
    case 'fields': return { base: FIELDS, over: null };
    case 'forest': return { base: FOREST, over: null };
    case 'hills': return { base: HILLS, over: null };
    case 'water': case 'stream': return { base: WATER, over: null };
    case 'road': return { base: MEADOW, over: 'road' };
    case 'road_bridge': return { base: WATER, over: 'bridge' };
    case 'bridge_deck': return { base: WATER, over: 'deck' };
    case 'ford': return { base: WATER, over: 'ford' };
    case 'ferry': return { base: WATER, over: 'ferry' };
    default: return id?.startsWith('road') ? { base: MEADOW, over: 'track' } : { base: MEADOW, over: null };
  }
}

const hash = (x: number, y: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Paint a chunk. `around(q, r)` gives the drawn ground id of tiles just outside the chunk (one ring), so
 * borders and road ribbons carry across chunk edges. `under(q, r)` is the land beneath a road or track
 * (its verge takes the colour of the fields or hills it crosses).
 */
export function paintGround(chunk: ChunkTiles, around: (q: number, r: number) => string, under: (q: number, r: number) => string): HTMLCanvasElement {
  const q0 = chunk.cx * S, r0 = chunk.cy * S;
  const base = new Uint8Array(G * G);
  const over: Overlay[] = new Array(G * G).fill(null);
  const ids = new Map(chunk.tiles.map((t) => [`${t.q},${t.r}`, t.biomeId]));
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const q = q0 + gx - 1, r = r0 + gy - 1;
    const inside = gx > 0 && gy > 0 && gx <= S && gy <= S;
    const c = classify(inside ? (ids.get(`${q},${r}`) ?? 'meadow') : around(q, r));
    if (c.over === 'road' || c.over === 'track') {
      const land = classify(under(q, r)).base;
      c.base = land === WATER ? MEADOW : land;
    }
    base[gy * G + gx] = c.base;
    over[gy * G + gx] = c.over;
  }

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  const cls = new Uint8Array(SIZE * SIZE);
  const ox = q0 * CPX, oy = r0 * CPX;
  // Pass 1: class per pixel, sampled through a chunky 4px jitter so borders dither instead of stepping.
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const hb = hash((ox + px) >> 2, (oy + py) >> 2);
    const jx = (hb & 7) - 3, jy = ((hb >> 3) & 7) - 3;
    const tx = Math.floor((px + jx) / CPX) + 1, ty = Math.floor((py + jy) / CPX) + 1;
    cls[py * SIZE + px] = base[Math.max(0, Math.min(G - 1, ty)) * G + Math.max(0, Math.min(G - 1, tx))]!;
  }
  // Pass 2: colour, texture, shore foam and banks.
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const i = py * SIZE + px, c = cls[i]!;
    const h = hash(ox + px, oy + py);
    const v = (h >>> 6) & 15;
    let rgb = PAL[c]![v < 1 ? 2 : v < 2 ? 1 : 0]!;
    const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && cls[y * SIZE + x] === WATER;
    if (c === WATER) {
      if (!wet(px - 1, py) || !wet(px + 1, py) || !wet(px, py - 1) || !wet(px, py + 1)) {
        const edgeX = px === 0 || px === SIZE - 1, edgeY = py === 0 || py === SIZE - 1;
        if (!edgeX && !edgeY) rgb = FOAM;
      } else if ((hash((ox + px) >> 2, oy + py) & 511) === 0) rgb = RIPPLE;
    } else {
      if (wet(px, py + 1) || wet(px, py - 1) || wet(px + 1, py) || wet(px - 1, py)) rgb = BANK;
      else if (c === MEADOW && ((h >>> 12) & 31) === 0) rgb = PAL[FOREST]![0]!;
      else if (c === FIELDS && ((oy + py) & 3) === 0) rgb = PAL[FIELDS]![2]!;
      else if (c === FOREST && ((h >>> 12) & 7) === 0) rgb = [0x2c, 0x48, 0x28];
      else if (c === HILLS && ((h >>> 12) & 15) === 0) rgb = [0xa8, 0xa4, 0x86];
    }
    d[i * 4] = rgb[0];
    d[i * 4 + 1] = rgb[1];
    d[i * 4 + 2] = rgb[2];
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  paintOverlays(ctx, over);
  return canvas;
}

/** Roads, tracks, bridges, fords and ferries over the base ground (grid includes the border ring). */
function paintOverlays(ctx: CanvasRenderingContext2D, over: Overlay[]): void {
  const at = (gx: number, gy: number): Overlay => (gx < 0 || gy < 0 || gx >= G || gy >= G ? null : over[gy * G + gx]!);
  const cx = (gx: number) => (gx - 1 + 0.5) * CPX, cy = (gy: number) => (gy - 1 + 0.5) * CPX;
  const ribbon = (is: (o: Overlay) => boolean, layers: [number, string][]) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of layers) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        if (!is(at(gx, gy))) continue;
        let joined = false;
        // The first four directions draw (each pair once); the rest only say the tile is joined.
        const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1]] as const;
        for (let k = 0; k < dirs.length; k++) {
          const [dx, dy] = dirs[k]!;
          if (!is(at(gx + dx, gy + dy))) continue;
          joined = true;
          if (k >= 4) continue;
          ctx.moveTo(cx(gx), cy(gy));
          ctx.lineTo(cx(gx + dx), cy(gy + dy));
        }
        if (!joined) { ctx.moveTo(cx(gx) + 0.1, cy(gy)); ctx.lineTo(cx(gx), cy(gy)); }
      }
      ctx.stroke();
    }
  };
  const roadish = (o: Overlay) => o === 'road' || o === 'bridge';
  ribbon(roadish, [[13, 'rgba(96,76,46,0.35)'], [10, '#8c6e40'], [6, '#9a7a48']]);
  ribbon((o) => o === 'track', [[7, 'rgba(96,76,46,0.3)'], [5, '#a88a5a']]);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const o = at(gx, gy);
    const x = (gx - 1) * CPX, y = (gy - 1) * CPX;
    if (o === 'bridge' || o === 'deck') {
      ctx.fillStyle = '#473122';
      ctx.fillRect(x, y, CPX, CPX);
      for (let row = 0; row < 4; row++) { ctx.fillStyle = row % 2 ? '#a57548' : '#b88954'; ctx.fillRect(x, y + row * 4 + 0.5, CPX, 3); }
      const deck = (ax: number, ay: number) => { const n = at(ax, ay); return n === 'bridge' || n === 'deck'; };
      ctx.fillStyle = '#65442b';
      if (!deck(gx - 1, gy)) ctx.fillRect(x, y, 1, CPX);
      if (!deck(gx + 1, gy)) ctx.fillRect(x + CPX - 1, y, 1, CPX);
    } else if (o === 'ford') {
      ctx.fillStyle = '#78b9ae';
      ctx.fillRect(x, y, CPX, CPX);
      const h = hash(gx * 7 + x, gy * 13 + y);
      // Sandy bed showing through the shallows, then stepping stones.
      ctx.fillStyle = '#a8bf98';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + ((h >>> (k * 4 + 1)) % (CPX - 3)), y + ((h >>> (k * 4 + 2)) % (CPX - 2)), 3, 2);
      for (let k = 0; k < 2; k++) {
        const sx = x + 2 + ((h >>> (k * 5)) % (CPX - 6)), sy = y + 2 + ((h >>> (k * 5 + 3)) % (CPX - 6));
        ctx.fillStyle = '#50625c';
        ctx.fillRect(sx, sy + 1, 4, 2);
        ctx.fillStyle = k % 2 ? '#b1ae9c' : '#9a9a8c';
        ctx.fillRect(sx, sy, 4, 2);
      }
    } else if (o === 'ferry') {
      ctx.fillStyle = '#9b7448';
      ctx.fillRect(x, y, CPX, CPX);
      ctx.fillStyle = '#7c5a36';
      for (let k = 1; k < 4; k++) ctx.fillRect(x, y + k * 4, CPX, 1);
      ctx.fillStyle = '#d9c9a0';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x + CPX - 2, y + CPX - 1, 2, 1);
    }
  }
}

export const GROUND_CANVAS_PX = SIZE;
