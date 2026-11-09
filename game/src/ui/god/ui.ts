/** Small DOM helpers for the god menu: elements, buttons, number fields, sortable tables, sparklines. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string | number): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = String(text);
  return e;
}

export function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `g-b ${cls}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export function row(...kids: (Node | string)[]): HTMLDivElement {
  const r = el('div', 'g-row');
  r.append(...kids);
  return r;
}

export function card(title: string, ...kids: (Node | string)[]): HTMLDivElement {
  const c = el('div', 'g-card');
  const h = el('h3');
  h.append(title);
  c.append(h, ...kids);
  return c;
}

/** A number field that commits on change (Enter or blur). */
export function num(value: number, onSet: (n: number) => void, opts: { step?: number; min?: number; max?: number; id?: string } = {}): HTMLInputElement {
  const i = el('input');
  i.type = 'number';
  i.value = String(Math.round(value * 100) / 100);
  if (opts.step !== undefined) i.step = String(opts.step);
  if (opts.min !== undefined) i.min = String(opts.min);
  if (opts.max !== undefined) i.max = String(opts.max);
  if (opts.id) i.id = opts.id;
  i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n)) onSet(n); });
  i.addEventListener('keydown', (e) => e.stopPropagation());
  return i;
}

export function slider(value: number, min: number, max: number, onSet: (n: number) => void, step = 1): HTMLInputElement {
  const i = el('input');
  i.type = 'range';
  i.min = String(min); i.max = String(max); i.step = String(step);
  i.value = String(value);
  i.addEventListener('change', () => onSet(Number(i.value)));
  return i;
}

export function bar(f: number, color?: string): HTMLDivElement {
  const b = el('div', 'g-bar');
  const i = el('i');
  i.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
  if (color) i.style.background = color;
  b.append(i);
  return b;
}

export function pill(text: string, tone: '' | 'ok' | 'bad' | 'gold' = ''): HTMLSpanElement {
  return el('span', `g-pill ${tone}`.trim(), text);
}

export type Col<T> = { key: string; label: string; get: (r: T) => string | number | Node; sort?: (r: T) => string | number };

/** A table with click-to-sort headers. `onRow` makes rows selectable. Sort state lives on the returned element. */
export function table<T>(rows: T[], cols: Col<T>[], opts: { onRow?: (r: T) => void; selected?: (r: T) => boolean; sortKey?: string; desc?: boolean; onSort?: (key: string, desc: boolean) => void } = {}): HTMLDivElement {
  const wrap = el('div', 'g-scroll');
  const t = el('table');
  const head = el('tr');
  for (const c of cols) {
    const th = el('th', '', c.label + (opts.sortKey === c.key ? (opts.desc ? ' ▾' : ' ▴') : ''));
    th.addEventListener('click', () => opts.onSort?.(c.key, opts.sortKey === c.key ? !opts.desc : true));
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const col = cols.find((c) => c.key === opts.sortKey);
  const sorted = col ? [...rows].sort((a, b) => {
    const f = col.sort ?? ((r: T) => { const v = col.get(r); return typeof v === 'number' ? v : String(v instanceof Node ? v.textContent : v); });
    const x = f(a), y = f(b);
    const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return opts.desc ? -d : d;
  }) : rows;
  const body = el('tbody');
  for (const r of sorted) {
    const tr = el('tr', opts.selected?.(r) ? 'sel' : '');
    for (const c of cols) {
      const td = el('td');
      const v = c.get(r);
      td.append(v instanceof Node ? v : String(v));
      tr.append(td);
    }
    if (opts.onRow) { tr.style.cursor = 'pointer'; tr.addEventListener('click', () => opts.onRow!(r)); }
    body.append(tr);
  }
  t.append(thead, body);
  wrap.append(t);
  return wrap;
}

/** A sparkline of a series, with its latest value; drawn at device pixel ratio. */
export function spark(series: number[], color = '#5EC8C8', label = ''): HTMLDivElement {
  const box = el('div');
  const head = el('div', 'g-row');
  const last = series.length ? series[series.length - 1]! : 0;
  head.append(el('span', 'dim', label), el('span', 'gold', fmt(last)));
  head.style.justifyContent = 'space-between';
  const c = el('canvas', 'g-spark');
  box.append(head, c);
  requestAnimationFrame(() => {
    const w = c.clientWidth || 240, h = c.clientHeight || 46, dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    if (!g || series.length < 2) return;
    g.scale(dpr, dpr);
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    const x = (i: number): number => (i / (series.length - 1)) * (w - 4) + 2;
    const y = (v: number): number => h - 4 - ((v - lo) / span) * (h - 8);
    g.strokeStyle = 'rgba(232,220,200,.08)';
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, (h * k) / 4); g.lineTo(w, (h * k) / 4); g.stroke(); }
    g.beginPath();
    series.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
    g.lineTo(x(series.length - 1), h); g.lineTo(x(0), h); g.closePath();
    g.globalAlpha = 0.15; g.fillStyle = color; g.fill(); g.globalAlpha = 1;
    g.beginPath(); g.arc(x(series.length - 1), y(last), 2.5, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  });
  return box;
}

export const fmt = (n: number): string => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1));
