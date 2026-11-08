/**
 * Phaser side of the kit: the same panel look (surface, line, radius) for canvas-drawn panels such as
 * the world map and minimap frames, from the shared tokens. Type-only Phaser import.
 */
import type Phaser from 'phaser';
import { COLORS, phaserColor, SIZES } from './tokens';

export type PhaserPanelOpts = { alpha?: number; fill?: keyof typeof COLORS; line?: keyof typeof COLORS; lineWidth?: number; radius?: number };

/** Draw a kit panel into a Graphics (does not clear; call g.clear() first when redrawing). */
export function drawPhaserPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: PhaserPanelOpts = {}): Phaser.GameObjects.Graphics {
  const r = o.radius ?? SIZES.radius;
  g.fillStyle(phaserColor(o.fill ?? 'surface'), o.alpha ?? 0.92).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(o.lineWidth ?? 1, phaserColor(o.line ?? 'line'), 0.9).strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
  return g;
}

/** A screen-space panel Graphics at a depth. */
export function addPhaserPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth: number, o: PhaserPanelOpts = {}): Phaser.GameObjects.Graphics {
  return drawPhaserPanel(scene.add.graphics().setScrollFactor(0).setDepth(depth), x, y, w, h, o);
}
