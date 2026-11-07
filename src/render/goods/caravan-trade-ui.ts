import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { caravanStatus } from '../../sim/caravan-visit';
import { caravanItem, tradeCaravan } from '../../sim/goods/caravan-trade';
export function createCaravanTrade(scene: Phaser.Scene, getState: () => SimState | undefined, changed: () => void) {
  const panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(1_000_410).setVisible(false);
  let id: string | undefined;
  let message = '';
  const draw = () => {
    panel.removeAll(true);
    const s = getState(), m = s?.caravans?.find((m) => m.id === id);
    if (!s || !m) { panel.setVisible(false); id = undefined; return; }
    const item = caravanItem(s, m.id);
    const x = scene.scale.width / 2 - 170, y = scene.scale.height / 2 - 95;
    panel.add(scene.add.rectangle(x, y, 340, 190, 0x231c16, 0.98).setOrigin(0).setStrokeStyle(2, 0xc79b61));
    const font = { fontFamily: 'monospace', fontSize: '12px', color: '#f4e6c8', wordWrap: { width: 310 } };
    panel.add(scene.add.text(x + 15, y + 12, `Roadside trader · ${caravanStatus(m)}\n${item?.name ?? m.cargoResourceId}: ${m.qty} aboard · ${item?.price ?? 0} coin each\nYour coin: ${s.inventory?.coin ?? 0}`, font));
    const button = (bx: number, text: string, fn: () => void) => {
      const t = scene.add.text(bx, y + 100, text, { ...font, backgroundColor: '#59402a', padding: { x: 8, y: 7 } }).setInteractive({ useHandCursor: true });
      t.on('pointerdown', fn); panel.add(t);
    };
    button(x + 15, 'Buy one', () => { message = tradeCaravan(s, m.id, true); changed(); draw(); });
    button(x + 125, 'Sell one', () => { message = tradeCaravan(s, m.id, false); changed(); draw(); });
    button(x + 240, 'Leave', () => { id = undefined; panel.setVisible(false); });
    panel.add(scene.add.text(x + 15, y + 143, message || 'The driver stops to trade with you.', font));
  };
  return {
    open(caravanId: string) { id = caravanId; message = ''; panel.setVisible(true); draw(); },
    isOpen: () => panel.visible,
    stoppedId: () => panel.visible ? id : undefined,
    close() { id = undefined; panel.setVisible(false); },
  };
}
