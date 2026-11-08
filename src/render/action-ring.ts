/**
 * The verb ring, anchored to whatever was chosen (a person's head, a node, a door). At most RING_MAX chips,
 * never a "More…" page: past six verbs the chips are families (Speak, Help, …) and picking one shows its
 * verbs, with the family's name above them to step back. Chip text is short; the full label is a tip on
 * hover or long-press. Kind = teal, savage = rust. Number keys pick chips only while it is open.
 */

import Phaser from 'phaser';
import { RING_MAX, type RingChip } from '../sim/play-session/verb-families';

export type Chip = RingChip;
export type RingView = { family: string | null; chips: { id: string; label: string; tip?: string; verbs?: string[] }[] };
export type ActionRing = {
  open: (anchor: { x: number; y: number }, chips: Chip[], pick: (c: Chip) => void) => void;
  close: () => void;
  isOpen: () => boolean;
  /** Number-key pick (0-based): a verb acts, a family opens its verbs. True if handled. */
  pickIndex: (i: number) => boolean;
  /** From a family's verbs back to the families. False when already at the top. */
  back: () => boolean;
  /** What is showing now (QA/e2e). */
  view: () => RingView | null;
};

const KIND = 0x84b8b0;
const SAVAGE = 0xc8664a;
const FAMILY = 0xe0b86a;
const DEPTH = 1_000_500;
const W = 96;
const H = 24;
const PER_ROW = 3;
const LONG_PRESS_MS = 450;
const font = { fontFamily: 'Georgia, serif', fontSize: '11px' };

export function createActionRing(scene: Phaser.Scene): ActionRing {
  let objs: Phaser.GameObjects.GameObject[] = [];
  let top: Chip[] = [];
  let shown: Chip[] = [];
  let family: Chip | null = null;
  let anchorAt = { x: 0, y: 0 };
  let cb: ((c: Chip) => void) | null = null;
  let isOpen = false;
  let tip: Phaser.GameObjects.Text | null = null;

  const clear = (): void => {
    for (const o of objs) o.destroy();
    objs = [];
    tip = null;
  };
  const showTip = (c: Chip, x: number, y: number): void => {
    if (!c.tip || !tip) return;
    tip.setText(c.tip).setPosition(x, y + H / 2 + 4).setVisible(true);
  };

  const choose = (c: Chip): void => {
    if (c.verbs?.length) {
      family = c;
      draw(c.verbs);
      return;
    }
    cb?.(c);
  };

  function draw(chips: Chip[]): void {
    clear();
    shown = chips.slice(0, RING_MAX);
    const rows = Math.ceil(shown.length / PER_ROW);
    const headY = anchorAt.y - 12 - (rows - 1) * (H + 4) - H - 10;
    if (family) {
      // The family's name sits above its verbs; tapping it (or Backspace / Esc) steps back.
      const head = scene.add
        .text(anchorAt.x, headY, `‹ ${family.label}`, { ...font, color: '#f2d79a', stroke: '#1b1612', strokeThickness: 3 })
        .setOrigin(0.5, 1).setDepth(DEPTH + 1).setInteractive({ useHandCursor: true });
      head.on('pointerup', () => api.back());
      objs.push(head);
    }
    tip = scene.add
      .text(0, 0, '', { ...font, fontSize: '10px', color: '#f4e6c8', backgroundColor: '#1b1612', padding: { x: 4, y: 2 } })
      .setOrigin(0.5, 0).setDepth(DEPTH + 2).setVisible(false);
    objs.push(tip);
    shown.forEach((c, i) => {
      const row = Math.floor(i / PER_ROW);
      const inRow = Math.min(PER_ROW, shown.length - row * PER_ROW);
      const x = anchorAt.x + ((i % PER_ROW) - (inRow - 1) / 2) * (W + 4);
      const y = anchorAt.y - 12 - (rows - 1 - row) * (H + 4) - H / 2;
      const col = c.verbs ? FAMILY : c.savage ? SAVAGE : KIND;
      const bg = scene.add
        .rectangle(x, y, W, H, 0x2a2420, 0.96)
        .setStrokeStyle(2, col, 1)
        .setDepth(DEPTH)
        .setInteractive({ useHandCursor: true });
      const label = c.verbs ? `${c.label} ›` : c.label;
      const t = scene.add
        .text(x, y, label, { ...font, color: c.verbs ? '#f2d79a' : c.savage ? '#f0b8a0' : '#cdeee8' })
        .setOrigin(0.5)
        .setDepth(DEPTH + 1);
      let pressed = 0;
      let longTimer: Phaser.Time.TimerEvent | null = null;
      bg.on('pointerover', () => { bg.setFillStyle(0x4a3a30, 1); showTip(c, x, y); });
      bg.on('pointerout', () => { bg.setFillStyle(0x2a2420, 0.96); tip?.setVisible(false); longTimer?.remove(); pressed = 0; });
      // Touch: a long press shows the full label instead of acting; a short tap acts.
      bg.on('pointerdown', () => {
        pressed = scene.time.now;
        longTimer = scene.time.delayedCall(LONG_PRESS_MS, () => showTip(c, x, y));
      });
      bg.on('pointerup', () => {
        longTimer?.remove();
        // Only a press that started on this chip counts (not the tap that opened the ring under the finger).
        const began = pressed;
        pressed = 0;
        if (began > 0 && scene.time.now - began < LONG_PRESS_MS) choose(c);
      });
      for (const o of [bg, t]) {
        o.setScale(0.4).setAlpha(0);
        scene.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 140, delay: i * 30, ease: 'Back.out' });
      }
      objs.push(bg, t);
    });
  }

  const api: ActionRing = {
    open(anchor, chips, pick) {
      api.close();
      if (!chips.length) return;
      isOpen = true;
      anchorAt = anchor;
      top = chips.slice(0, RING_MAX);
      family = null;
      cb = pick;
      draw(top);
    },
    close() {
      clear();
      isOpen = false;
      cb = null;
      family = null;
      shown = [];
    },
    isOpen: () => isOpen,
    pickIndex(i) {
      const c = shown[i];
      if (!isOpen || !c) return false;
      choose(c);
      return true;
    },
    back() {
      if (!isOpen || !family) return false;
      family = null;
      draw(top);
      return true;
    },
    view: () => (isOpen
      ? { family: family?.family ?? null, chips: shown.map((c) => ({ id: c.id, label: c.label, ...(c.tip ? { tip: c.tip } : {}), ...(c.verbs ? { verbs: c.verbs.map((v) => v.id) } : {}) })) }
      : null),
  };
  return api;
}
