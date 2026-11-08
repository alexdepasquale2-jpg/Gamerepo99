/**
 * The interact area's own DOM layer: one element laid exactly over the Phaser canvas, so the world prompt
 * and the ring are crisp DOM text pinned to world points. Re-measured once a frame (cheap: one rect read),
 * styles injected once. Pointer events pass through to the canvas except on the ring's own chips, whose
 * presses never reach Phaser (they stop at the layer), so a chip tap is never also a walk.
 */
import type Phaser from 'phaser';
import type { Pt } from '../app/contracts';

/** PALETTE.md UI tokens and the ring colours (kind = teal, savage = rust, family = gold). */
const CSS = `
#ix-layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:40;font-family:Georgia,'Times New Roman',serif;--ix-fs:12px}
#ix-layer *{box-sizing:border-box}
.ix-prompt{position:absolute;width:max-content;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:1px;pointer-events:none;
  color:#F2B84B;font-size:var(--ix-fs);text-shadow:0 1px 0 #1B1612,0 0 3px #1B1612;white-space:nowrap;animation:ix-bob 1.2s ease-in-out infinite}
.ix-prompt b{font-weight:normal;color:#E8DCC8}
.ix-prompt i{font-style:normal;font-size:.8em;line-height:1}
@keyframes ix-bob{0%,100%{margin-top:0}50%{margin-top:-3px}}
.ix-ring{position:absolute;width:max-content;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.ix-head{pointer-events:auto;cursor:pointer;color:#F2D79A;font-size:var(--ix-fs);text-shadow:0 1px 0 #1B1612,0 0 3px #1B1612;padding:2px 6px;
  background:none;border:none;font-family:inherit}
.ix-grid{display:grid;gap:4px;justify-content:center}
.ix-chip{pointer-events:auto;cursor:pointer;position:relative;min-width:calc(var(--ix-fs)*6.5);min-height:calc(var(--ix-fs)*2.2);padding:2px 8px 2px 12px;
  background:rgba(28,22,18,.96);color:#CDEEE8;border:2px solid #84B8B0;border-radius:4px;font-family:inherit;font-size:var(--ix-fs);
  white-space:nowrap;touch-action:manipulation;user-select:none;-webkit-user-select:none;animation:ix-pop .14s ease-out both}
.ix-chip:hover,.ix-chip:focus-visible{background:#4A3A30;outline:none}
.ix-chip.savage{border-color:#C8664A;color:#F0B8A0}
.ix-chip.family{border-color:#E0B86A;color:#F2D79A}
.ix-chip.held{border-style:dashed}
.ix-chip sup{position:absolute;left:3px;top:1px;font-size:.62em;color:#8A7A68}
@keyframes ix-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
.ix-tip{position:absolute;width:max-content;transform:translate(-50%,0);pointer-events:none;background:#1B1612;color:#F4E6C8;border:1px solid #7A7060;
  font-size:calc(var(--ix-fs)*.9);padding:2px 6px;border-radius:3px;white-space:nowrap}
`;

export type Layer = {
  el: HTMLElement;
  /** Re-measure the canvas (call once a frame). */
  sync(): void;
  /** World px → CSS px inside the layer. */
  toLayer(p: Pt): Pt;
  /** Viewport CSS px (clientX/Y) → world px. */
  toWorld(client: Pt): Pt;
  /** Layer width/height in CSS px. */
  size(): { w: number; h: number };
  destroy(): void;
};

export function createLayer(scene: Phaser.Scene): Layer {
  if (!document.getElementById('ix-style')) {
    const s = document.createElement('style');
    s.id = 'ix-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  document.getElementById('ix-layer')?.remove();
  const el = document.createElement('div');
  el.id = 'ix-layer';
  document.body.appendChild(el);
  // Presses on chips stop here: Phaser's window listeners never see them (no walk, no ring close).
  const stop = (e: Event): void => e.stopPropagation();
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']) el.addEventListener(ev, stop);

  let rect = { left: 0, top: 0, width: 0, height: 0 };
  const canvasW = (): number => scene.scale.gameSize.width || 640;
  const u = (): number => (rect.width || canvasW()) / canvasW();
  const cam = () => scene.cameras.main;

  return {
    el,
    sync() {
      const c = scene.game.canvas;
      if (!c?.isConnected) return;
      const r = c.getBoundingClientRect();
      if (r.left === rect.left && r.top === rect.top && r.width === rect.width && r.height === rect.height) return;
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      el.style.setProperty('--ix-fs', `${Math.round(Math.max(12, Math.min(18, 10 * u())))}px`);
    },
    toLayer(p) {
      const k = cam();
      const s = u();
      return { x: ((p.x - k.worldView.x) * k.zoom + k.x) * s, y: ((p.y - k.worldView.y) * k.zoom + k.y) * s };
    },
    toWorld(client) {
      const k = cam();
      const s = u();
      return { x: ((client.x - rect.left) / s - k.x) / k.zoom + k.worldView.x, y: ((client.y - rect.top) / s - k.y) / k.zoom + k.worldView.y };
    },
    size: () => ({ w: rect.width, h: rect.height }),
    destroy: () => el.remove(),
  };
}
