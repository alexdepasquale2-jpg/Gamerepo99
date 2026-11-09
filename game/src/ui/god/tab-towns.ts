/** Towns: despair, stores, shortages, builds, workshops and doctrines for each town, all editable. */
import { drawStores, supplyStores } from '../../sim/civic/town-stores';
import { BUILDING_BY_ID } from '../../sim/economy/build-plans';
import { ITEMS } from '../../sim/goods/inventory';
import type { SimState } from '../../sim/types/runtime';
import type { God, Tab } from './types';
import { bar, btn, card, el, num, pill, row, slider } from './ui';

type Memo = { town?: string; item: string; qty: number };

const townIds = (st: SimState): string[] =>
  [...new Set([...Object.keys(st.towns ?? {}), ...Object.keys(st.villageEconomy?.towns ?? {}), ...Object.values(st.people).map((p) => p.townId ?? '')])].filter(Boolean).sort();

export const townsTab: Tab = {
  id: 'towns',
  label: 'Towns',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const m = (g.memo.towns ??= { item: 'bread', qty: 10 }) as Memo;
    const ids = townIds(st);
    m.town = m.town && ids.includes(m.town) ? m.town : (st.player.townId && ids.includes(st.player.townId) ? st.player.townId : ids[0]);
    const pick = el('div', 'g-row');
    for (const id of ids) {
      const people = Object.values(st.people).filter((p) => p.townId === id).length;
      pick.append(btn(`${id.replace(/_/g, ' ')} · ${people}`, () => { m.town = id; g.rerender(); }, id === m.town ? 'hot' : ''));
    }
    body.append(pick);
    if (!m.town) return;
    const id = m.town;
    const t = (st.towns ??= {})[id];
    const l = st.villageEconomy?.towns[id];
    const folk = Object.values(st.people).filter((p) => p.townId === id);
    const lit = folk.filter((p) => p.flame >= g.threshold()).length;

    const grid = el('div', 'g-grid');
    // Mood
    grid.append(card('Mood',
      row(el('span', 'dim', 'Despair'), t ? slider(Math.round((t.despair ?? 0) * 100), 0, 100, (v) => { t.despair = v / 100; g.commit(`${id} despair ${v}%`); }) : el('span', 'dim', 'no meter'),
        el('b', '', t ? `${Math.round((t.despair ?? 0) * 100)}%` : '')),
      row(el('span', 'dim', 'Standing'), t ? num(t.standing ?? 0, (n) => { t.standing = Math.max(0, Math.min(1, n)); g.commit('Standing set'); }, { step: 0.05 }) : ''),
      row(el('span', 'dim', `Lit ${lit} of ${folk.length}`), bar(folk.length ? lit / folk.length : 0, '#7fb069')),
      row(btn('Kindle the town', () => { for (const p of folk) p.flame = Math.max(p.flame, g.threshold() + 10); g.commit(`${id} kindled`); }, 'hot'),
        btn('Snuff the town', () => { for (const p of folk) p.flame = 0; g.commit(`${id} snuffed`); }, 'danger')),
    ));
    // Stores
    const stores = el('div');
    const goods = Object.entries(l?.goods ?? {}).filter(([, q]) => q >= 0.5).sort((a, b) => b[1] - a[1]);
    for (const [item, q] of goods) {
      stores.append(row(el('span', '', item), el('b', 'cyan', Math.round(q)),
        btn('+10', () => { supplyStores(st, id, item, 10, 'source:god'); g.commit(`+10 ${item}`); }),
        btn('−10', () => { drawStores(st, id, item, 10, 'sink:god'); g.commit(`−10 ${item}`); }),
        btn('Empty', () => { drawStores(st, id, item, q + 1, 'sink:god'); g.commit(`${item} emptied`); }, 'danger')));
    }
    if (!goods.length) stores.append(el('p', 'dim', 'The stores are bare.'));
    const itemSel = el('select');
    for (const it of ITEMS.items) itemSel.append(new Option(it.name, it.id));
    itemSel.value = m.item;
    itemSel.addEventListener('change', () => { m.item = itemSel.value; });
    stores.append(row(itemSel, num(m.qty, (n) => { m.qty = n; }), btn('Supply', () => { supplyStores(st, id, m.item, m.qty, 'source:god'); g.commit(`+${m.qty} ${m.item} to ${id}`); }, 'hot'),
      btn('Flood every good', () => { for (const it of ITEMS.items) if (it.id !== 'coin') supplyStores(st, id, it.id, 50, 'source:god'); g.commit('Abundance'); })));
    grid.append(card('Stores', stores));
    // Shortages
    const short = Object.entries(l?.short ?? {}).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
    grid.append(card('Short at last dawn', ...(short.length ? short.map(([i, q]) => row(el('span', '', i), el('b', 'red', q.toFixed(1)), el('span', 'dim', `need ${(l?.need[i] ?? 0).toFixed(1)}/day`))) : [el('p', 'dim', 'Nothing short.')])));
    // Builds
    const plans = (st.build?.plans ?? []).filter((p) => p.townId === id && p.stage !== 'abandoned');
    const planRows = plans.map((p) => {
      const def = BUILDING_BY_ID.get(p.kind);
      const cost = Object.entries(def?.cost ?? {});
      const have = cost.reduce((n, [i, q]) => n + Math.min(q, p.have[i] ?? 0), 0) / (cost.reduce((n, [, q]) => n + q, 0) || 1);
      const prog = p.stage === 'gathering' ? 0.5 * have : p.stage === 'building' ? 0.5 + 0.5 * Math.min(1, p.laborDone / (def?.labor ?? 1)) : 1;
      const owner = st.people[p.ownerId]?.name ?? p.ownerId;
      return row(el('span', '', `${def?.name ?? p.kind}`), el('span', 'dim', owner), pill(p.stage, p.stage === 'done' ? 'ok' : ''), bar(prog),
        p.stage !== 'done' ? btn('Fund', () => { p.have = { ...(def?.cost ?? {}) }; p.stalledDays = 0; if (p.stage === 'gathering') p.stage = 'building'; g.commit(`${def?.name} funded`); }) : '',
        p.stage !== 'done' ? btn('Finish', () => { p.have = { ...(def?.cost ?? {}) }; p.laborDone = def?.labor ?? 0; p.stage = 'done'; p.doneDay = st.day; const c = st.build?.claims.find((x) => x.id === p.claimId); if (c) c.status = 'built'; g.commit(`${def?.name} stands`); }, 'hot') : '');
    });
    grid.append(card(`Builds · ${plans.length}`, ...(planRows.length ? planRows : [el('p', 'dim', 'No builds.')])));
    // Workshops
    const cos = (st.companies?.list ?? []).filter((c) => c.townId === id);
    grid.append(card(`Workshops · ${cos.length}`, ...(cos.length ? cos.map((c) => row(el('span', '', c.name), el('span', 'dim', `${c.workers.length} hands`),
      el('span', 'dim', 'till'), num(c.coin, (n) => { c.coin = n; g.commit(`${c.name} till ${n}`); }))) : [el('p', 'dim', 'No workshops.')])));
    // Doctrines
    const docs = Object.values(st.doctrines ?? {}).filter((d) => d.townId === id);
    const meters = ['legitimacy', 'realDelivery', 'perceivedDelivery', 'propaganda', 'control', 'exposure'] as const;
    grid.append(card(`Doctrine · ${docs.length}`, ...(docs.length ? docs.map((d) => {
      const box = el('div');
      box.append(row(el('b', 'gold', d.gen?.name ?? d.id), d.collapsed ? pill('collapsed', 'bad') : pill('standing', 'ok'),
        btn(d.collapsed ? 'Restore' : 'Collapse', () => { d.collapsed = !d.collapsed; g.commit(`${d.id} ${d.collapsed ? 'collapsed' : 'restored'}`); }, d.collapsed ? '' : 'danger')));
      const rec = d as unknown as Record<string, number>;
      for (const k of meters) if (typeof rec[k] === 'number') box.append(row(el('span', 'dim', k), num(rec[k]!, (n) => { rec[k] = n; g.commit(`${k} ${n}`); }, { step: 0.05 })));
      return box;
    }) : [el('p', 'dim', 'No doctrine holds this town.')])));
    body.append(grid);
  },
};
