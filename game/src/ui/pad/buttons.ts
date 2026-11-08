/**
 * The on-screen face, system and shoulder buttons. Each is a pointer-event button with press / release
 * (so A can be held for hold-to-work, Select long-pressed), a short haptic tick, and never takes focus
 * (game keys and sheet focus stay where they are). Layout follows a standard controller: A bottom, B right,
 * X left, Y top, so the glyphs match a real pad.
 */
import type { PadButton } from './bindings';

export type PadButtons = {
  el: HTMLElement;
  btn(b: PadButton): HTMLButtonElement | undefined;
  setLabel(b: PadButton, label: string): void;
  setBadge(b: PadButton, n: number): void;
  destroy(): void;
};

type Def = { b: PadButton; id: string; glyph: string; label: string; cls: string };

const DEFS: readonly Def[] = [
  { b: 'y', id: 'talk', glyph: 'Y', label: 'Talk', cls: 'hf-pad__face hf-pad__face--y' },
  { b: 'x', id: 'satchel', glyph: 'X', label: 'Satchel', cls: 'hf-pad__face hf-pad__face--x' },
  { b: 'b', id: 'back', glyph: 'B', label: 'Back', cls: 'hf-pad__face hf-pad__face--b' },
  { b: 'a', id: 'act', glyph: 'A', label: 'Act', cls: 'hf-pad__face hf-pad__face--a' },
  { b: 'select', id: 'map', glyph: '⧉', label: 'Map', cls: 'hf-pad__sys hf-pad__sys--select' },
  { b: 'start', id: 'menu', glyph: '☰', label: 'Menu', cls: 'hf-pad__sys hf-pad__sys--start' },
  { b: 'l', id: 'prev', glyph: 'L', label: 'Prev', cls: 'hf-pad__sh hf-pad__sh--l' },
  { b: 'r', id: 'next', glyph: 'R', label: 'Next', cls: 'hf-pad__sh hf-pad__sh--r' },
];

const buzz = (): void => {
  try { navigator.vibrate?.(8); } catch { /* not allowed here (iframe, no user gesture): silent */ }
};

export function createButtons(down: (b: PadButton) => void, up: (b: PadButton) => void): PadButtons {
  const el = document.createElement('div');
  el.className = 'hf-pad__buttons';
  const map = new Map<PadButton, HTMLButtonElement>();

  for (const d of DEFS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `hf-pad__btn ${d.cls}`;
    b.dataset.id = d.id;
    b.dataset.btn = d.b;
    b.tabIndex = -1;
    b.setAttribute('aria-label', d.label);
    const g = document.createElement('b');
    g.textContent = d.glyph;
    const t = document.createElement('span');
    t.textContent = d.label;
    b.append(g, t);
    // One pointer per button; others (the stick thumb) are independent.
    let held: number | null = null;
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== held) return;
      held = null;
      b.classList.remove('is-down');
      up(d.b);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (held !== null) return;
      held = e.pointerId;
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('is-down');
      buzz();
      down(d.b);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    // Keep focus on the page (and on a sheet's focused control).
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => e.stopPropagation());
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    map.set(d.b, b);
    el.appendChild(b);
  }

  return {
    el,
    btn: (b) => map.get(b),
    setLabel(b, label) {
      const btn = map.get(b);
      if (!btn) return;
      (btn.querySelector('span') as HTMLElement).textContent = label;
      btn.setAttribute('aria-label', label);
    },
    setBadge(b, n) {
      const btn = map.get(b);
      if (!btn) return;
      let badge = btn.querySelector<HTMLElement>('.hf-pad__badge');
      if (!badge) {
        badge = document.createElement('i');
        badge.className = 'hf-pad__badge';
        btn.appendChild(badge);
      }
      badge.hidden = n <= 0;
      badge.textContent = String(n);
    },
    destroy: () => el.remove(),
  };
}
