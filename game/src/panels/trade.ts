/**
 * Trade with a wagon on the road: one row per good with Buy / Sell, prices shaped by the shortages of the
 * town the wagon is bound for (sim/goods/caravan-trade). While the sheet is open the wagon is "stopped"
 * (panels.trade.current()), so the actors area can hold it in place.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { caravanStatus } from '../sim/caravan-visit';
import { offers, tradeGood, wagonDestination } from '../sim/goods/caravan-trade';
import { button, el, townNamer } from './dom';
import { itemIcon } from './icons';

export const TRADE_ID = 'trade';

export function tradeSheet(ctx: GameContext, caravanId: string, onClose: () => void): SheetDef {
  const nameOf = townNamer(ctx);
  let message = '';
  const wagon = () => ctx.session.getState()?.caravans?.find((c) => c.id === caravanId);
  const m0 = wagon();
  const st0 = ctx.session.getState();
  const dest0 = st0 && m0 ? wagonDestination(st0, m0) : undefined;
  const def: SheetDef = {
    id: TRADE_ID,
    title: `Roadside trader${dest0 ? ` · bound for ${nameOf(dest0)}` : ''}`,
    onClose,
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      const m = wagon();
      if (!st || !m) { body.append(el('p', 'hf-muted', 'The wagon has moved on.')); return; }
      const dest = wagonDestination(st, m);
      body.append(el('p', 'hf-muted hf-small', `${caravanStatus(m)}${dest ? ` · bound for ${nameOf(dest)}` : ''}`));
      body.append(el('p', 'hf-small', `Your coin: ${st.inventory?.coin ?? 0} · Trader's coin: ${m.coin ?? 20}`));
      const rows = offers(st, m.id);
      const grid = el('div', 'hf-rows', undefined, { role: 'table', 'aria-label': 'Goods' });
      for (const h of ['Good', 'Buy', 'Sell', 'Aboard / yours']) grid.append(el('span', 'hf-head', h, { role: 'columnheader' }));
      const act = (itemId: string, buying: boolean): void => {
        message = tradeGood(st, m.id, itemId, buying);
        ctx.events.emit('inventory', {});
        ctx.voice?.sfx?.('pickup');
        def.render(body);
      };
      for (const o of rows) {
        const good = el('span', `hf-trade-good${o.short ? ' hf-glow' : ''}`, undefined, { 'data-item': o.itemId, role: 'cell' });
        good.append(itemIcon(o.itemId), document.createTextNode(` ${o.name}${o.short ? ' ▲' : ''}`));
        grid.append(
          good,
          button(`${o.buy}c`, () => act(o.itemId, true), { disabled: o.aboard <= 0, id: `buy-${o.itemId}`, title: `Buy ${o.name}` }),
          button(`${o.sell}c`, () => act(o.itemId, false), { disabled: o.have <= 0, id: `sell-${o.itemId}`, title: `Sell ${o.name}` }),
          el('span', 'hf-num', `${o.aboard} / ${o.have}`, { role: 'cell' }),
        );
      }
      if (!rows.length) grid.append(el('span', 'hf-muted', 'Nothing to trade.'));
      body.append(grid);
      body.append(el('p', 'hf-note hf-small', message || (rows.some((o) => o.short)
        ? '▲ the town they are bound for is short of this: it pays more, and sells dearer.'
        : 'The driver stops to trade with you.')));
    },
  };
  return def;
}
