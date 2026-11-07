/** Placeholder pixel sprites generated in code (16px source, drawn at artScale). */

import Phaser from 'phaser';

type Painter = (g: Phaser.GameObjects.Graphics) => void;
const P: Record<string, [number, number, Painter]> = {
  tree: [16, 24, (g) => {
    g.fillStyle(0x5a3a24).fillRect(7, 15, 3, 9);
    g.fillStyle(0x2f5a2a).fillCircle(8, 9, 7);
    g.fillStyle(0x3f7a34).fillCircle(6, 7, 4).fillCircle(11, 9, 3);
    g.fillStyle(0x5a9a44).fillRect(5, 4, 2, 2);
  }],
  tree_stump: [16, 24, (g) => {
    g.fillStyle(0x5a3a24).fillRect(5, 19, 6, 5);
    g.fillStyle(0xa8743e).fillRect(5, 19, 6, 1);
  }],
  rock: [16, 12, (g) => {
    g.fillStyle(0x6e6e68).fillEllipse(8, 8, 15, 8);
    g.fillStyle(0x9a9a92).fillEllipse(7, 6, 10, 5);
  }],
  ore_vein: [16, 12, (g) => {
    g.fillStyle(0x5e4e44).fillEllipse(8, 8, 15, 8);
    g.fillStyle(0xc88a4a).fillRect(4, 6, 2, 2).fillRect(9, 5, 2, 2).fillRect(11, 8, 1, 1);
  }],
  berry_bush: [16, 12, (g) => {
    g.fillStyle(0x2f6a34).fillEllipse(8, 7, 15, 10);
    g.fillStyle(0xb8324a).fillRect(4, 5, 2, 2).fillRect(9, 4, 2, 2).fillRect(11, 8, 2, 2).fillRect(6, 8, 2, 2);
  }],
  herb_patch: [16, 10, (g) => {
    g.fillStyle(0x6aa84f);
    for (let i = 0; i < 5; i++) g.fillRect(2 + i * 3, 3 + (i % 2) * 2, 1, 6);
    g.fillStyle(0xe8e0a0).fillRect(3, 2, 2, 1).fillRect(9, 2, 2, 1);
  }],
  fishing_spot: [16, 10, (g) => {
    g.fillStyle(0x3a6a9a, 0.9).fillEllipse(8, 5, 16, 8);
    g.fillStyle(0xbfe0f0).fillRect(4, 4, 3, 1).fillRect(10, 6, 2, 1);
  }],
  depleted: [16, 10, (g) => {
    g.fillStyle(0x6a5a40, 0.7).fillEllipse(8, 6, 12, 5);
  }],
  stall: [24, 20, (g) => {
    g.fillStyle(0x6a4a2a).fillRect(2, 8, 2, 12).fillRect(20, 8, 2, 12).fillRect(1, 13, 22, 4);
    g.fillStyle(0xc8423a).fillRect(0, 4, 24, 4);
    g.fillStyle(0xf4e6c8).fillRect(3, 4, 3, 4).fillRect(12, 4, 3, 4).fillRect(21, 4, 3, 4);
  }],
  goods: [20, 4, (g) => {
    g.fillStyle(0xd9a45b).fillRect(0, 0, 5, 4);
    g.fillStyle(0xb8324a).fillRect(6, 0, 4, 4);
    g.fillStyle(0x8a5a32).fillRect(11, 0, 4, 4);
    g.fillStyle(0x6aa84f).fillRect(16, 0, 4, 4);
  }],
  crate: [8, 7, (g) => {
    g.fillStyle(0x8a5a32).fillRect(0, 0, 8, 7);
    g.fillStyle(0xc99358).fillRect(1, 1, 6, 2).fillRect(1, 4, 6, 2);
    g.fillStyle(0x4a2e18).fillRect(0, 3, 8, 1).fillRect(3, 0, 1, 7);
  }],
  wagon: [24, 16, (g) => {
    g.fillStyle(0xe8dcc0).fillEllipse(12, 6, 18, 10);
    g.fillStyle(0x7a5232).fillRect(3, 8, 18, 4);
    g.fillStyle(0x2a1a10).fillCircle(6, 13, 3).fillCircle(18, 13, 3);
  }],
  ox: [14, 10, (g) => {
    g.fillStyle(0x8a6a4a).fillEllipse(7, 5, 12, 7);
    g.fillStyle(0x6a4a2a).fillRect(11, 2, 3, 4);
    g.fillStyle(0x2a1a10).fillRect(3, 8, 1, 2).fillRect(10, 8, 1, 2);
  }],
  rabbit: [8, 7, (g) => {
    g.fillStyle(0xc8b898).fillEllipse(4, 5, 7, 4);
    g.fillStyle(0xc8b898).fillRect(5, 0, 1, 3).fillRect(6, 0, 1, 3);
  }],
  bird: [6, 4, (g) => {
    g.fillStyle(0x3a3028).fillRect(0, 1, 2, 1).fillRect(4, 1, 2, 1).fillRect(2, 2, 2, 1);
  }],
  butterfly: [5, 4, (g) => {
    g.fillStyle(0xf2d24b).fillRect(0, 0, 2, 2).fillRect(3, 0, 2, 2).fillRect(1, 2, 3, 1);
  }],
  flower: [6, 5, (g) => {
    g.fillStyle(0x4a8a3a).fillRect(2, 2, 1, 3);
    g.fillStyle(0xe890b0).fillRect(1, 0, 3, 2);
  }],
  grass: [8, 5, (g) => {
    g.fillStyle(0x4f8a3a).fillRect(1, 1, 1, 4).fillRect(3, 0, 1, 5).fillRect(5, 2, 1, 3);
  }],
};

export const texKey = (id: string): string => `hf-px-${id}`;

export function ensureGoodsTextures(scene: Phaser.Scene): void {
  for (const [id, [w, h, paint]] of Object.entries(P)) {
    const key = texKey(id);
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    paint(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}
