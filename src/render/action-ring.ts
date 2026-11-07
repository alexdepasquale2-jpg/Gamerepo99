/** Context chips popped above a person's head. Kind = teal, savage = rust. */

import Phaser from 'phaser';

export type Chip = { id: string; label: string; savage: boolean };
export type ActionRing = {
  open: (anchor: { x: number; y: number }, chips: Chip[], pick: (c: Chip) => void) => void;
  close: () => void;
  isOpen: () => boolean;
  /** Number-key pick (0-based); returns true if handled. */
  pickIndex: (i: number) => boolean;
};

const KIND = 0x84b8b0;
const SAVAGE = 0xc8664a;
const DEPTH = 1_000_500;
const W = 88;
const H = 24;

export function createActionRing(scene: Phaser.Scene): ActionRing {
  let objs: Phaser.GameObjects.GameObject[] = [];
  let current: Chip[] = [];
  let cb: ((c: Chip) => void) | null = null;
  let isOpen = false;

  const api: ActionRing = {
    open(anchor, chips, pick) {
      api.close();
      if (!chips.length) return;
      isOpen = true;
      current = chips;
      cb = pick;
      const per = 3;
      const rows = Math.ceil(chips.length / per);
      chips.forEach((c, i) => {
        const row = Math.floor(i / per);
        const inRow = Math.min(per, chips.length - row * per);
        const x = anchor.x + ((i % per) - (inRow - 1) / 2) * (W + 4);
        const y = anchor.y - 12 - (rows - 1 - row) * (H + 4) - H / 2;
        const col = c.savage ? SAVAGE : KIND;
        const bg = scene.add
          .rectangle(x, y, W, H, 0x2a2420, 0.96)
          .setStrokeStyle(2, col, 1)
          .setDepth(DEPTH)
          .setInteractive({ useHandCursor: true });
        const t = scene.add
          .text(x, y, c.label, { fontFamily: 'Georgia, serif', fontSize: '11px', color: c.savage ? '#f0b8a0' : '#cdeee8' })
          .setOrigin(0.5)
          .setDepth(DEPTH + 1);
        bg.on('pointerover', () => bg.setFillStyle(0x4a3a30, 1));
        bg.on('pointerout', () => bg.setFillStyle(0x2a2420, 0.96));
        bg.on('pointerdown', () => cb?.(c));
        for (const o of [bg, t]) {
          o.setScale(0.4).setAlpha(0);
          scene.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 140, delay: i * 30, ease: 'Back.out' });
        }
        objs.push(bg, t);
      });
    },
    close() {
      for (const o of objs) o.destroy();
      objs = [];
      isOpen = false;
      cb = null;
    },
    isOpen: () => isOpen,
    pickIndex(i) {
      const c = current[i];
      if (!isOpen || !c) return false;
      cb?.(c);
      return true;
    },
  };
  return api;
}
