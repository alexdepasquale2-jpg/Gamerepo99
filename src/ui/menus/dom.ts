/** Tiny DOM kit for menus: a keyboard-operable list in a dim overlay. Palette: docs/art/PALETTE.md warm tones. */

export type MenuItem = { id: string; label: string; disabled?: boolean; hint?: string; onPick: () => void };
export type MenuHandle = { el: HTMLElement; close: () => void; setNote: (text: string) => void };

const STYLE = `
.hf-menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,13,18,.82);z-index:10;font:16px/1.4 Georgia,serif;color:#f4e6c8}
.hf-panel{min-width:320px;max-width:90vw;padding:20px 28px;background:#2a2420;border:2px solid #b89860;box-shadow:0 0 24px rgba(242,184,75,.25)}
.hf-panel h1{margin:0 0 12px;font-size:22px;color:#f2b84b;font-weight:normal}
.hf-item{display:block;width:100%;text-align:left;margin:4px 0;padding:6px 10px;background:none;border:1px solid transparent;color:inherit;font:inherit;cursor:pointer}
.hf-item[aria-selected=true]{border-color:#f2b84b;background:#3a3028}
.hf-item[disabled]{opacity:.45;cursor:default}
.hf-hint{display:block;font-size:13px;color:#a89068}
.hf-note{min-height:1.4em;margin-top:10px;font-size:14px;color:#84b8b0}
`;

function ensureStyle(): void {
  if (document.getElementById('hf-menu-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-menu-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** Open a menu. Esc calls onEscape (default: close). Arrows move, Enter picks; disabled items are skipped on pick. */
export function openMenu(title: string, items: MenuItem[], opts: { id: string; onEscape?: () => void; note?: string }): MenuHandle {
  ensureStyle();
  const el = document.createElement('div');
  el.className = 'hf-menu';
  el.id = opts.id;
  el.setAttribute('role', 'dialog');
  const panel = document.createElement('div');
  panel.className = 'hf-panel';
  const h = document.createElement('h1');
  h.textContent = title;
  panel.appendChild(h);
  const btns = items.map((it) => {
    const b = document.createElement('button');
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
  const note = document.createElement('div');
  note.className = 'hf-note';
  note.setAttribute('role', 'status');
  note.textContent = opts.note ?? '';
  panel.appendChild(note);
  el.appendChild(panel);
  document.body.appendChild(el);

  let sel = Math.max(0, items.findIndex((i) => !i.disabled));
  const paint = () => btns.forEach((b, i) => b.setAttribute('aria-selected', String(i === sel)));
  paint();
  const close = () => {
    window.removeEventListener('keydown', onKey, true);
    el.remove();
  };
  function onKey(e: KeyboardEvent): void {
    if (!el.isConnected) return;
    if (e.key === 'Escape') opts.onEscape ? opts.onEscape() : close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const d = e.key === 'ArrowDown' ? 1 : -1;
      sel = (sel + d + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter') {
      if (!items[sel]?.disabled) items[sel]?.onPick();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);
  return { el, close, setNote: (t) => void (note.textContent = t) };
}
