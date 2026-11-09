/** Roads: carts on the road, open requests, wrecks and the routes themselves. */
import { cartPosition } from '../../sim/economy/logistics';
import type { Tab } from './types';
import { btn, card, el, num, pill, row, table } from './ui';

export const roadsTab: Tab = {
  id: 'roads',
  label: 'Roads',
  render(g, body) {
    const st = g.state();
    if (!st) return;
    const log = (st.logistics ??= { requests: [], carts: [], next: 1, lost: 0, delivered: 0 });
    body.append(row(pill(`${log.delivered} delivered`, 'ok'), pill(`${log.lost} lost`, 'bad'), pill(`${log.carts.length} on the road`, 'gold'),
      btn('Land every cart now', () => { for (const c of log.carts) c.daysLeft = 1; g.commit('Every cart arrives at the next dawn'); }),
      btn('Escort every cart', () => { for (const c of log.carts) c.escortedBy = 'player'; g.commit('Every cart has an escort'); })));

    body.append(card('Carts', log.carts.length ? table(log.carts, [
      { key: 'id', label: 'Cart', get: (c) => c.id },
      { key: 'load', label: 'Load', get: (c) => `${c.qty} ${c.itemId}` },
      { key: 'route', label: 'From → to', get: (c) => `${c.fromTownId} → ${c.toTownId}` },
      { key: 'where', label: 'Now', get: (c) => { const p = cartPosition(c); return p ? `${p.from}→${p.to} ${Math.round(p.f * 100)}%` : '-'; } },
      { key: 'left', label: 'Days left', get: (c) => num(c.daysLeft, (n) => { c.daysLeft = Math.max(1, n); g.commit('Cart retimed'); }), sort: (c) => c.daysLeft },
      { key: 'esc', label: 'Escort', get: (c) => c.escortedBy ?? '' },
      { key: 'x', label: '', get: (c) => btn('Destroy', () => { log.carts = log.carts.filter((x) => x !== c); log.lost += 1; g.commit(`${c.id} lost on the road`); }, 'danger') },
    ], { sortKey: 'left' }) : el('p', 'dim', 'No carts on the road.')));

    const open = log.requests.filter((r) => r.status === 'open');
    body.append(card(`Requests · ${open.length} open`, open.length ? table(open, [
      { key: 'town', label: 'Town', get: (r) => r.townId },
      { key: 'item', label: 'Wants', get: (r) => `${r.qty} ${r.itemId}` },
      { key: 'day', label: 'Posted', get: (r) => `day ${r.postedDay}`, sort: (r) => r.postedDay },
      { key: 'cart', label: 'Cart', get: (r) => r.cartId ?? '' },
      { key: 'x', label: '', get: (r) => btn('Lapse', () => { r.status = 'lapsed'; g.commit('Request lapsed'); }) },
    ]) : el('p', 'dim', 'No open requests.')));

    const routes = st.economyRoutes ?? [];
    body.append(card(`Routes · ${routes.length}`, ...(routes.length ? routes.map((r) => row(
      el('b', '', `${r.fromTownId} ↔ ${r.toTownId}`), el('span', 'dim', `${r.days} days`),
      el('span', 'dim', 'condition'), num(r.condition ?? 1, (n) => { r.condition = n; g.commit('Condition set'); }, { step: 0.1 }),
      r.broken ? pill('broken', 'bad') : pill('open', 'ok'),
      btn(r.broken ? 'Mend' : 'Break', () => { r.broken = !r.broken; g.commit(`${r.id} ${r.broken ? 'broken' : 'mended'}`); }, r.broken ? 'hot' : 'danger'),
    )) : [el('p', 'dim', 'No routes in this world.')])));

    const wrecks = log.wrecks ?? [];
    if (wrecks.length) body.append(card(`Wrecks · ${wrecks.length}`, ...wrecks.map((w) => row(el('span', '', `${w.qty} ${w.itemId}`), el('span', 'dim', `${w.at.from}→${w.at.to}, day ${w.day}`))),
      btn('Clear wrecks', () => { log.wrecks = []; g.commit('Wrecks cleared'); })));
  },
};
