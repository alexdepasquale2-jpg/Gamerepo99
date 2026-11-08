/**
 * The DOM UI layer: one element sized and positioned exactly over the 640x360 Phaser.Scale.FIT
 * canvas, so DOM chips and sheets line up with canvas pixels at any window size. It publishes the
 * scale as CSS variables (`--hf-u` = CSS px per canvas px) plus the side-sheet box. Event-driven:
 * window resize and a ResizeObserver on the canvas; nothing polls.
 */
import { PAD_RESERVE_BOTTOM_PX, SIZES, Z } from './tokens';

// The game's logical size. Landscape screens play at 640x360; a portrait phone plays a taller, narrower
// world (360 wide) so the view fills the screen behind the on-screen pad instead of letterboxing.
// Live bindings: importers always read the current size (app/shell sets it at boot and on rotation).
export let GAME_W = 640;
export let GAME_H = 360;
export function setGameSize(w: number, h: number): void { GAME_W = w; GAME_H = h; }
/** The logical size for a viewport: 640x360 when landscape, 360 x (taller) when portrait. */
export function pickGameSize(viewW: number, viewH: number): { w: number; h: number } {
  if (viewW >= viewH * 0.9) return { w: 640, h: 360 };
  return { w: 360, h: Math.round(Math.min(800, Math.max(480, (360 * viewH) / Math.max(1, viewW)))) };
}

export type Rect = { left: number; top: number; width: number; height: number };
export type SheetDock = 'side' | 'below';
export type SheetBox = Rect & { dock: SheetDock };

/** Phaser.Scale.FIT + CENTER_BOTH: the canvas rect inside a viewport, and its scale. */
export function fitRect(viewW: number, viewH: number, gameW = GAME_W, gameH = GAME_H): Rect & { scale: number } {
  const scale = Math.max(0, Math.min(viewW / gameW, viewH / gameH));
  const width = gameW * scale;
  const height = gameH * scale;
  return { left: (viewW - width) / 2, top: (viewH - height) / 2, width, height, scale };
}

/**
 * Where a side sheet goes, in CSS px relative to the layer's top-left.
 * - side: right edge of the canvas, at most `SIZES.sheetMaxShare` of its width (and never wider than
 *   `SIZES.sheetMaxCss`, so a wide desktop keeps the world), above the hotbar. Phone landscape gets a
 *   compact sheet of at least `SIZES.sheetMinCss` where the canvas allows.
 * - below: a tall phone in portrait has empty bands under the canvas; the sheet docks there, full
 *   width, and covers none of the world.
 */
export function sheetBox(view: { width: number; height: number }, canvas: Rect, share: number = SIZES.sheetMaxShare, reserveBelow = 0): SheetBox {
  const u = canvas.width / GAME_W || 1;
  const gutterCss = 8;
  const below = view.height - (canvas.top + canvas.height) - reserveBelow;
  if (below >= Math.max(220, view.height * 0.28)) {
    return {
      dock: 'below',
      left: -canvas.left + gutterCss,
      top: canvas.height + gutterCss,
      width: Math.max(0, view.width - gutterCss * 2),
      height: Math.max(0, below - gutterCss * 2),
    };
  }
  // A portrait game (taller than wide) has no band to dock in: the sheet rises over the lower part of the
  // world as a bottom sheet, above the pad's reserve.
  if (canvas.height > canvas.width * 1.15) {
    const top = Math.round(canvas.height * 0.26);
    return { dock: 'below', left: gutterCss, top, width: Math.max(0, canvas.width - gutterCss * 2), height: Math.max(0, canvas.height - top - reserveBelow - gutterCss - Math.max(SIZES.hotbarReserve * u, 74)) };
  }
  const gutter = SIZES.gutter * u;
  const floor = Math.min(SIZES.sheetMinCss, canvas.width * 0.6);
  const width = Math.floor(Math.max(floor, Math.min(SIZES.sheetMaxCss, canvas.width * share)));
  return {
    dock: 'side',
    left: canvas.width - gutter - width,
    top: gutter,
    width,
    height: Math.max(0, canvas.height - gutter - SIZES.hotbarReserve * u),
  };
}

/** Text sizes in CSS px for a scale: logical sizes times u, floored at the readability minimums. */
export function textSizes(u: number): { body: number; label: number; heading: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)));
  return {
    body: clamp(u * SIZES.body, SIZES.minBodyPx, 20),
    label: clamp(u * SIZES.label, SIZES.minLabelPx, 17),
    heading: clamp(u * SIZES.heading, 14, 24),
  };
}

/** The layer's CSS variables for a canvas rect inside a viewport. */
export function layerVars(view: { width: number; height: number }, canvas: Rect, reserveBelow = 0): Record<string, string> {
  const u = canvas.width / GAME_W || 1;
  const box = sheetBox(view, canvas, SIZES.sheetMaxShare, reserveBelow);
  const t = textSizes(u);
  return {
    '--hf-u': String(Math.round(u * 1000) / 1000),
    '--hf-fs-body': `${t.body}px`,
    '--hf-fs-label': `${t.label}px`,
    '--hf-fs-heading': `${t.heading}px`,
    '--hf-sheet-left': `${box.left}px`,
    '--hf-sheet-top': `${box.top}px`,
    '--hf-sheet-width': `${box.width}px`,
    '--hf-sheet-height': `${box.height}px`,
    /** Empty band under the canvas (tall phones): the touch bar docks at its bottom. */
    '--hf-below': `${Math.max(0, view.height - (canvas.top + canvas.height))}px`,
  };
}

export type UiLayer = {
  el: HTMLElement;
  /** Follow this canvas (exact rect); without one the layer uses the FIT maths on the window. */
  track: (canvas: HTMLCanvasElement | null) => void;
  /** Re-measure now. */
  sync: () => void;
  rect: () => Rect;
  dock: () => SheetDock;
  /** Logical canvas px → CSS px (viewport). */
  toCss: (x: number, y: number) => { x: number; y: number };
  /** CSS px kept free at the bottom of the window (the touch bar on a tall phone); sheets docked below stop above it. */
  setBottomReserve: (px: number) => void;
  /** Hear every re-measure (resize, canvas change). Returns unsubscribe. */
  onSync: (fn: () => void) => () => void;
};

let layer: UiLayer | undefined;

/** The one UI layer (mounted on first use). Browser only. */
export function uiLayer(): UiLayer {
  if (layer && layer.el.isConnected) return layer;
  const el = document.createElement('div');
  el.id = 'hf-ui-layer';
  el.style.cssText = `position:fixed;pointer-events:none;z-index:${Z.layer};left:0;top:0;width:0;height:0`;
  document.body.appendChild(el);
  let canvas: HTMLCanvasElement | null = null;
  let ro: ResizeObserver | undefined;
  let current: Rect = { left: 0, top: 0, width: 0, height: 0 };
  let dock: SheetDock = 'side';
  let reserve = 0;
  // The on-screen pad (body[data-pad=on]) owns the bottom of the window: a sheet docked below stops
  // above it. Its CSS variable is the source of truth, so the pad can tune it without touching this file.
  const padReserve = (): number => {
    if (document.body?.dataset.pad !== 'on') return 0;
    const v = parseFloat(getComputedStyle(document.body).getPropertyValue('--hf-pad-reserve-bottom'));
    return Number.isFinite(v) ? v : PAD_RESERVE_BOTTOM_PX;
  };
  const subs = new Set<() => void>();

  const measure = (): Rect => {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (canvas?.isConnected) {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    const host = document.getElementById('game')?.getBoundingClientRect();
    const f = fitRect(host?.width || vw, host?.height || vh);
    return { left: f.left + (host?.left ?? 0), top: f.top + (host?.top ?? 0), width: f.width, height: f.height };
  };
  const sync = (): void => {
    current = measure();
    const view = { width: window.innerWidth, height: window.innerHeight };
    const below = Math.max(reserve, padReserve());
    Object.assign(el.style, { left: `${current.left}px`, top: `${current.top}px`, width: `${current.width}px`, height: `${current.height}px` });
    for (const [k, v] of Object.entries(layerVars(view, current, below))) el.style.setProperty(k, v);
    dock = sheetBox(view, current, SIZES.sheetMaxShare, below).dock;
    el.dataset.dock = dock;
    for (const fn of [...subs]) fn();
  };
  // Phaser resizes the canvas on its next step: sync now from the FIT maths, then again once it has.
  const onResize = (): void => {
    sync();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  };
  window.addEventListener('resize', onResize);
  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver(onResize).observe(document.body, { attributes: true, attributeFilter: ['data-pad'] });
  }
  layer = {
    el,
    track(c) {
      ro?.disconnect();
      canvas = c;
      if (c && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => sync());
        ro.observe(c);
      }
      sync();
    },
    sync,
    rect: () => ({ ...current }),
    dock: () => dock,
    toCss: (x, y) => ({ x: current.left + (x * current.width) / GAME_W, y: current.top + (y * current.height) / GAME_H }),
    setBottomReserve(px) {
      if (px === reserve) return;
      reserve = px;
      sync();
    },
    onSync(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
  sync();
  return layer;
}
