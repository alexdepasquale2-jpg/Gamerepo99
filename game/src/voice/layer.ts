/**
 * The voice layer: one DOM element laid exactly over the Phaser canvas, so bubbles are crisp text that
 * line up with canvas pixels at any window size. World px → layer CSS px through the main camera.
 */
import type Phaser from 'phaser';
import type { Pt } from '../app/contracts';
import { injectVoiceStyle } from './style';

export type VoiceLayer = {
  el: HTMLElement;
  /** Re-measure the canvas (once per frame is fine; only writes when it moved). */
  sync(): void;
  /** CSS px per canvas px. */
  u(): number;
  /** Layer size in CSS px. */
  size(): { w: number; h: number };
  /** A world point in layer CSS px. */
  project(p: Pt): Pt;
  destroy(): void;
};

export function createVoiceLayer(scene: Phaser.Scene): VoiceLayer {
  injectVoiceStyle();
  document.getElementById('hf-voice-layer')?.remove();
  const el = document.createElement('div');
  el.id = 'hf-voice-layer';
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let u = 1;

  const sync = (): void => {
    const canvas = scene.game?.canvas;
    if (!canvas?.isConnected) return;
    const r = canvas.getBoundingClientRect();
    if (r.left === rect.left && r.top === rect.top && r.width === rect.width && r.height === rect.height) return;
    rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    u = r.width / (scene.scale?.width || 640) || 1;
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    el.style.setProperty('--hfv-u', String(Math.round(u * 1000) / 1000));
  };
  sync();

  return {
    el,
    sync,
    u: () => u,
    size: () => ({ w: rect.width, h: rect.height }),
    project(p) {
      const cam = scene.cameras?.main;
      if (!cam) return { x: -9999, y: -9999 };
      const v = cam.worldView;
      return { x: (cam.x + (p.x - v.x) * cam.zoom) * u, y: (cam.y + (p.y - v.y) * cam.zoom) * u };
    },
    destroy: () => el.remove(),
  };
}
