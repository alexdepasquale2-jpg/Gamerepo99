/**
 * The on-screen d-pad, which is also a floating joystick: a press anywhere in the left zone re-centres the
 * pad under the thumb, and dragging gives 8-way direction with analog magnitude (past a dead zone). It
 * tracks one pointer by id, so the other thumb can press A at the same time.
 */
import { deadZone, type Stick } from './move-source';

export type DPad = {
  el: HTMLElement;
  /** The current vector, 8-way snapped, magnitude 0..1. */
  vector(): Stick;
  release(): void;
  destroy(): void;
};

const DEAD = 0.2;
const OCT = Math.PI / 4;

export function createDPad(onChange: (v: Stick) => void): DPad {
  const zone = document.createElement('div');
  zone.className = 'hf-pad__zone';
  const base = document.createElement('div');
  base.className = 'hf-pad__dpad';
  base.setAttribute('aria-hidden', 'true');
  for (const d of ['up', 'right', 'down', 'left']) {
    const arm = document.createElement('i');
    arm.className = `hf-pad__arm hf-pad__arm--${d}`;
    base.appendChild(arm);
  }
  const knob = document.createElement('b');
  knob.className = 'hf-pad__knob';
  base.appendChild(knob);
  zone.appendChild(base);

  let id: number | null = null;
  let cx = 0, cy = 0;
  let v: Stick = { x: 0, y: 0 };

  const radius = (): number => base.offsetWidth / 2 || 56;
  const paint = (): void => {
    const r = radius();
    knob.style.transform = `translate(${v.x * r * 0.6}px, ${v.y * r * 0.6}px)`;
    const lit = (x: number, y: number): boolean => x * v.x + y * v.y > 0.35;
    base.querySelector<HTMLElement>('.hf-pad__arm--up')!.classList.toggle('is-on', lit(0, -1));
    base.querySelector<HTMLElement>('.hf-pad__arm--down')!.classList.toggle('is-on', lit(0, 1));
    base.querySelector<HTMLElement>('.hf-pad__arm--left')!.classList.toggle('is-on', lit(-1, 0));
    base.querySelector<HTMLElement>('.hf-pad__arm--right')!.classList.toggle('is-on', lit(1, 0));
  };
  const set = (next: Stick): void => {
    if (next.x === v.x && next.y === v.y) return;
    v = next;
    paint();
    onChange(v);
  };

  const read = (e: PointerEvent): void => {
    const r = radius();
    const dz = deadZone((e.clientX - cx) / r, (e.clientY - cy) / r, DEAD);
    const m = Math.hypot(dz.x, dz.y);
    if (!m) return set({ x: 0, y: 0 });
    // Snap to 8 ways so the pad feels like a d-pad; keep the magnitude so a light push walks slowly.
    const a = Math.round(Math.atan2(dz.y, dz.x) / OCT) * OCT;
    set({ x: Math.round(Math.cos(a) * m * 1000) / 1000, y: Math.round(Math.sin(a) * m * 1000) / 1000 });
  };

  const home = (): void => {
    base.style.left = '';
    base.style.top = '';
    base.classList.remove('is-live');
  };
  const end = (e?: PointerEvent): void => {
    if (e && e.pointerId !== id) return;
    id = null;
    home();
    set({ x: 0, y: 0 });
  };

  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    e.preventDefault();
    id = e.pointerId;
    zone.setPointerCapture?.(e.pointerId);
    // Float: centre the pad under the thumb (kept inside the zone).
    const zr = zone.getBoundingClientRect();
    const r = radius();
    cx = Math.max(zr.left + r, Math.min(zr.right - r, e.clientX));
    cy = Math.max(zr.top + r, Math.min(zr.bottom - r, e.clientY));
    base.style.left = `${cx - zr.left - r}px`;
    base.style.top = `${cy - zr.top - r}px`;
    base.classList.add('is-live');
    read(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) read(e); });
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
  zone.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    el: zone,
    vector: () => v,
    release: () => end(),
    destroy: () => zone.remove(),
  };
}
