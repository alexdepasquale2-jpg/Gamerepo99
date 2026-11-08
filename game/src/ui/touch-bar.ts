/**
 * The touch bar (README rule 3: a phone plays the whole game). Shown on coarse pointers or narrow
 * windows, along the bottom of the canvas on both sides of the hotbar (never over it):
 *   left:  Act (labelled with the focused thing), Brood (multi-body inhabitants only)
 *   right: Satchel, Map, Letters (with the unread badge), Menu
 * On a tall phone the canvas leaves a band underneath; the bar docks at the bottom of that band and
 * sheets docked below stop above it. Hidden while a centred menu or the modal is up.
 */
import { uiLayer } from './kit/layer';
import { overlays } from './kit/overlay-stack';
import { ensureKitStyle } from './kit/style';

export type TouchBar = {
  setAct: (label: string | null) => void;
  setBrood: (show: boolean) => void;
  setLetters: (unread: number) => void;
  /** Whether the bar is showing (the HUD hides its own ☰ then). */
  shown: () => boolean;
  onShownChange: (fn: (shown: boolean) => void) => void;
  destroy: () => void;
};

export type TouchIo = {
  act: () => void;
  brood: () => void;
  satchel: () => void;
  map: () => void;
  letters: () => void;
  menu: () => void;
};

/** CSS px the bar needs at the bottom of the window when it docks under the canvas. */
const BELOW_RESERVE = 60;
const NARROW_PX = 760;

const wantsTouch = (): boolean => {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse || window.innerWidth < NARROW_PX;
};

function button(cls: string, icon: string, label: string, onTap: () => void, key?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `hf-tb ${cls}`;
  const i = document.createElement('b');
  i.textContent = icon;
  const t = document.createElement('span');
  t.textContent = label;
  b.append(i, t);
  b.setAttribute('aria-label', label);
  if (key) b.title = `${label} · ${key}`;
  // Keep focus on the page so game keys keep working after a tap.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });
  return b;
}

export function createTouchBar(io: TouchIo): TouchBar {
  ensureKitStyle();
  const layer = uiLayer();
  const root = document.createElement('div');
  root.id = 'hf-touch';
  root.hidden = true;
  const left = document.createElement('div');
  left.className = 'hf-tgrp hf-tgrp--l';
  const right = document.createElement('div');
  right.className = 'hf-tgrp hf-tgrp--r';

  const act = button('hf-tb--act', '✋', 'Act', io.act, 'E');
  act.hidden = true;
  act.dataset.id = 'act';
  const brood = button('', '⁂', 'Brood', io.brood, 'B');
  brood.hidden = true;
  brood.dataset.id = 'brood';
  const satchel = button('', '◫', 'Satchel', io.satchel, 'I');
  satchel.dataset.id = 'satchel';
  const map = button('', '⌖', 'Map', io.map, 'M');
  map.dataset.id = 'map';
  const letters = button('', '✉', 'Letters', io.letters, 'L');
  letters.dataset.id = 'letters';
  const badge = document.createElement('i');
  badge.className = 'hf-badge';
  badge.hidden = true;
  letters.appendChild(badge);
  const menu = button('', '☰', 'Menu', io.menu, 'Esc');
  menu.dataset.id = 'menu';

  left.append(act, brood);
  right.append(satchel, map, letters, menu);
  root.append(left, right);
  layer.el.appendChild(root);

  let shown = false;
  let listener: ((s: boolean) => void) | null = null;
  const paint = (): void => {
    const want = wantsTouch();
    const covered = overlays.count('menu', 'modal') > 0;
    root.hidden = !want || covered;
    layer.setBottomReserve(want ? BELOW_RESERVE : 0);
    if (want !== shown) {
      shown = want;
      listener?.(shown);
    }
  };
  const offStack = overlays.subscribe(paint);
  const offSync = layer.onSync(paint);
  const mq = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  mq?.addEventListener?.('change', paint);
  paint();

  return {
    setAct(label) {
      act.hidden = !label;
      const text = label ?? 'Act';
      (act.querySelector('span') as HTMLElement).textContent = text;
      act.setAttribute('aria-label', label ? `Act on ${label}` : 'Act');
    },
    setBrood(show) {
      brood.hidden = !show;
    },
    setLetters(n) {
      badge.hidden = n <= 0;
      badge.textContent = String(n);
      letters.setAttribute('aria-label', n > 0 ? `Letters, ${n} unread` : 'Letters');
    },
    shown: () => shown,
    onShownChange(fn) {
      listener = fn;
      fn(shown);
    },
    destroy() {
      offStack();
      offSync();
      mq?.removeEventListener?.('change', paint);
      layer.setBottomReserve(0);
      root.remove();
    },
  };
}
