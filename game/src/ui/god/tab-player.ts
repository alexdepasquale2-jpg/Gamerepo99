/** You: spark, coin and every item in the game, with set/add/remove. */
import { ITEMS, addItem, inventoryOf } from '../../sim/goods/inventory';
import type { Tab } from './types';
import { bar, btn, card, el, num, row, table } from './ui';

export const playerTab: Tab = {
  id: 'player',
  label: 'You',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const pl = st.player;
    const max = pl.sparkMax ?? 100;
    const inv = inventoryOf(st);
    const setCoin = (n: number): void => { inv.coin = Math.max(0, Math.round(n)); pl.coin = inv.coin; };
    const grid = el('div', 'g-grid');
    grid.append(card('Spark',
      row(num(pl.spark, (n) => { pl.spark = Math.max(0, n); g.commit(`Spark ${n}`); }), el('span', 'dim', 'of'), num(max, (n) => { pl.sparkMax = Math.max(1, n); g.commit(`Max spark ${n}`); })),
      bar(pl.spark / max),
      row(btn('Fill', () => { pl.spark = max; g.commit('Spark full'); }, 'hot'), btn('+20', () => { pl.spark = Math.min(max, pl.spark + 20); g.commit('+20 spark'); }),
        btn('Ember zone', () => { pl.spark = 15; g.commit('Spark 15'); }), btn('Burn out', () => { pl.spark = 0; g.commit('Spark 0: rest to burn out'); }, 'danger')),
      row(btn('Infinite spark (999)', () => { pl.sparkMax = 999; pl.spark = 999; g.commit('999 spark'); })),
    ));
    grid.append(card('Purse',
      row(el('span', 'dim', 'Coin'), num(inv.coin ?? 0, (n) => { setCoin(n); g.commit(`Coin ${n}`); })),
      row(...[10, 100, 1000].map((n) => btn(`+${n}`, () => { setCoin((inv.coin ?? 0) + n); g.commit(`+${n} coin`); }))),
      el('div', 'dim', `Archetype ${pl.archetypeId ?? '—'} · in ${pl.townId ?? '—'}`),
    ));
    grid.append(card('Satchel',
      row(btn('5 of everything', () => { for (const it of ITEMS.items) if (it.id !== 'coin') addItem(st, it.id, 5); g.commit('5 of every item'); }, 'hot'),
        btn('Empty satchel', () => { for (const k of Object.keys(inv)) if (k !== 'coin') delete inv[k]; g.commit('Satchel emptied'); }, 'danger'),
        btn('Starting kit', () => { for (const [k, q] of Object.entries(ITEMS.startingInventory)) if (k !== 'coin') inv[k] = q; g.commit('Starting kit'); })),
    ));
    body.append(grid);
    body.append(card(`Every item · ${ITEMS.items.length}`, table(ITEMS.items.filter((i) => i.id !== 'coin'), [
      { key: 'name', label: 'Item', get: (i) => i.name },
      { key: 'tags', label: 'Tags', get: (i) => (i.tags ?? []).join(' ') },
      { key: 'price', label: 'Price', get: (i) => i.price ?? 0, sort: (i) => i.price ?? 0 },
      { key: 'have', label: 'Have', get: (i) => num(inv[i.id] ?? 0, (n) => { if (n <= 0) delete inv[i.id]; else inv[i.id] = Math.round(n); g.commit(`${i.name}: ${n}`); }), sort: (i) => inv[i.id] ?? 0 },
      { key: 'add', label: '', get: (i) => { const d = el('span'); d.append(btn('+1', () => { addItem(st, i.id, 1); g.commit(`+1 ${i.name}`); }), btn('+10', () => { addItem(st, i.id, 10); g.commit(`+10 ${i.name}`); })); return d; } },
    ], { sortKey: 'have', desc: true })));
  },
};
