/**
 * L4 ground detail for the chunk painter (sim/map/ladder/refine.ts refineDetail gives the sub-cells):
 * per-class variant tints, edge colours where one ground meets another, and small props painted straight
 * into the chunk's pixels (tufts, flowers, pebbles, stubble, ferns, twigs, mushrooms, stones, heather,
 * reeds at the shore, lily pads). A prop never leaves its own 4x4 sub-cell, so chunks join without seams.
 */
import type { Detail } from '../sim/map/ladder/refine';

export type Rgb = [number, number, number];
export const MEADOW = 0, FIELDS = 1, FOREST = 2, HILLS = 3, WATER = 4;

/** Added to the base colour per class and variant (0 worn/dry, 1 plain, 2 lush/deep). */
export const VARIANT_TINT: Rgb[][] = [
  [[12, 8, -6], [0, 0, 0], [-8, 7, -3]],
  [[10, 6, -4], [0, 0, 0], [-10, -2, -6]],
  [[-6, -6, -3], [0, 0, 0], [6, 9, 3]],
  [[-8, -8, -6], [0, 0, 0], [7, 5, 1]],
  [[-6, -7, -4], [0, 0, 0], [5, 8, 8]],
];
export const EDGE = {
  forest: [0x2c, 0x48, 0x28] as Rgb,
  hillRim: [0xb0, 0xac, 0x8e] as Rgb,
  hillShade: [0x6c, 0x68, 0x50] as Rgb,
  verge: [0x84, 0x8e, 0x48] as Rgb,
};

const C = {
  tuft: [0x8e, 0xb8, 0x58] as Rgb, tuftD: [0x4e, 0x78, 0x34] as Rgb,
  petals: [[0xf0, 0xd8, 0x78], [0xf4, 0xf0, 0xe0], [0xe8, 0xa0, 0xc0], [0x9c, 0xb8, 0xe8]] as Rgb[],
  stem: [0x4a, 0x7a, 0x32] as Rgb,
  pebble: [0x9a, 0x95, 0x8c] as Rgb, pebbleL: [0xc0, 0xbb, 0xb0] as Rgb, pebbleD: [0x5e, 0x5a, 0x52] as Rgb,
  straw: [0xd8, 0xc8, 0x78] as Rgb, clod: [0x6e, 0x58, 0x36] as Rgb, poppy: [0xc8, 0x3a, 0x30] as Rgb,
  fern: [0x2a, 0x5e, 0x2c] as Rgb, fernL: [0x4a, 0x84, 0x3c] as Rgb, twig: [0x6a, 0x4a, 0x2a] as Rgb,
  capR: [0xb8, 0x32, 0x2a] as Rgb, capW: [0xf0, 0xe6, 0xd0] as Rgb, litter: [0x6e, 0x5a, 0x30] as Rgb,
  heather: [0x8e, 0x6a, 0x94] as Rgb, gravel: [0x7a, 0x76, 0x66] as Rgb,
  reed: [0x5d, 0x7e, 0x2c] as Rgb, reedTip: [0x8a, 0x62, 0x34] as Rgb, sand: [0xc4, 0xb0, 0x7c] as Rgb,
  pad: [0x4a, 0x8a, 0x44] as Rgb, padL: [0x6a, 0xaa, 0x58] as Rgb, bloom: [0xf0, 0xb8, 0xd0] as Rgb,
};

/**
 * Paint small props for every sub-cell inside the chunk (ring excluded). `d` is the chunk's RGBA pixels,
 * `side` its width in px, `cell` px per sub-cell.
 */
export function paintDetailProps(d: Uint8ClampedArray, side: number, cell: number, det: Detail): void {
  const { size, cls, roll } = det;
  const put = (x: number, y: number, c: Rgb) => {
    if (x < 0 || y < 0 || x >= side || y >= side) return;
    const i = (y * side + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  };
  for (let sy = 1; sy < size - 1; sy++) for (let sx = 1; sx < size - 1; sx++) {
    const k = sy * size + sx, c = cls[k]!, r = roll[k]!;
    const n = cls[k - size]!, s = cls[k + size]!, w = cls[k - 1]!, e = cls[k + 1]!;
    const x = (sx - 1) * cell + (r & 1), y = (sy - 1) * cell + ((r >> 1) & 1);
    if (c === WATER) {
      // Lily pads only well inside open water.
      if (r < 3 && n === WATER && s === WATER && w === WATER && e === WATER && cls[k - size - 1] === WATER && cls[k + size + 1] === WATER) {
        put(x, y + 1, C.pad); put(x + 1, y + 1, C.padL); put(x + 2, y + 1, C.pad); put(x + 1, y + 2, C.pad); put(x + 1, y, C.pad);
        if (r === 0) put(x + 1, y + 1, C.bloom);
      }
      continue;
    }
    if (n === WATER || s === WATER || w === WATER || e === WATER) {
      if (r < 70) {
        // A reed sprig 3-4 px tall standing on the sub-cell's bottom row, brown head on top.
        const top = (sy - 1) * cell + (r & 4 ? 0 : 1), foot = (sy - 1) * cell + cell - 1;
        for (let py = top + 1; py <= foot; py++) put(x + 1, py, C.reed);
        put(x + 1, top, C.reedTip);
        if (r & 8) put(x + 2, foot, C.reed);
      }
      else if (r < 90) { put(x + 1, y + 1, C.sand); put(x + 2, y + 2, C.pebble); }
      continue;
    }
    if (n !== c || s !== c || w !== c || e !== c) continue; // edges carry their own colour
    switch (c) {
      case MEADOW:
        if (r < 12) { put(x, y + 2, C.tuftD); put(x + 1, y + 1, C.tuft); put(x + 2, y + 2, C.tuftD); put(x + 1, y + 2, C.tuftD); }
        else if (r < 17) { put(x + 1, y + 2, C.stem); put(x + 1, y + 1, C.petals[r & 3]!); if (r & 4) { put(x + 2, y + 1, C.stem); put(x + 2, y, C.petals[(r + 1) & 3]!); } }
        else if (r < 20) { put(x + 1, y + 1, C.pebble); put(x + 2, y + 1, C.pebbleD); put(x + 1, y, C.pebbleL); }
        break;
      case FIELDS:
        if (r < 22) { put(x, y + 1, C.straw); put(x + 2, y + 2, C.straw); }
        else if (r < 28) { put(x + 1, y + 1, C.clod); put(x + 2, y + 1, C.clod); }
        else if (r < 30) { put(x + 1, y + 1, C.poppy); put(x + 1, y + 2, C.stem); }
        break;
      case FOREST:
        if (r < 10) { put(x + 1, y, C.fernL); put(x, y + 1, C.fern); put(x + 1, y + 1, C.fernL); put(x + 2, y + 1, C.fern); put(x + 1, y + 2, C.fern); }
        else if (r < 15) { put(x, y + 2, C.twig); put(x + 1, y + 1, C.twig); put(x + 2, y, C.twig); }
        else if (r < 17) { put(x + 1, y + 2, C.capW); put(x, y + 1, C.capR); put(x + 1, y + 1, C.capR); put(x + 2, y + 1, C.capR); if (r & 1) put(x + 1, y + 1, C.capW); }
        else if (r < 26) { put(x + (r & 2 ? 2 : 0), y + 1, C.litter); put(x + 1, y + 2, C.litter); }
        break;
      case HILLS:
        if (r < 9) { put(x, y + 1, C.pebble); put(x + 1, y + 1, C.pebble); put(x + 2, y + 1, C.pebbleD); put(x, y, C.pebbleL); put(x + 1, y, C.pebbleL); put(x, y + 2, C.pebbleD); put(x + 1, y + 2, C.pebbleD); }
        else if (r < 15) { put(x, y, C.gravel); put(x + 2, y + 1, C.gravel); put(x + 1, y + 2, C.gravel); }
        else if (r < 19) { put(x + 1, y + 1, C.heather); put(x, y + 2, C.tuftD); put(x + 2, y + 2, C.tuftD); }
        break;
    }
  }
}
