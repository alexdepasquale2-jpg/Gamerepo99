/**
 * Crisp DOM labels over the canvas: a person's name with their strongest mark's glyph and a leader's
 * pennant, and a wagon's status. Labels are pooled; only the ones placed this frame are shown, so the
 * cost follows what the camera sees, never the size of the world.
 */
import type Phaser from 'phaser';

export type LabelSpec = {
  text: string;
  /** Glyph beside the name, with its colour (a mark tell). */
  glyph?: { char: string; color: string };
  /** A small pennant for a town's doctrine leader. */
  leader?: boolean;
  alpha: number;
  muted?: boolean;
};

type Slot = { el: HTMLDivElement; name: HTMLSpanElement; glyph: HTMLSpanElement; flag: HTMLSpanElement; sig: string; used: boolean; x: number; y: number; a: number };

export type NameLayer = {
  begin(): void;
  /** Place a label with its bottom centre at a world point. Call nearest-first: crowded later labels give way. */
  put(id: string, wx: number, wy: number, spec: LabelSpec): void;
  end(): void;
  destroy(): void;
};

const LEADER_COLOR = '#e8c878';
const LINE_H = 13;

export function createNameLayer(scene: Phaser.Scene): NameLayer {
  const root = document.createElement('div');
  root.className = 'act-names';
  root.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:4;';
  document.body.appendChild(root);
  const slots = new Map<string, Slot>();
  let rect = { left: 0, top: 0, k: 1 };
  let placed: { x: number; y: number; w: number }[] = [];

  const make = (): Slot => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;font:600 11px Georgia,"Times New Roman",serif;color:#e8dcc8;' +
      'text-shadow:0 1px 0 #1b1612,1px 0 0 #1b1612,-1px 0 0 #1b1612,0 -1px 0 #1b1612,0 0 3px #0b0a0f;transform-origin:50% 100%;will-change:transform;';
    const name = document.createElement('span');
    const glyph = document.createElement('span');
    glyph.style.marginLeft = '3px';
    const flag = document.createElement('span');
    flag.style.cssText = `margin-left:3px;color:${LEADER_COLOR};font-size:10px;`;
    flag.textContent = '⚑';
    el.append(name, glyph, flag);
    root.appendChild(el);
    return { el, name, glyph, flag, sig: '', used: false, x: NaN, y: NaN, a: -1 };
  };

  return {
    begin() {
      const canvas = scene.game.canvas;
      const r = canvas.getBoundingClientRect();
      rect = { left: r.left, top: r.top, k: r.width / Math.max(1, scene.scale.width) };
      for (const s of slots.values()) s.used = false;
      placed = [];
    },
    put(id, wx, wy, spec) {
      let s = slots.get(id);
      if (!s) slots.set(id, (s = make()));
      s.used = true;
      const sig = `${spec.text}|${spec.glyph?.char ?? ''}|${spec.glyph?.color ?? ''}|${spec.leader ? 1 : 0}|${spec.muted ? 1 : 0}`;
      if (sig !== s.sig) {
        s.sig = sig;
        s.name.textContent = spec.text;
        s.name.style.color = spec.muted ? '#b8aa94' : '#e8dcc8';
        s.glyph.textContent = spec.glyph?.char ?? '';
        s.glyph.style.color = spec.glyph?.color ?? '';
        s.glyph.style.display = spec.glyph ? '' : 'none';
        s.flag.style.display = spec.leader ? '' : 'none';
      }
      const cam = scene.cameras.main;
      const x = Math.round(rect.left + (wx - cam.worldView.x) * cam.zoom * rect.k);
      let y = Math.round(rect.top + (wy - cam.worldView.y) * cam.zoom * rect.k);
      // Declutter: earlier (nearer) labels win; a later one steps up, or gives way in a crowd.
      const w = (spec.text.length + (spec.glyph ? 2 : 0) + (spec.leader ? 2 : 0)) * 6.4 + 4;
      const clash = (yy: number) => placed.some((r) => Math.abs(r.x - x) * 2 < r.w + w && Math.abs(r.y - yy) < LINE_H);
      let tries = 0;
      while (clash(y) && tries < 2) { y -= LINE_H; tries++; }
      if (clash(y)) { s.used = false; return; }
      placed.push({ x, y, w });
      if (x !== s.x || y !== s.y) {
        s.x = x;
        s.y = y;
        s.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      }
      const a = Math.round(spec.alpha * 20) / 20;
      if (a !== s.a) {
        s.a = a;
        s.el.style.opacity = String(a);
      }
      if (s.el.style.display === 'none') s.el.style.display = '';
    },
    end() {
      for (const [id, s] of slots) {
        if (s.used) continue;
        // Keep a small pool of hidden labels; drop the rest.
        if (slots.size > 48) { s.el.remove(); slots.delete(id); } else if (s.el.style.display !== 'none') s.el.style.display = 'none';
      }
    },
    destroy() {
      root.remove();
      slots.clear();
    },
  };
}
