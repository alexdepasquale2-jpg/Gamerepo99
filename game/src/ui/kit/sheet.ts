/**
 * The side sheet: a slim panel on the canvas's right edge (at most ~40% of its width, above the
 * hotbar), or docked under the canvas on a tall phone. One sheet is open at a time (the overlay stack
 * closes the previous one). It is a non-modal <dialog>: the world keeps running and stays visible.
 * Typing in its fields never reaches the game's hotkeys.
 */
import { uiLayer } from './layer';
import { overlays } from './overlay-stack';
import { ensureKitStyle } from './style';

export type SheetOpts = {
  id: string;
  title: string;
  /** Called when the sheet closes for any reason (Esc, ✕, another sheet opening). */
  onClose?: () => void;
  /** Pause the game while open (default false: sheets leave the world running). */
  pause?: boolean;
};

export type Sheet = {
  el: HTMLDialogElement;
  head: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  setTitle: (t: string) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  /** Remove from the DOM (scene shutdown). */
  destroy: () => void;
};

const isField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export function createSheet(opts: SheetOpts): Sheet {
  ensureKitStyle();
  const el = document.createElement('dialog');
  el.className = 'hf-sheet';
  el.id = opts.id;
  el.setAttribute('aria-label', opts.title);
  const head = document.createElement('div');
  head.className = 'hf-sheet__head';
  const h = document.createElement('h2');
  h.textContent = opts.title;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'hf-sheet__x';
  x.textContent = '✕';
  x.setAttribute('aria-label', 'Close sheet');
  head.append(h, x);
  const body = document.createElement('div');
  body.className = 'hf-sheet__body';
  const foot = document.createElement('div');
  foot.className = 'hf-sheet__foot';
  foot.hidden = true;
  el.append(head, body, foot);
  // Keys typed in a field stay in the field (Esc still closes, via the stack's capture listener).
  for (const type of ['keydown', 'keyup', 'keypress'] as const) el.addEventListener(type, (e) => { if (isField(e.target)) e.stopPropagation(); });
  el.addEventListener('cancel', (e) => e.preventDefault());

  const hide = (): void => {
    if (!el.hasAttribute('open')) return;
    el.removeAttribute('open');
    opts.onClose?.();
  };
  const sheet: Sheet = {
    el, head, body, foot,
    setTitle: (t) => { h.textContent = t; el.setAttribute('aria-label', t); },
    open() {
      if (!el.isConnected) uiLayer().el.appendChild(el);
      // Re-opening replaces our own stack entry (its onClose hides us), so mark open only after.
      overlays.open({ id: opts.id, kind: 'sheet', el, pause: opts.pause, onClose: hide });
      // `open` as an attribute, not show(): no focus steal, so the game keeps its keys.
      el.setAttribute('open', '');
    },
    close: () => (overlays.has(opts.id) ? overlays.close(opts.id) : hide()),
    toggle: () => (sheet.isOpen() ? sheet.close() : sheet.open()),
    isOpen: () => el.hasAttribute('open'),
    destroy() { sheet.close(); el.remove(); },
  };
  x.addEventListener('click', () => sheet.close());
  return sheet;
}

/** A kit button. */
export function kitButton(label: string, onClick: () => void, opts: { disabled?: boolean; on?: boolean; id?: string; title?: string } = {}): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hf-btn';
  b.textContent = label;
  if (opts.id) b.dataset.id = opts.id;
  if (opts.title) b.title = opts.title;
  if (opts.on !== undefined) b.setAttribute('aria-pressed', String(opts.on));
  b.disabled = !!opts.disabled;
  b.addEventListener('click', () => { if (!b.disabled) onClick(); });
  return b;
}

/** A div with a class and optional text. */
export function kitEl<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
