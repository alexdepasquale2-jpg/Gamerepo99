import { describe, expect, it } from 'vitest';
import { fitRect, GAME_H, GAME_W, layerVars, sheetBox, textSizes } from '../../../src/ui/kit/layer';
import { dayPhaseLabel } from '../../../src/ui/kit/hud';
import { SIZES } from '../../../src/ui/kit/tokens';

const view = (width: number, height: number) => ({ width, height });
const canvasIn = (w: number, h: number) => fitRect(w, h);

describe('fitRect (Phaser.Scale.FIT + CENTER_BOTH)', () => {
  it('1280x720 is an exact 2x', () => {
    expect(fitRect(1280, 720)).toEqual({ left: 0, top: 0, width: 1280, height: 720, scale: 2 });
  });
  it('a wide window letterboxes left and right', () => {
    const r = fitRect(2000, 720);
    expect(r.scale).toBe(2);
    expect(r.left).toBe(360);
    expect(r.top).toBe(0);
  });
  it('a phone in portrait gets bands above and below', () => {
    const r = fitRect(375, 812);
    expect(r.width).toBe(375);
    expect(r.height).toBeCloseTo(210.94, 1);
    expect(r.top).toBeCloseTo((812 - r.height) / 2, 5);
    expect(r.width / r.height).toBeCloseTo(GAME_W / GAME_H, 5);
  });
  it('a zero window scales to zero, never negative', () => {
    expect(fitRect(0, 0).scale).toBe(0);
  });
});

describe('sheetBox', () => {
  it('desktop: a right-edge side sheet, at most 40% of the canvas, clear of the hotbar', () => {
    const c = canvasIn(1280, 720);
    const b = sheetBox(view(1280, 720), c);
    expect(b.dock).toBe('side');
    expect(b.width).toBeLessThanOrEqual(c.width * SIZES.sheetMaxShare);
    expect(b.left + b.width).toBeLessThanOrEqual(c.width);
    expect(b.left).toBeGreaterThan(c.width / 2);
    expect(b.top + b.height).toBeLessThanOrEqual(c.height - SIZES.hotbarReserve * 2 + 0.001);
  });
  it('phone landscape: still a side sheet inside the canvas', () => {
    const c = canvasIn(812, 375);
    const b = sheetBox(view(812, 375), c);
    expect(b.dock).toBe('side');
    expect(b.width / c.width).toBeLessThanOrEqual(0.4);
  });
  it('phone portrait: docks under the canvas and covers none of the world', () => {
    const c = canvasIn(375, 812);
    const b = sheetBox(view(375, 812), c);
    expect(b.dock).toBe('below');
    expect(b.top).toBeGreaterThanOrEqual(c.height); // layer-relative: starts under the canvas
    expect(c.top + b.top + b.height).toBeLessThanOrEqual(812);
    expect(b.width).toBeLessThanOrEqual(375);
  });
});

describe('layer variables and text sizes', () => {
  it('publishes the scale and the sheet box', () => {
    const v = layerVars(view(1280, 720), canvasIn(1280, 720));
    expect(v['--hf-u']).toBe('2');
    expect(v['--hf-sheet-width']).toBe(`${Math.floor(1280 * 0.4)}px`);
  });
  it('text never drops under the readability floors', () => {
    const t = textSizes(0.5);
    expect(t.body).toBeGreaterThanOrEqual(SIZES.minBodyPx);
    expect(t.label).toBeGreaterThanOrEqual(SIZES.minLabelPx);
    expect(textSizes(2).body).toBe(18);
    expect(textSizes(10).body).toBe(20);
  });
});

describe('dayPhaseLabel', () => {
  it('follows the sky: dawn, day, dusk, night, and wraps', () => {
    expect(dayPhaseLabel(0)).toBe('dawn');
    expect(dayPhaseLabel(0.3)).toBe('day');
    expect(dayPhaseLabel(0.62)).toBe('dusk');
    expect(dayPhaseLabel(0.8)).toBe('night');
    expect(dayPhaseLabel(0.98)).toBe('dawn');
    expect(dayPhaseLabel(1.3)).toBe('day');
  });
});
