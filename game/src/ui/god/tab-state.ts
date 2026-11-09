/** State: the raw SimState as a tree. Expand anything; numbers, text and switches edit in place. */
import type { Tab } from './types';
import { btn, el, row } from './ui';

type Memo = { open: Set<string>; path: string };
const SKIP = new Set(['data', 'rng', 'bus', 'reactionLineSelector', 'economyHooks']);

export const stateTab: Tab = {
  id: 'state',
  label: 'State',
  render(g, body) {
    const st = g.state() as unknown as Record<string, unknown> | undefined;
    if (!st) return;
    const m = (g.memo.state ??= { open: new Set<string>(), path: '' }) as Memo;
    const size = (v: unknown): string => (Array.isArray(v) ? `[${v.length}]` : v && typeof v === 'object' ? `{${Object.keys(v).length}}` : '');
    const jump = el('input');
    jump.placeholder = 'Path, e.g. people.marta_ellison';
    jump.value = m.path;
    jump.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      m.path = jump.value.trim();
      const parts = m.path.split('.').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) m.open.add(parts.slice(0, i).join('.'));
      g.rerender();
    });
    body.append(row(jump, btn('Collapse all', () => { m.open.clear(); g.rerender(); }),
      btn('Copy whole state', () => { void navigator.clipboard?.writeText(g.ctx.session.dump()).then(() => g.toast('State copied'), () => g.toast('Clipboard refused')); })));
    const tree = el('div', 'g-tree');
    tree.style.marginTop = '8px';
    const node = (parent: Record<string, unknown> | unknown[], key: string, path: string, depth: number): HTMLElement => {
      const v = (parent as Record<string, unknown>)[key];
      const line = el('div');
      if (v && typeof v === 'object') {
        const d = el('details');
        d.open = m.open.has(path);
        const s = el('summary');
        s.append(el('span', 'k', key), ` ${size(v)}`);
        d.append(s);
        d.addEventListener('toggle', () => {
          if (d.open) { m.open.add(path); if (d.childElementCount === 1) fill(d, v as Record<string, unknown>, path, depth + 1); } else m.open.delete(path);
        });
        if (d.open) fill(d, v as Record<string, unknown>, path, depth + 1);
        line.append(d);
        return line;
      }
      line.append(el('span', 'k', `${key}: `));
      if (typeof v === 'number' || typeof v === 'string') {
        const i = el('input');
        i.value = String(v);
        i.style.width = typeof v === 'number' ? '90px' : '220px';
        i.addEventListener('keydown', (e) => e.stopPropagation());
        i.addEventListener('change', () => {
          const next = typeof v === 'number' ? Number(i.value) : i.value;
          if (typeof next === 'number' && !Number.isFinite(next)) return;
          (parent as Record<string, unknown>)[key] = next;
          g.commit(`${path} = ${i.value}`);
        });
        line.append(i);
      } else if (typeof v === 'boolean') {
        line.append(btn(String(v), () => { (parent as Record<string, unknown>)[key] = !v; g.commit(`${path} = ${!v}`); }, v ? 'hot' : ''));
      } else line.append(el('span', 'dim', String(v)));
      return line;
    };
    const fill = (host: HTMLElement, obj: Record<string, unknown>, path: string, depth: number): void => {
      const keys = Object.keys(obj);
      const shown = keys.slice(0, 300);
      for (const k of shown) host.append(node(obj, k, path ? `${path}.${k}` : k, depth));
      if (keys.length > shown.length) host.append(el('div', 'dim', `… ${keys.length - shown.length} more (use the path box)`));
    };
    for (const k of Object.keys(st).filter((k) => !SKIP.has(k)).sort()) tree.append(node(st, k, k, 0));
    body.append(tree);
  },
};
