/**
 * Keyboard-operable menus on the overlay stack. `placement: 'center'` (title, pause, save, world
 * file…) dims the window, traps focus and pauses the game; `placement: 'sheet'` (road, brood) sits in
 * the side-sheet slot so the world stays visible. Arrows move, Enter picks, Esc calls onEscape.
 */
import { uiLayer } from './layer';
import { overlays } from './overlay-stack';
import { ensureKitStyle } from './style';

export type MenuItem = { id: string; label: string; disabled?: boolean; hint?: string; onPick: () => void };
export type MenuHandle = { el: HTMLElement; close: () => void; setNote: (text: string) => void };
export type MenuOpts = {
  id: string;
  onEscape?: () => void;
  note?: string;
  placement?: 'center' | 'sheet';
  /** Pause the game while open (default: true for centred menus, false for sheets). */
  pause?: boolean;
};

export function openMenu(title: string, items: MenuItem[], opts: MenuOpts): MenuHandle {
  ensureKitStyle();
  const sheet = opts.placement === 'sheet';
  const el = document.createElement('div');
  el.className = sheet ? 'hf-menu hf-menu--sheet' : 'hf-menu';
  el.id = opts.id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  if (!sheet) el.setAttribute('aria-modal', 'true');
  const panel = document.createElement('div');
  panel.className = 'hf-panel';
  const h = document.createElement('h1');
  h.textContent = title;
  panel.appendChild(h);
  const btns = items.map((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hf-item';
    b.dataset.id = it.id;
    b.disabled = !!it.disabled;
    b.textContent = it.label;
    if (it.hint) {
      const hint = document.createElement('span');
      hint.className = 'hf-hint';
      hint.textContent = it.hint;
      b.appendChild(hint);
    }
    b.addEventListener('click', () => !it.disabled && it.onPick());
    panel.appendChild(b);
    return b;
  });
  // Focus (Tab, pointer) and the arrow selection are one highlight.
  btns.forEach((b, i) => b.addEventListener('focus', () => { sel = i; paint(); }));
  const note = document.createElement('div');
  note.className = 'hf-note';
  note.setAttribute('role', 'status');
  note.textContent = opts.note ?? '';
  panel.appendChild(note);
  el.appendChild(panel);
  (sheet ? uiLayer().el : document.body).appendChild(el);

  let sel = Math.max(0, items.findIndex((i) => !i.disabled));
  const paint = () => btns.forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
  paint();
  const close = (): void => {
    if (overlays.has(opts.id)) overlays.close(opts.id);
    else el.remove();
  };
  overlays.open({
    id: opts.id,
    kind: sheet ? 'sheet' : 'menu',
    el,
    pause: opts.pause ?? !sheet,
    onEscape: opts.onEscape ?? close,
    onClose: () => el.remove(),
    onKey(e) {
      // A form inside the menu (a number field + Go) keeps its own keys: Enter submits, arrows move the caret.
      if (e.target instanceof Element && e.target.closest('form')) return false;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const d = e.key === 'ArrowDown' ? 1 : -1;
        sel = (sel + d + items.length) % items.length;
        paint();
        if (sheet) btns[sel]?.scrollIntoView?.({ block: 'nearest' });
        else btns[sel]?.focus();
        return true;
      }
      if (e.key === 'Enter') {
        if (!items[sel]?.disabled) items[sel]?.onPick();
        return true;
      }
      return false;
    },
  });
  if (!sheet) btns[sel]?.focus({ preventScroll: true });
  return { el, close, setNote: (t) => void (note.textContent = t) };
}
