import type { GroundTile } from './types';

/** Sun-bleached La Mancha: whitewash, terracotta, blue trim. */
export const PALETTE = {
  sky: 0xf3e2b8,
  dust: 0xe6d3a1,
  dustDark: 0xd4bc84,
  scrub: 0xc6ae72,
  path: 0xc4622d,
  pathDark: 0x8e3d22,
  plaza: 0xf4efe4,
  trim: 0x3e6d8c,
  trimDark: 0x24485e,
  olive: 0x6e7a45,
  oliveDark: 0x3e4a28,
  stone: 0xb7a48a,
  stoneDark: 0x7a6a56,
  whitewash: 0xf7f3ea,
  soot: 0xd9d0c4,
  wood: 0x6b4423,
  shadow: 0x5a4632,
  ink: 0x2c2118,
  hat: 0x1e3a5f,
  fire: 0xe25a1c,
  wine: 0x7a2040,
  loaf: 0xd8a15a,
  player: 0x2a211c,
} as const;

export function groundColor(tile: GroundTile): number {
  switch (tile) {
    case 'dust':
      return PALETTE.dust;
    case 'scrub':
      return PALETTE.scrub;
    case 'path':
      return PALETTE.path;
    case 'plaza':
      return PALETTE.plaza;
    case 'trim':
      return PALETTE.trim;
    case 'olive':
      return PALETTE.olive;
    case 'stone':
      return PALETTE.stone;
    default: {
      const neverTile: never = tile;
      return neverTile;
    }
  }
}
