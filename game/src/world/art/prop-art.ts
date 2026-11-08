/**
 * Wilderness dressing as code-drawn 1x pixel textures (shown at 2x): the props a chunk carries
 * (sim/map/ladder dress + scatter, and the stamp source's road props). One texture per prop type;
 * `propTex(type, state)` picks the key. Shadows are baked in so each prop is one image.
 */
import type Phaser from 'phaser';
import { makeTex, type Px } from './px';

const K = (id: string): string => `w-prop-${id}`;
const WOOD = '#6b4423', WOOD_L = '#8b5a2b', WOOD_D = '#4a2e18';

const PROPS: Record<string, [number, number, (p: Px) => void]> = {
  bush: [14, 10, (p) => {
    p.shadow(7, 6, 2).disc(7.5, 6, 6.5, 4, '#3a4216').disc(7, 5, 6, 3.8, '#688028').disc(5.5, 3.5, 3, 2, '#a8b848');
  }],
  rock: [12, 8, (p) => {
    p.shadow(6, 5, 2).disc(6.5, 5, 5.5, 3, '#5a554c').disc(6, 4.5, 5, 2.8, '#7a756c').disc(4.5, 3.5, 2.2, 1.4, '#9a958c');
  }],
  boulder: [18, 13, (p) => {
    p.shadow(9, 8, 2).disc(9, 7.5, 8, 5, '#5f5f66').disc(8.5, 6.5, 7, 4.5, '#6a6a72').disc(7, 4.5, 4.5, 2.5, '#8e8e96');
  }],
  log: [14, 6, (p) => {
    p.shadow(7, 6, 1.5).rect(1, 1, 12, 4, WOOD).rect(1, 1, 12, 1, WOOD_L).disc(12.5, 3, 1.5, 2, '#a8743e').px(12, 3, WOOD_D);
  }],
  stump: [10, 7, (p) => {
    p.shadow(5, 4, 1.5).rect(2, 2, 6, 4, '#5a3a1a').disc(5, 2, 3, 1.4, '#7a5a3a').px(5, 2, '#a8743e');
  }],
  sign: [10, 14, (p) => {
    p.shadow(5, 3, 1).rect(4, 4, 2, 10, WOOD).rect(0, 1, 10, 5, '#c4a574').rect(0, 1, 10, 1, '#d8bc8c').rect(2, 3, 6, 1, '#8a6a44');
  }],
  hay: [12, 9, (p) => {
    p.shadow(6, 5, 1.5).disc(6, 5, 5.5, 3.5, '#b89a38').disc(6, 4.5, 5, 3, '#d4b84a').rect(2, 3, 8, 1, '#e8d070');
  }],
  flowers: [14, 7, (p) => {
    for (const [x, y, c] of [[1, 3, '#f0d878'], [4, 1, '#e8a0c0'], [6, 4, '#f0d878'], [9, 2, '#e8a0c0'], [11, 5, '#f0d878'], [3, 5, '#e8a0c0'], [8, 0, '#f4f0e0']] as const) {
      p.rect(x, y + 1, 1, 2, '#4a7a32').rect(x, y, 2, 1, c);
    }
  }],
  reeds: [12, 12, (p) => {
    for (let i = 0; i < 5; i++) { const h = 7 + (i % 2) * 3; p.rect(1 + i * 2, 12 - h, 1, h, i % 2 ? '#7a8a3a' : '#5d6e2c'); if (i % 2) p.rect(1 + i * 2, 12 - h, 1, 2, '#8a6a3a'); }
  }],
  fence_h: [18, 9, (p) => {
    p.rect(0, 2, 2, 7, WOOD).rect(16, 2, 2, 7, WOOD).rect(0, 3, 18, 1, WOOD_L).rect(0, 6, 18, 1, WOOD_L).rect(0, 2, 2, 1, '#9a6a3a').rect(16, 2, 2, 1, '#9a6a3a');
  }],
  fence_v: [4, 22, (p) => {
    p.rect(1, 0, 2, 22, WOOD_L).rect(0, 14, 4, 8, WOOD).rect(0, 0, 4, 6, WOOD).rect(0, 14, 4, 1, '#9a6a3a');
  }],
  build_site: [24, 21, (p) => {
    p.shadow(12, 11, 2).rect(1, 17, 22, 3, '#8a8478').rect(1, 17, 22, 1, '#a8a294');
    p.rect(2, 2, 2, 16, '#9a6a3a').rect(20, 2, 2, 16, '#9a6a3a').rect(2, 2, 20, 2, '#9a6a3a').rect(2, 2, 20, 1, '#b8885a');
    for (let i = 0; i < 12; i++) p.px(5 + i, 16 - i, '#7a5230');
  }],
  campfire: [12, 6, (p) => {
    p.disc(6, 3.5, 5.5, 2.5, '#5a5550').disc(6, 3, 4, 1.6, '#2a2018').rect(2, 2, 8, 1, '#6a4a2a').rect(4, 4, 5, 1, '#5a3a24');
  }],
  flame: [6, 9, (p) => {
    p.disc(3, 5.5, 2.6, 3.5, '#f2a03a').disc(3, 6.5, 1.5, 2.2, '#ffe08a').px(3, 1, '#f2a03a');
  }],
  tent: [18, 14, (p) => {
    p.shadow(9, 8, 1.5);
    for (let i = 0; i < 12; i++) { const w = 2 + Math.round(i * 1.3); p.rect(9 - w / 2, 1 + i, w, 1, i % 4 === 0 ? '#c8aa7a' : '#b89a6a'); }
    for (let i = 0; i < 6; i++) p.rect(9 - (1 + i * 0.6), 7 + i, 2 + i * 1.2, 1, '#5a4630');
  }],
  ruin_wall: [16, 14, (p) => {
    p.rect(1, 4, 14, 10, '#8a8478').rect(1, 4, 14, 2, '#a8a294').rect(1, 9, 14, 1, '#6e6a60').rect(5, 6, 1, 3, '#6e6a60').rect(10, 10, 1, 4, '#6e6a60');
    p.rect(11, 2, 4, 3, '#8a8478').rect(11, 2, 4, 1, '#a8a294');
  }],
  shrine: [12, 18, (p) => {
    p.shadow(6, 5, 1.5).rect(1, 13, 10, 4, '#77736a').rect(3, 3, 6, 11, '#9c978a').rect(3, 3, 6, 1, '#b8b2a4').disc(6, 7, 1.5, 1.5, '#f2d27a');
  }],
  cart: [22, 14, (p) => {
    p.shadow(11, 10, 1.5).rect(2, 3, 16, 3, '#c9a35a').rect(1, 6, 18, 5, WOOD_L).rect(1, 6, 18, 1, '#a87a48').rect(18, 8, 4, 1, WOOD);
    p.disc(5, 11, 3, 3, '#4a3420').disc(5, 11, 1, 1, '#8a6a44').disc(15, 11, 3, 3, '#4a3420').disc(15, 11, 1, 1, '#8a6a44');
  }],
  farmstead: [26, 24, (p) => {
    p.shadow(13, 12, 2).rect(3, 11, 20, 12, '#b08a5a').rect(18, 11, 5, 12, '#8e6c44').rect(3, 21, 20, 2, '#6a5034');
    p.roof(1, 3, 24, 9, '#8a4a32', '#a85a3a').rect(1, 11, 24, 1, '#5a3a24');
    p.rect(10, 15, 5, 8, '#4a3424').rect(5, 14, 3, 3, '#e7c17e').rect(19, 14, 3, 3, '#e7c17e').rect(17, 2, 3, 5, '#7a6a5a');
  }],
  field: [16, 9, (p) => {
    p.rect(0, 4, 16, 5, '#7a5a34');
    for (let x = 1; x < 16; x += 3) { p.rect(x, 1, 1, 6, '#9a8a3a').px(x, 0, '#e0c860').px(x + 1, 2, '#d4b84a'); }
  }],
  mine: [22, 18, (p) => {
    p.shadow(11, 10, 2);
    for (let i = 0; i < 16; i++) { const w = 4 + i; p.rect(11 - w / 2, 1 + i, w, 1, i < 4 ? '#8a8a92' : '#6a6a72'); }
    p.rect(8, 9, 7, 8, '#1b1612').rect(7, 8, 9, 1, WOOD).rect(7, 8, 1, 9, WOOD).rect(15, 8, 1, 9, WOOD);
  }],
  camp: [22, 16, (p) => {
    p.shadow(11, 10, 2);
    for (let i = 0; i < 12; i++) p.rect(10 - i * 0.7, 3 + i, 2 + i * 0.7, 1, '#8b5a2b');
    p.rect(11, 3, 1, 12, '#5a3a24');
    for (let i = 0; i < 3; i++) p.disc(15 + i * 2.5, 13, 1.4, 1.4, '#7a5232').px(15 + i * 2.5, 13, '#d9b07a');
  }],
  waystation: [22, 20, (p) => {
    p.shadow(11, 10, 2).rect(3, 9, 16, 10, '#c4a574').rect(15, 9, 4, 10, '#a68a5c').roof(1, 2, 20, 8, '#8a3a2a', '#a84a3a');
    p.rect(9, 13, 4, 6, '#3a2a1c').rect(5, 12, 2, 2, '#f2d28a').rect(16, 12, 2, 2, '#f2d28a');
  }],
  // Woodland trees: a round oak, a tall pine, a dark bushy elm.
  'tree-0': [26, 34, (p) => {
    p.shadow(13, 10, 2.5).rect(11, 22, 4, 11, '#5a3a24').rect(11, 22, 1, 11, '#7a5232').rect(9, 31, 8, 2, '#4a2e18');
    p.disc(13, 13, 12, 10, '#2f5a2a').disc(11, 11, 9, 7.5, '#3f7434').disc(9, 8, 5, 4, '#56903f').disc(18, 15, 4, 3, '#3f7434');
    p.rect(7, 6, 2, 2, '#76b050').rect(15, 9, 2, 1, '#76b050').rect(5, 14, 2, 1, '#264a24').rect(19, 18, 3, 1, '#264a24');
  }],
  'tree-1': [20, 38, (p) => {
    p.shadow(10, 8, 2).rect(9, 29, 3, 8, '#5a3a24').rect(9, 29, 1, 8, '#7a5232');
    for (let tier = 0; tier < 4; tier++) {
      const top = 2 + tier * 7;
      for (let i = 0; i < 10; i++) { const w = 3 + i * (1.1 + tier * 0.25); p.rect(10 - w / 2, top + i, w, 1, i < 3 ? '#3e7a4a' : '#2a5a3a'); }
      p.rect(10 - (3 + 9 * (1.1 + tier * 0.25)) / 2, top + 9, (3 + 9 * (1.1 + tier * 0.25)) / 2, 1, '#1f4630');
    }
  }],
  'tree-2': [24, 30, (p) => {
    p.shadow(12, 9, 2).rect(10, 20, 4, 9, '#4a3020').rect(8, 27, 8, 2, '#3a2418');
    p.disc(12, 12, 11, 9, '#244a2a').disc(8, 10, 6, 5, '#2f5e32').disc(16, 9, 6, 5, '#2f5e32').disc(12, 6, 5, 4, '#3f7440');
    p.rect(9, 4, 2, 1, '#5a9a54').rect(15, 6, 2, 1, '#5a9a54');
  }],
  'critter-rabbit': [8, 7, (p) => {
    p.shadow(4, 3, 1).disc(3.5, 4.5, 3, 2, '#b0a28a').disc(6, 3, 1.6, 1.4, '#b0a28a').rect(5, 0, 1, 2, '#a08f76').rect(7, 0, 1, 2, '#a08f76').px(1, 4, '#f4efe4');
  }],
  'critter-fox': [12, 7, (p) => {
    p.shadow(6, 5, 1).disc(2.5, 3.5, 2.5, 1.4, '#c0602a').px(0, 3, '#f0e6d0').disc(6, 3.5, 3.5, 1.8, '#c8662c').disc(9.5, 2.5, 1.8, 1.5, '#c8662c').px(10, 0, '#8a3e1a').px(11, 3, '#f0e6d0');
    p.rect(4, 5, 1, 2, '#3a2418').rect(8, 5, 1, 2, '#3a2418');
  }],
  'critter-deer': [14, 14, (p) => {
    p.shadow(7, 6, 1).rect(3, 9, 1, 5, '#6b4a2e').rect(5, 9, 1, 5, '#6b4a2e').rect(9, 9, 1, 5, '#6b4a2e').rect(11, 9, 1, 5, '#6b4a2e');
    p.disc(7, 7.5, 5.5, 2.5, '#9a6a3a').rect(10, 3, 2, 4, '#9a6a3a').disc(12, 2.5, 2, 1.5, '#9a6a3a').px(11, 0, '#5a3d22').px(13, 0, '#5a3d22').px(2, 6, '#f0e6d0');
  }],
  'critter-bird': [6, 4, (p) => {
    p.rect(0, 1, 2, 1, '#3e3328').rect(4, 1, 2, 1, '#3e3328').rect(2, 2, 2, 1, '#5a4a3a').px(3, 2, '#e0a030');
  }],
};

/** Texture key for a chunk prop (null when the type is drawn another way, like trees). */
export function propTex(type: string, state?: string): string | null {
  if (type === 'critter') return K(`critter-${state && PROPS[`critter-${state}`] ? state : 'rabbit'}`);
  if (type === 'tree') return K(`tree-${(Number(state) || 0) % 3}`);
  return PROPS[type] ? K(type) : null;
}
export const FLAME_TEX = K('flame');

export function paintPropTextures(scene: Phaser.Scene): void {
  for (const [id, [w, h, draw]] of Object.entries(PROPS)) makeTex(scene, K(id), w, h, draw);
}
