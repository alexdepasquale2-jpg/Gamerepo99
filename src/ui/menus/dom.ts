/** Tiny DOM kit for menus: a keyboard-operable list in a dim overlay. Palette: docs/art/PALETTE.md warm tones. */

export type MenuItem = { id: string; label: string; disabled?: boolean; hint?: string; onPick: () => void };
export type MenuHandle = { el: HTMLElement; close: () => void; setNote: (text: string) => void };

const STYLE = `
.hf-menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(90,62,40,.28);z-index:10;font:16px/1.4 Georgia,serif;color:#2c2118}
.hf-panel{min-width:min(360px,92vw);max-width:92vw;max-height:92vh;overflow-y:auto;box-sizing:border-box;padding:20px 28px;background:#f4efe4;border:3px solid #3e6d8c;box-shadow:6px 6px 0 #c4622d}
.hf-panel h1{margin:0 0 8px;font-size:28px;color:#8e3d22;font-weight:normal;letter-spacing:.02em}
.hf-tag{margin:0 0 2px;font:12px/1.35 'Courier New',monospace;letter-spacing:.04em;color:#24485e}
.hf-item{display:block;width:100%;text-align:left;margin:2px 0;padding:6px 10px;background:none;border:1px solid transparent;color:inherit;font:inherit;cursor:pointer}
.hf-item[aria-selected=true]{border-color:#3e6d8c;background:#e6d3a1}
.hf-item[disabled]{opacity:.45;cursor:default}
.hf-hint{display:block;font-size:13px;color:#3e6d8c}
.hf-note{min-height:1.4em;margin-top:10px;font-size:14px;color:#8e3d22}
@media (max-height:420px){.hf-menu{font-size:15px}.hf-panel{padding:12px 20px}.hf-panel h1{font-size:18px;margin-bottom:6px}.hf-hint{font-size:12px}}
`;

function ensureStyle(): void {
  if (document.getElementById('hf-menu-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-menu-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

/** Open a menu. Esc calls onEscape (default: close). Arrows move, Enter picks; disabled items are skipped on pick. */
export function openMenu(title: string, items: MenuItem[], opts: { id: string; onEscape?: () => void; note?: string; lines?: readonly string[] }): MenuHandle {
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
  for (const line of opts.lines ?? []) {
    const tag = document.createElement('p');
    tag.className = 'hf-tag';
    tag.textContent = line;
    panel.appendChild(tag);
  }
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
