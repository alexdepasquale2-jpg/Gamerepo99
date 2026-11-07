import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { caravanStatus } from '../../sim/caravan-visit';
import { offers, tradeGood, wagonDestination } from '../../sim/goods/caravan-trade';

/** Roadside trader panel: one row per good with Buy / Sell, prices shaped by the destination's shortages. */
export function createCaravanTrade(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void, townName: (id: string) => string = (id) => id) {
  const panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(1_000_410).setVisible(false);
  let id: string | undefined;
  let message = '';
  const ROW = 26;
  const draw = () => {
    panel.removeAll(true);
    const s = getState(), m = s?.caravans?.find((m) => m.id === id);
    if (!s || !m) { panel.setVisible(false); id = undefined; return; }
    const rows = offers(s, m.id);
    const w = 420, h = 108 + rows.length * ROW + 52;
    const x = scene.scale.width / 2 - w / 2, y = Math.max(8, scene.scale.height / 2 - h / 2);
    const dest = wagonDestination(s, m);
    panel.add(scene.add.rectangle(x, y, w, h, 0x231c16, 0.98).setOrigin(0).setStrokeStyle(2, 0xc79b61));
    const font = { fontFamily: 'monospace', fontSize: '11px', color: '#f4e6c8', wordWrap: { width: w - 30 } };
    panel.add(scene.add.text(x + 15, y + 10, `Roadside trader · ${caravanStatus(m)}${dest ? ` · bound for ${townName(dest)}` : ''}\nYour coin: ${s.inventory?.coin ?? 0} · Trader's coin: ${m.coin ?? 20}`, { ...font, fontSize: '12px' }));
    panel.add(scene.add.text(x + 15, y + 52, 'Good', { ...font, color: '#c8b898' }));
    panel.add(scene.add.text(x + 128, y + 52, 'Buy', { ...font, color: '#c8b898' }));
    panel.add(scene.add.text(x + 190, y + 52, 'Sell', { ...font, color: '#c8b898' }));
    panel.add(scene.add.text(x + 250, y + 52, 'Aboard / Yours', { ...font, color: '#c8b898' }));
    const button = (bx: number, by: number, text: string, fn: () => void, on = true) => {
      const t = scene.add.text(bx, by, text, { ...font, backgroundColor: on ? '#59402a' : '#33291f', color: on ? '#f4e6c8' : '#7d705c', padding: { x: 6, y: 3 } });
      if (on) t.setInteractive({ useHandCursor: true }).on('pointerdown', fn);
      panel.add(t);
    };
    rows.forEach((o, i) => {
      const ry = y + 70 + i * ROW;
      panel.add(scene.add.text(x + 15, ry + 3, `${o.name}${o.short ? ' ▲' : ''}`, { ...font, color: o.short ? '#ffd877' : '#f4e6c8' }));
      button(x + 120, ry, `${o.buy}c`, () => { message = tradeGood(s, m.id, o.itemId, true); changed(); draw(); }, o.aboard > 0);
      button(x + 182, ry, `${o.sell}c`, () => { message = tradeGood(s, m.id, o.itemId, false); changed(); draw(); }, o.have > 0);
      panel.add(scene.add.text(x + 262, ry + 3, `${o.aboard} / ${o.have}`, font));
    });
    const fy = y + 70 + rows.length * ROW + 6;
    panel.add(scene.add.text(x + 15, fy, message || (rows.some((o) => o.short) ? '▲ the town they are bound for is short of this: it pays more, and sells dearer.' : 'The driver stops to trade with you.'), { ...font, fontSize: '10px' }));
    button(x + w - 70, y + h - 30, 'Leave', () => { id = undefined; panel.setVisible(false); });
  };
  return {
    open(caravanId: string) { id = caravanId; message = ''; panel.setVisible(true); draw(); },
    isOpen: () => panel.visible,
    stoppedId: () => panel.visible ? id : undefined,
    close() { id = undefined; panel.setVisible(false); },
  };
}
