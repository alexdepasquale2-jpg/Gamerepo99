/** Small DOM helpers for the panels area, plus the screen layer that follows the Phaser canvas. */
import type { GameContext } from '../app/contracts';
import { prettyTown } from '../sim/letter-replies';
import { ensurePanelStyles } from './style';

type Attrs = Record<string, string | number | boolean | undefined>;

/** `el('button', 'hf-slot', 'Text', { type: 'button' })`. Classes should carry the `hf-` prefix. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string, attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    e.setAttribute(k, v === true ? '' : String(v));
  }
  return e;
}

export function button(label: string, onClick: () => void, opts: { cls?: string; id?: string; title?: string; disabled?: boolean; pressed?: boolean } = {}): HTMLButtonElement {
  const b = el('button', `hf-btn${opts.cls ? ` ${opts.cls}` : ''}`, label, { type: 'button', title: opts.title, 'data-id': opts.id });
  if (opts.disabled) b.disabled = true;
  if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
  b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) onClick(); });
  return b;
}

/** Keys typed into a field must not walk the player or fire hotkeys (Phaser listens on window). */
const shielded = new WeakSet<HTMLElement>();
export function shieldTyping(root: HTMLElement): void {
  if (shielded.has(root)) return;
  shielded.add(root);
  const stop = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) e.stopPropagation();
  };
  root.addEventListener('keydown', stop);
  root.addEventListener('keyup', stop);
}

export const isTyping = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/** Town display names from the generated world (falls back to a prettified id). */
export function townNamer(ctx: GameContext): (townId: string) => string {
  const names = new Map((ctx.session.getWorld()?.settlements ?? []).map((s) => [s.id, s.name]));
  return (id) => names.get(id) ?? prettyTown(id);
}

export const personName = (ctx: GameContext, id: string | undefined): string => {
  const st = ctx.session.getState();
  if (!id) return 'someone';
  if (st && id === st.player.id) return 'you';
  return st?.people[id]?.name ?? id;
};

export type Layer = { el: HTMLElement; sync(): void; destroy(): void };

/**
 * A fixed, click-through layer laid exactly over the game canvas. Hotbar and minimap live here; children
 * opt back into pointer events. Re-synced on resize and from the panels tick.
 */
export function createLayer(ctx: GameContext): Layer {
  ensurePanelStyles();
  const root = el('div', 'hf-panels-layer', undefined, { 'data-area': 'panels' });
  document.body.append(root);
  let last = '';
  const sync = (): void => {
    const canvas = ctx.scene.game?.canvas;
    if (!canvas) return;
    // The visible part of the canvas (it can overhang the window while the scale manager catches up).
    const c = canvas.getBoundingClientRect();
    const left = Math.max(0, c.left), top = Math.max(0, c.top);
    const r = { left, top, width: Math.max(0, Math.min(window.innerWidth, c.right) - left), height: Math.max(0, Math.min(window.innerHeight, c.bottom) - top) };
    const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
    if (key === last) return;
    last = key;
    Object.assign(root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    // Hotbar slots and the minimap scale with the canvas so 9 slots always fit (phone to desktop).
    const slot = Math.round(Math.max(26, Math.min(42, r.width / 11.5)));
    root.style.setProperty('--hf-slot', `${slot}px`);
    root.style.setProperty('--hf-icon-scale', String(Math.max(0.6, Math.min(1.25, (slot - 12) / 24)).toFixed(2)));
    root.style.setProperty('--hf-mini-w', `${Math.round(Math.max(96, Math.min(180, r.width * 0.2)))}px`);
  };
  window.addEventListener('resize', sync);
  sync();
  return { el: root, sync, destroy: () => { window.removeEventListener('resize', sync); root.remove(); } };
}

/** Client px → world px through the main camera (for drags over the world). */
export function clientToWorld(ctx: GameContext, cx: number, cy: number): { x: number; y: number } {
  const canvas = ctx.scene.game?.canvas;
  const cam = ctx.scene.cameras?.main;
  if (!canvas || !cam) return { x: cx, y: cy };
  const r = canvas.getBoundingClientRect();
  const gx = ((cx - r.left) / Math.max(1, r.width)) * ctx.scene.scale.width;
  const gy = ((cy - r.top) / Math.max(1, r.height)) * ctx.scene.scale.height;
  const p = cam.getWorldPoint(gx, gy);
  return { x: p.x, y: p.y };
}
