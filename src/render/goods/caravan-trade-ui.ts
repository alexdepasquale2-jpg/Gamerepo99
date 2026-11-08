import type Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { caravanStatus } from '../../sim/caravan-visit';
import { offers, tradeGood, wagonDestination } from '../../sim/goods/caravan-trade';
import { createSheet, kitButton, kitEl } from '../../ui/kit/sheet';

/** Roadside trader: a kit side sheet, one row per good with Buy / Sell, prices shaped by the destination's shortages. */
export function createCaravanTrade(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void, townName: (id: string) => string = (id) => id) {
  let id: string | undefined;
  let message = '';
  const sheet = createSheet({ id: 'hf-trade', title: 'Roadside trader', onClose: () => { id = undefined; } });
  scene.events.once('shutdown', () => sheet.destroy());

  const draw = (): void => {
    const s = getState(), m = s?.caravans?.find((c) => c.id === id);
    if (!s || !m) { sheet.close(); return; }
    const rows = offers(s, m.id);
    const dest = wagonDestination(s, m);
    sheet.setTitle(`Roadside trader · ${caravanStatus(m)}${dest ? ` · bound for ${townName(dest)}` : ''}`);
    const body = sheet.body;
    body.replaceChildren();
    body.append(kitEl('p', 'hf-muted', `Your coin: ${s.inventory?.coin ?? 0} · Trader's coin: ${m.coin ?? 20}`));
    const grid = kitEl('div', 'hf-rows');
    for (const h of ['Good', 'Buy', 'Sell', 'Aboard / Yours']) grid.append(kitEl('span', 'hf-head', h));
    for (const o of rows) {
      const name = kitEl('span', o.short ? 'hf-glow' : '', `${o.name}${o.short ? ' ▲' : ''}`);
      name.dataset.item = o.itemId;
      const buy = kitButton(`${o.buy}c`, () => { message = tradeGood(s, m.id, o.itemId, true); changed(); draw(); }, { disabled: o.aboard <= 0, id: `buy-${o.itemId}`, title: `Buy ${o.name}` });
      const sell = kitButton(`${o.sell}c`, () => { message = tradeGood(s, m.id, o.itemId, false); changed(); draw(); }, { disabled: o.have <= 0, id: `sell-${o.itemId}`, title: `Sell ${o.name}` });
      grid.append(name, buy, sell, kitEl('span', 'hf-num', `${o.aboard} / ${o.have}`));
    }
    body.append(grid);
    body.append(kitEl('p', 'hf-note hf-small', message || (rows.some((o) => o.short) ? '▲ the town they are bound for is short of this: it pays more, and sells dearer.' : 'The driver stops to trade with you.')));
    sheet.foot.hidden = false;
    sheet.foot.replaceChildren(kitButton('Leave', () => sheet.close(), { id: 'trade-leave' }));
  };
  return {
    open(caravanId: string) { message = ''; sheet.open(); id = caravanId; draw(); },
    isOpen: () => sheet.isOpen(),
    stoppedId: () => (sheet.isOpen() ? id : undefined),
    close() { sheet.close(); },
  };
}
