/**
 * Settlement buildings as code-drawn 1x textures (64x72, shown at 2x): cottage, hall (inn), shop, tower,
 * garden, fence and town wall, one per settlements.json palette. Despair is not baked in: the light FX
 * shifts the town's palette per pixel. 3/4 depth: a darker side wall, eave shadow, contact shadow.
 */
import type Phaser from 'phaser';
import art from '../../data/art/settlements.json';
import { makeTex, type Px } from './px';

export type BuildingKind = 'cottage' | 'hall' | 'shop' | 'tower' | 'garden' | 'fence' | 'wall';
type Palette = { wall: string; shadow: string; roof: string; roofLight: string };
const W = 64, H = 72;

export const buildingTex = (kind: string, palette: number): string => `w-bld-${kind}-${palette % art.palettes.length}`;

function house(p: Px, kind: BuildingKind, c: Palette): void {
  const wide = kind === 'hall', left = wide ? 6 : 12, width = wide ? 52 : 40;
  p.disc(32, 69, width / 2 + 6, 3, '#000000', 0.25);
  p.rect(left - 2, 66, width + 4, 6, '#615845');
  p.rect(left, 37, width, 30, c.wall).rect(left + width - 7, 38, 7, 29, c.shadow);
  p.rect(left, 38, 3, 28, '#76563e').rect(left, 54, width, 2, '#a17a52');
  p.roof(left - 5, wide ? 9 : 18, width + 10, wide ? 30 : 21, c.roof, c.roofLight);
  p.rect(left - 5, 38, width + 10, 3, '#654936').rect(left - 3, 41, width + 6, 2, '#000000', 0.18);
  p.rect(left + 8, 13, 6, 15, '#998f77').rect(left + 7, 12, 8, 3, '#c3b49a');
  // Door (the building's door is its foot: bottom centre of the stamp).
  p.rect(27, 51, 10, 17, '#654936').rect(29, 53, 6, 14, '#8d6240').rect(34, 59, 1, 2, '#ecc76e');
  for (const x of [left + 5, left + width - 14]) {
    p.rect(x - 1, 46, 10, 11, '#69523a').rect(x, 47, 8, 8, '#e7c17e').rect(x + 3, 47, 1, 8, '#8c7656').rect(x, 51, 8, 1, '#8c7656');
    p.rect(x - 2, 58, 12, 3, '#685139').rect(x, 57, 2, 2, '#b97871').rect(x + 5, 56, 3, 3, '#82a05c');
  }
  if (kind === 'shop') {
    for (let x = 10; x < 54; x += 6) p.rect(x, 44, 6, 7, x % 12 ? '#d6b582' : c.roofLight);
    p.rect(10, 51, 44, 2, '#6d4931').rect(47, 54, 8, 9, '#805838').rect(48, 55, 6, 3, '#edc881');
  }
  if (wide) p.rect(28, 23, 9, 12, c.wall).rect(30, 25, 5, 7, '#55727a').rect(32, 25, 1, 7, '#c8c3a1');
}

function paint(p: Px, kind: BuildingKind, c: Palette): void {
  if (kind === 'garden') {
    p.rect(8, 46, 48, 23, '#735039');
    for (let y = 49; y < 68; y += 7) for (let x = 11; x < 55; x += 8) {
      p.rect(x, y + 3, 5, 2, '#382d22').rect(x + 1, y, 2, 5, '#547b3a').rect(x - 1, y + 1, 6, 2, '#7fa54f');
      if ((x + y) % 3 === 0) p.rect(x + 2, y, 2, 2, '#d59a53');
    }
  } else if (kind === 'fence') {
    p.rect(0, 56, 64, 3, '#c4a06c').rect(0, 64, 64, 3, '#8d6944');
    for (let x = 3; x < 64; x += 14) p.rect(x, 51, 4, 21, '#62462e').rect(x, 51, 3, 18, '#d2ad76');
  } else if (kind === 'wall') {
    p.rect(0, 43, 64, 29, '#92958c');
    for (let x = 0; x < 64; x += 12) p.rect(x, 38, 7, 7, '#b5b6a3');
    for (let y = 48; y < 72; y += 7) { p.rect(0, y, 64, 1, '#606960'); for (let x = (y % 2) * 8; x < 64; x += 16) p.rect(x, y - 6, 1, 6, '#6e756a'); }
  } else if (kind === 'tower') {
    p.disc(32, 69, 18, 3, '#000000', 0.25).rect(18, 14, 28, 56, '#7a827e').rect(20, 14, 22, 56, '#b1b2a0').rect(16, 9, 32, 8, '#737d76');
    for (let x = 16; x < 48; x += 8) p.rect(x, 3, 5, 9, '#b9b8a0');
    for (let y = 24; y < 68; y += 10) p.rect(20, y, 22, 1, '#858d7f').rect(30, y - 5, 4, 7, '#3b4647');
    p.rect(45, 12, 1, 19, '#694e34').rect(46, 13, 9, 6, c.roof);
  } else house(p, kind, c);
}

export function paintBuildingTextures(scene: Phaser.Scene): void {
  const kinds: BuildingKind[] = ['cottage', 'hall', 'shop', 'tower', 'garden', 'fence', 'wall'];
  art.palettes.forEach((c, i) => {
    for (const k of kinds) makeTex(scene, buildingTex(k, i), W, H, (p) => paint(p, k, c));
  });
}
