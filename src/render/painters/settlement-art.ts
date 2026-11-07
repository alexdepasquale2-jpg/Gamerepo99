/** Free, code-drawn 2x pixel art. Layout and palettes come from data, not town IDs. */
import type Phaser from 'phaser';
import art from '../../data/art/settlements.json';
import type { LayoutSettlement } from '../../sim/map/world-layout';
import { TILE_PX } from '../../sim/map/constants';
import { tileFootWorld } from '../depth-sort';
import type { PaintHost } from './overworld-paint';

type Kind = 'cottage' | 'hall' | 'shop' | 'tower' | 'garden' | 'well' | 'fence' | 'wall';
function ensureTexture(host: PaintHost, kind: Kind, variant: number): string {
  const key = `settlement-${kind}-${variant}`;
  if (host.textures.exists(`${key}-0`)) return key;
  const c = document.createElement('canvas'); c.width = 64; c.height = 72;
  const g = c.getContext('2d')!;
  const p = art.palettes[variant % art.palettes.length]!;
  const rect = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const tri = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w / 2, y); g.lineTo(x + w, y + h); g.fill();
  };
  if (kind === 'garden') {
    rect(8, 46, 48, 23, '#735039');
    for (let y = 49; y < 68; y += 7) for (let x = 11; x < 55; x += 8) {
      rect(x, y + 3, 5, 2, '#382d22'); rect(x + 1, y, 2, 5, '#547b3a'); rect(x - 1, y + 1, 6, 2, '#7fa54f');
      if ((x + y) % 3 === 0) rect(x + 2, y, 2, 2, '#d59a53');
    }
  } else if (kind === 'fence' || kind === 'wall') {
    if (kind === 'fence') {
      rect(0, 56, 64, 3, '#c4a06c'); rect(0, 64, 64, 3, '#8d6944');
      for (let x = 3; x < 64; x += 14) { rect(x, 51, 4, 21, '#62462e'); rect(x, 51, 3, 18, '#d2ad76'); }
    } else {
      rect(0, 43, 64, 29, '#92958c');
      for (let x = 0; x < 64; x += 12) rect(x, 38, 7, 7, '#b5b6a3');
      for (let y = 48; y < 72; y += 7) { rect(0, y, 64, 1, '#606960'); for (let x = (y % 2) * 8; x < 64; x += 16) rect(x, y - 6, 1, 6, '#6e756a'); }
    }
  } else if (kind === 'well') {
    rect(20, 57, 24, 13, '#777f79'); rect(21, 57, 22, 4, '#c6c3a5'); rect(24, 59, 16, 4, '#283e42');
    rect(17, 39, 3, 28, '#725137'); rect(44, 39, 3, 28, '#725137');
    tri(12, 30, 40, 14, p.roof); rect(12, 43, 40, 3, '#5d3e31'); rect(31, 43, 1, 16, '#c7a878');
  } else if (kind === 'tower') {
    rect(18, 14, 28, 56, '#7a827e'); rect(20, 14, 22, 56, '#b1b2a0');
    rect(16, 9, 32, 8, '#737d76');
    for (let x = 16; x < 48; x += 8) rect(x, 3, 5, 9, '#b9b8a0');
    for (let y = 24; y < 68; y += 10) { rect(20, y, 22, 1, '#858d7f'); rect(30, y - 5, 4, 7, '#3b4647'); }
    rect(45, 12, 1, 19, '#694e34'); rect(46, 13, 9, 6, p.roof);
  } else {
    const wide = kind === 'hall', left = wide ? 6 : 12, width = wide ? 52 : 40;
    rect(left - 2, 66, width + 4, 6, '#615845');
    rect(left, 37, width, 30, p.wall); rect(left + width - 7, 38, 7, 29, p.shadow);
    rect(left, 38, 3, 28, '#76563e'); rect(left, 54, width, 2, '#a17a52');
    tri(left - 5, wide ? 9 : 18, width + 10, wide ? 30 : 21, p.roof);
    for (let y = wide ? 18 : 24; y < 39; y += 5) { const inset = (39 - y) * (wide ? 0.95 : 1.15); rect(left - 3 + inset, y, width + 6 - inset * 2, 2, p.roofLight); }
    rect(left - 5, 38, width + 10, 3, '#654936');
    rect(left + 8, 13, 6, 15, '#998f77'); rect(left + 7, 12, 8, 3, '#c3b49a');
    rect(28, 51, 10, 17, '#654936'); rect(30, 53, 6, 14, '#8d6240'); rect(35, 59, 1, 2, '#ecc76e');
    for (const x of [left + 5, left + width - 14]) {
      rect(x - 1, 46, 10, 11, '#69523a'); rect(x, 47, 8, 8, '#e7c17e'); rect(x + 3, 47, 1, 8, '#8c7656'); rect(x, 51, 8, 1, '#8c7656');
      rect(x - 2, 58, 12, 3, '#685139'); rect(x, 57, 2, 2, '#b97871'); rect(x + 5, 56, 3, 3, '#82a05c');
    }
    if (kind === 'shop') {
      for (let x = 10; x < 54; x += 6) rect(x, 44, 6, 7, x % 12 ? '#d6b582' : p.roofLight);
      rect(10, 51, 44, 2, '#6d4931'); rect(47, 54, 8, 9, '#805838'); rect(48, 55, 6, 3, '#edc881');
    }
    if (wide) { rect(28, 23, 9, 12, p.wall); rect(30, 25, 5, 7, '#55727a'); rect(32, 25, 1, 7, '#c8c3a1'); }
  }
  const original = g.getImageData(0, 0, 64, 72);
  for (let level = 0; level <= 4; level++) {
    const out = document.createElement('canvas'); out.width = 64; out.height = 72;
    const ctx = out.getContext('2d')!, image = new ImageData(new Uint8ClampedArray(original.data), 64, 72);
    const sat = 1 - level * 0.2;
    for (let i = 0; i < image.data.length; i += 4) {
      const gray = image.data[i]! * 0.3 + image.data[i + 1]! * 0.59 + image.data[i + 2]! * 0.11;
      for (let k = 0; k < 3; k++) image.data[i + k] = gray + (image.data[i + k]! - gray) * sat;
    }
    ctx.putImageData(image, 0, 0); host.textures.addCanvas(`${key}-${level}`, out);
  }
  return key;
}

export function paintSettlement(host: PaintHost, town: LayoutSettlement & { name?: string }, container: Phaser.GameObjects.Container | null): void {
  let h = 0; for (const c of town.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const foot = tileFootWorld(town.q, town.r);
  const put = (type: Kind, q: number, r: number, v = 0): Phaser.GameObjects.Image => {
    const base = ensureTexture(host, type, (h + v) % 3);
    const img = host.add.image(foot.x + q * TILE_PX, foot.y + r * TILE_PX, `${base}-0`).setOrigin(0.5, 1).setScale(2).setDepth(foot.y + r * TILE_PX);
    img.setData({ settlementTown: town.id, settlementPalette: base }); container?.add(img); return img;
  };
  const kind = town.kind ?? 'village';
  art.layouts[kind].forEach((b, i) => put(b.type as Kind, b.q, b.r, i));
  for (const q of [-5, 5]) { put('garden', q, 1.1); put('fence', q, 1.6); }
  put('well', -1.7, 1.6);
  if (kind === 'city') for (const q of [-6, -2, 2, 6]) put('wall', q, -6);
  const x = foot.x - TILE_PX * 7, y = foot.y + TILE_PX * 3;
  const post = host.add.rectangle(x, y - 13, 5, 30, 0x725035).setDepth(y); container?.add(post);
  const label = host.add.text(x, y - 25, town.name ?? town.id.replace(/_/g, ' '), {
    fontFamily: 'monospace', fontSize: '11px', color: '#f6dfb3', backgroundColor: '#684c32', padding: { x: 6, y: 4 },
  }).setOrigin(0.5, 1).setDepth(y + 1); container?.add(label);
}
