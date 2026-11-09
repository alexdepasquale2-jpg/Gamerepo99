/**
 * Combat effects in the world: slash arcs, rings (nova, war cry, slam), floating numbers, and the shots in
 * flight (yours and theirs) with their own hit tests. Everything here is short-lived and drawn above the
 * ground by its y. No sim state.
 */
import type Phaser from 'phaser';
import type { Pt } from '../app/contracts';

type Fading = { obj: Phaser.GameObjects.Graphics | Phaser.GameObjects.Text; life: number; max: number; vy: number };
export type Shot = {
  x: number; y: number; vx: number; vy: number; life: number; dmg: number; mine: boolean; color: number; size: number;
  /** Hits on a foe's uid (mine) once; foe shots stop on the hero. */
  hit: Set<string>; pierce: boolean; tag: string; g: Phaser.GameObjects.Graphics;
};

export type Fx = {
  slash(at: Pt, ang: number, arc: number, reach: number, color?: number): void;
  ring(at: Pt, radius: number, color: number): void;
  number(at: Pt, text: string, color: string, big?: boolean): void;
  shoot(from: Pt, to: Pt, speed: number, dmg: number, mine: boolean, opts?: { color?: number; size?: number; pierce?: boolean; range?: number; tag?: string }): void;
  shots(): Shot[];
  update(dt: number): void;
  clear(): void;
};

export function createFx(scene: Phaser.Scene): Fx {
  const fading: Fading[] = [];
  let flying: Shot[] = [];
  const add = (obj: Fading['obj'], life: number, vy = 0): void => void fading.push({ obj, life, max: life, vy });

  return {
    slash(at, ang, arc, reach, color = 0xf0e0c0) {
      const g = scene.add.graphics().setDepth(at.y + 5);
      const a0 = ang - ((arc || 30) * Math.PI) / 360, a1 = ang + ((arc || 30) * Math.PI) / 360;
      g.lineStyle(3, color, 0.9).beginPath().arc(at.x, at.y - 14, reach * 0.85, a0, a1).strokePath();
      g.lineStyle(1, 0xffffff, 0.7).beginPath().arc(at.x, at.y - 14, reach * 0.65, a0 + 0.1, a1 - 0.1).strokePath();
      add(g, 0.16);
    },
    ring(at, radius, color) {
      const g = scene.add.graphics().setDepth(at.y + 5);
      g.lineStyle(3, color, 0.85).strokeEllipse(at.x, at.y, radius * 2, radius).fillStyle(color, 0.15).fillEllipse(at.x, at.y, radius * 2, radius);
      add(g, 0.35);
    },
    number(at, text, color, big = false) {
      const t = scene.add.text(at.x + (Math.random() - 0.5) * 10, at.y, text, {
        fontFamily: 'Georgia, serif', fontSize: big ? '15px' : '11px', fontStyle: 'bold', color, stroke: '#0b0a0f', strokeThickness: 3, resolution: 2,
      }).setOrigin(0.5, 1).setDepth(1e6);
      add(t, big ? 1.1 : 0.8, -38);
    },
    shoot(from, to, speed, dmg, mine, opts = {}) {
      const dx = to.x - from.x, dy = to.y - from.y, d = Math.max(1, Math.hypot(dx, dy));
      const g = scene.add.graphics();
      const color = opts.color ?? (mine ? 0xffc060 : 0xe8602a);
      const size = opts.size ?? 4;
      g.fillStyle(color, 1).fillCircle(0, 0, size).fillStyle(0xffffff, 0.8).fillCircle(0, 0, size / 2);
      g.setPosition(from.x, from.y);
      flying.push({ x: from.x, y: from.y, vx: (dx / d) * speed, vy: (dy / d) * speed, life: (opts.range ?? 320) / speed, dmg, mine, color, size, hit: new Set(), pierce: !!opts.pierce, tag: opts.tag ?? '', g });
    },
    shots: () => flying,
    update(dt) {
      for (let i = fading.length - 1; i >= 0; i--) {
        const f = fading[i]!;
        f.life -= dt;
        f.obj.setAlpha(Math.max(0, f.life / f.max));
        if (f.vy) f.obj.y += f.vy * dt;
        if (f.life <= 0) { f.obj.destroy(); fading.splice(i, 1); }
      }
      for (const s of flying) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        s.g.setPosition(s.x, s.y).setDepth(s.y + 30);
      }
      flying = flying.filter((s) => { if (s.life > 0) return true; s.g.destroy(); return false; });
    },
    clear() {
      fading.forEach((f) => f.obj.destroy());
      fading.length = 0;
      flying.forEach((s) => s.g.destroy());
      flying = [];
    },
  };
}
