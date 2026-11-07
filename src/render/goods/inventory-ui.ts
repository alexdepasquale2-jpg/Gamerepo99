/** Inventory panel (I / Tab) + hotbar. Screen-space, reads sim inventory. */

import Phaser from 'phaser';
import type { SimState } from '../../sim/types/runtime';
import { listStacks } from '../../sim/goods/inventory';

const D = 1_000_100;
const SLOT = 30;
const HOTBAR = 8;
const font = { fontFamily: 'monospace', fontSize: '10px', color: '#f4e6c8', stroke: '#1b1612', strokeThickness: 3 };

export type InventoryUi = { toggle: () => void; isOpen: () => boolean; refresh: () => void; select: (i: number) => void; selectedItem: () => string | undefined; close: () => void; dragging: () => boolean };

/** Drag hooks: `move` runs while dragging (null = drag ended), `drop` on release over the world. */
export type DragHooks = { move: (itemId: string | null, wx: number, wy: number) => void; drop: (itemId: string, wx: number, wy: number) => void };

const hex = (c: string): number => parseInt(c.replace('#', ''), 16);

export function createInventoryUi(scene: Phaser.Scene, getState: () => SimState | undefined, drag?: DragHooks): InventoryUi {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const bar = scene.add.container(0, 0).setScrollFactor(0).setDepth(D);
  const panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(D + 10).setVisible(false);
  let selected = 0;
  let held: { itemId: string; sx: number; sy: number; moved: boolean; ghost: Phaser.GameObjects.Arc } | undefined;
  const tip = scene.add.text(0, 0, '', { ...font, backgroundColor: '#1b1612', padding: { x: 4, y: 2 } }).setScrollFactor(0).setDepth(D + 40).setVisible(false);
  const endDrag = (): void => { if (!held) return; held.ghost.destroy(); held = undefined; drag?.move(null, 0, 0); };
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
    if (!held) return;
    if (!held.moved && Math.hypot(p.x - held.sx, p.y - held.sy) < 5) return;
    held.moved = true;
    held.ghost.setPosition(p.x, p.y).setVisible(true);
    drag?.move(held.itemId, p.worldX, p.worldY);
  });
  scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (!held) return;
    const { itemId, moved } = held;
    endDrag();
    // Released over the hotbar itself counts as cancel.
    if (moved && p.y < H - SLOT - 10) drag?.drop(itemId, p.worldX, p.worldY);
  });
  scene.input.keyboard?.on('keydown-ESC', endDrag);

  const drawSlot = (c: Phaser.GameObjects.Container, x: number, y: number, stack?: { item: { id: string; name: string; color: string; icon: string }; qty: number }, sel = false): void => {
    const bg = scene.add.rectangle(x, y, SLOT - 2, SLOT - 2, 0x2a2018, 0.92).setStrokeStyle(2, sel ? 0xf2b84b : 0x6a5a40).setOrigin(0).setScrollFactor(0);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      const stacks = getState() ? listStacks(getState()!) : [];
      const i = stacks.findIndex((s) => s.item.name === stack?.item.name);
      if (i >= 0) { selected = i; refresh(); }
      tip.setVisible(false);
      if (drag && stack && c === bar) {
        const ghost = scene.add.circle(p.x, p.y, 8, hex(stack.item.color)).setStrokeStyle(2, 0xf2b84b).setScrollFactor(0).setDepth(D + 50).setVisible(false);
        held = { itemId: stack.item.id, sx: p.x, sy: p.y, moved: false, ghost };
      }
    }).on('pointerover', () => {
      if (!stack || held) return;
      tip.setText(`${stack.item.name} x${stack.qty}`).setPosition(x + SLOT / 2, y - 4).setOrigin(0.5, 1).setVisible(true);
    }).on('pointerout', () => tip.setVisible(false));
    c.add(bg);
    if (!stack) return;
    const cx = x + SLOT / 2 - 1;
    const cy = y + SLOT / 2 - 3;
    const col = hex(stack.item.color);
    if (stack.item.icon === 'coin') c.add(scene.add.circle(cx, cy, 6, col).setStrokeStyle(1, 0x8a6a1a));
    else if (stack.item.icon === 'letter') c.add(scene.add.rectangle(cx, cy, 14, 9, col).setStrokeStyle(1, 0x6a5a40));
    else if (stack.item.icon === 'wood') c.add(scene.add.rectangle(cx, cy, 16, 6, col).setStrokeStyle(1, 0x3a2414).setAngle(-20));
    else if (stack.item.icon === 'stone') c.add(scene.add.ellipse(cx, cy, 14, 10, col));
    else if (stack.item.icon === 'herb') c.add(scene.add.triangle(cx, cy, 0, 10, 5, 0, 10, 10, col));
    else c.add(scene.add.rectangle(cx, cy, 12, 12, col).setStrokeStyle(1, 0x1b1612));
    c.add(scene.add.text(x + SLOT - 4, y + SLOT - 3, String(stack.qty), font).setOrigin(1, 1));
  };

  const refresh = (): void => {
    const st = getState();
    const stacks = st ? listStacks(st) : [];
    bar.removeAll(true);
    const x0 = W / 2 - (HOTBAR * SLOT) / 2;
    const y0 = H - SLOT - 6;
    for (let i = 0; i < HOTBAR; i++) drawSlot(bar, x0 + i * SLOT, y0, stacks[i], i === selected);
    const sel = stacks[selected];
    if (sel) bar.add(scene.add.text(W / 2, y0 - 3, sel.item.name, font).setOrigin(0.5, 1));
    if (!panel.visible) return;
    panel.removeAll(true);
    const cols = 6;
    const pw = cols * SLOT + 24;
    const ph = Math.max(3, Math.ceil(stacks.length / cols)) * SLOT + 84;
    const px = W / 2 - pw / 2;
    const py = H / 2 - ph / 2 - 20;
    panel.add(scene.add.rectangle(px, py, pw, ph, 0x1b1612, 0.95).setStrokeStyle(2, 0xa8743e).setOrigin(0));
    panel.add(scene.add.text(px + 12, py + 8, 'Satchel', { ...font, fontSize: '13px', color: '#f2b84b' }));
    stacks.forEach((s, i) => drawSlot(panel, px + 12 + (i % cols) * SLOT, py + 30 + Math.floor(i / cols) * SLOT, s, selected === i));
    const cargo = st?.cargo ?? [];
    const note = cargo.length ? `Carrying: ${cargo.map((c) => `${c.qty} ${c.itemId} → ${c.toTownId}`).join('; ')}` : 'Click item · F: use/eat/place · L: letters';
    panel.add(scene.add.text(px + 12, py + ph - 30, note, { ...font, wordWrap: { width: pw - 24 } }));
  };

  refresh();
  return {
    toggle() {
      panel.setVisible(!panel.visible);
      refresh();
    },
    isOpen: () => panel.visible,
    refresh,
    selectedItem: () => { const s = getState(); return s ? listStacks(s)[selected]?.item.id : undefined; },
    dragging: () => !!held?.moved,
    close: () => { endDrag(); panel.setVisible(false); },
    select(i) {
      selected = Phaser.Math.Clamp(i, 0, HOTBAR - 1);
      refresh();
    },
  };
}
