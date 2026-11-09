/** Feed: every juice event the sim emits (what the voice and world turn into bubbles and effects), live. */
import type { Tab } from './types';
import { btn, el, row } from './ui';

type Memo = { q: string };

export const feedTab: Tab = {
  id: 'feed',
  label: 'Feed',
  render(g, body) {
    const m = (g.memo.feed ??= { q: '' }) as Memo;
    const f = el('input');
    f.id = 'god-feed-q';
    f.placeholder = 'Filter by event or text…';
    f.value = m.q;
    f.addEventListener('keydown', (e) => e.stopPropagation());
    f.addEventListener('input', () => { m.q = f.value; draw(); });
    const counts = new Map<string, number>();
    for (const j of g.juice) counts.set(j.id, (counts.get(j.id) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const chips = el('div', 'g-row');
    for (const [id, n] of top) chips.append(btn(`${id} · ${n}`, () => { m.q = id; f.value = id; draw(); }));
    body.append(row(f, btn('Clear', () => { g.juice.length = 0; g.rerender(); }, 'danger'), el('span', 'dim', `${g.juice.length} events kept`)), chips);
    const list = el('div', 'g-log');
    body.append(list);
    function draw(): void {
      const q = m.q.toLowerCase();
      list.replaceChildren();
      const shown = g.juice.filter((j) => !q || j.id.toLowerCase().includes(q) || JSON.stringify(j.payload ?? '').toLowerCase().includes(q)).slice(-300).reverse();
      for (const j of shown) {
        const line = el('div');
        const p = j.payload && typeof j.payload === 'object' ? j.payload as Record<string, unknown> : {};
        const said = typeof p.line === 'string' ? ` “${p.line}”` : '';
        const who = typeof p.personId === 'string' ? ` ${p.personId}` : '';
        const rest = Object.entries(p).filter(([k, v]) => k !== 'line' && k !== 'personId' && (typeof v === 'number' || typeof v === 'string')).slice(0, 4)
          .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`).join(' ');
        line.append(el('span', 'dim', `d${j.day} `), el('span', 'cyan', j.id), el('span', '', who), el('span', 'gold', said), el('span', 'dim', rest ? `  ${rest}` : ''));
        line.title = JSON.stringify(j.payload, null, 1);
        list.append(line);
      }
      if (!shown.length) list.append(el('p', 'dim', g.juice.length ? 'Nothing matches.' : 'Nothing yet. Act on someone or let a dawn pass.'));
    }
    draw();
  },
};
