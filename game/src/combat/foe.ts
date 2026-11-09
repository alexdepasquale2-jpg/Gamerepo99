/**
 * One foe in the world: its body (a creature strip, or a tinted person figure), a health bar, and its mind.
 *   melee    close in, wind up (it flashes), strike if you are still in reach
 *   ranged   keep its distance, wind up, loose a shot at where you stand
 *   charger  paw the ground, then rush in a straight line, goring once
 *   boss     melee, every third attack a ground slam all around (its ring is drawn first); calls its kind
 *            at two-thirds and one-third health
 * Leashed to where it spawned: led too far, it walks home and heals. Stunned foes stand still.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt } from '../app/contracts';
import { Figure } from '../actors/figure';
import { addStrip, ART_SCALE, ensureShadow, villagerLook } from '../actors/looks';
import type { FoeRow } from '../sim/hero/data';
import { scaled } from '../sim/hero/spawns';
import { foeStrip, hasStrip } from './draw-foes';

const LEASH = 760;
export type FoeHit = { kind: 'strike' | 'shot' | 'slam' | 'gore'; from: Foe; dmg: number; at: Pt; to?: Pt; radius?: number };

export class Foe {
  readonly uid: string;
  hp: number;
  readonly maxHp: number;
  readonly dmg: number;
  x: number; y: number;
  readonly home: Pt;
  state: 'idle' | 'chase' | 'windup' | 'recover' | 'charge' | 'home' = 'idle';
  timer = 0;
  stun = 0;
  flash = 0;
  aggro = false;
  attacks = 0;
  summoned = 0;
  dead = false;
  private dx = 1;
  private dt = 1 / 60;
  private chargeDir: Pt = { x: 0, y: 0 };
  private hitThisCharge = false;
  private wander: Pt;
  private sprite?: Phaser.GameObjects.Sprite;
  private shadow?: Phaser.GameObjects.Image;
  private fig?: Figure;
  private bar: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  private ring?: Phaser.GameObjects.Graphics;

  constructor(private ctx: GameContext, readonly row: FoeRow, readonly level: number, at: Pt, readonly packKey: string, n: number) {
    this.uid = `${packKey}#${n}`;
    const s = scaled(row, level);
    this.maxHp = this.hp = s.hp;
    this.dmg = s.dmg;
    this.x = at.x; this.y = at.y;
    this.home = { ...at };
    this.wander = { ...at };
    const scene = ctx.scene;
    if (row.figure || !row.art || !hasStrip(row.art)) {
      const look = villagerLook({ id: this.uid, tags: [] }, 'village', ctx.seed);
      this.fig = new Figure(scene, { ...look, scale: look.scale * (row.scale ?? 1) }, at.x, at.y);
      if (row.tint) this.fig.setTint(Number.parseInt(row.tint.slice(1), 16));
    } else {
      const key = addStrip(scene, `foe-${row.art}`, () => foeStrip(row.art!));
      this.shadow = scene.add.image(at.x, at.y, ensureShadow(scene)).setScale(Math.max(1.4, row.size / 7), 1.3);
      this.sprite = scene.add.sprite(at.x, at.y, key, '0').setOrigin(0.5, 1).setScale(ART_SCALE * (row.scale ?? 1));
    }
    this.bar = scene.add.graphics();
    if (row.boss) this.label = scene.add.text(at.x, at.y, `${row.name} · Lv ${level}`, { fontFamily: 'Georgia, serif', fontSize: '11px', color: '#f2b84b', stroke: '#0b0a0f', strokeThickness: 3, resolution: 2 }).setOrigin(0.5, 1);
  }

  get height(): number { return this.fig ? 34 * (this.row.scale ?? 1) : (this.sprite?.displayHeight ?? 24); }
  get ranged(): boolean { return this.row.ai === 'ranged'; }
  center(): Pt { return { x: this.x, y: this.y - this.height / 2 }; }

  /** Advance the mind and body one frame. Returns the attack it lands this frame, if any. */
  update(dt: number, t: number, hero: Pt, heroBusy: boolean, others: Foe[]): FoeHit | null {
    if (this.dead) return null;
    this.dt = dt;
    this.flash = Math.max(0, this.flash - dt);
    const r = this.row;
    const dxh = hero.x - this.x, dyh = hero.y - this.y, dist = Math.hypot(dxh, dyh);
    const fromHome = Math.hypot(this.x - this.home.x, this.y - this.home.y);
    let hit: FoeHit | null = null;
    let moving = false;
    if (this.stun > 0) { this.stun -= dt; this.draw(t, false); return null; }
    if (!this.aggro && dist < r.aggro && !heroBusy) this.aggro = true;
    if (this.aggro && (fromHome > LEASH || heroBusy)) { this.aggro = false; this.state = 'home'; }
    this.timer -= dt;
    switch (this.state) {
      case 'idle': {
        if (this.aggro) { this.state = 'chase'; break; }
        if (Math.hypot(this.wander.x - this.x, this.wander.y - this.y) < 6 || this.timer < -4) {
          const a = (Math.sin(t * 0.37 + this.home.x) + 1) * Math.PI;
          this.wander = { x: this.home.x + Math.cos(a) * 60, y: this.home.y + Math.sin(a) * 40 };
          this.timer = 0;
        }
        moving = this.step(this.wander, r.speed * 0.35 * dt, others);
        break;
      }
      case 'home':
        moving = this.step(this.home, r.speed * dt, others);
        if (fromHome < 20) { this.state = 'idle'; this.hp = this.maxHp; }
        break;
      case 'chase': {
        if (!this.aggro) { this.state = 'home'; break; }
        const want = this.ranged ? r.reach * 0.7 : r.ai === 'charger' ? Math.min(r.aggro * 0.8, 200) : r.reach + 10;
        if (this.ranged && dist < r.reach * 0.45) moving = this.step({ x: this.x - dxh, y: this.y - dyh }, r.speed * dt, others);
        else if (dist > want) moving = this.step(hero, r.speed * dt, others);
        if (dist <= (this.ranged ? r.reach : r.ai === 'charger' ? 220 : r.reach + 12) && this.timer <= 0) {
          this.state = 'windup';
          this.attacks++;
          this.timer = r.windup * (r.ai === 'boss' && this.attacks % 3 === 0 ? 1.6 : 1);
          if (r.ai === 'charger') { const d = Math.max(1, dist); this.chargeDir = { x: dxh / d, y: dyh / d }; }
        }
        this.dx = dxh || this.dx;
        break;
      }
      case 'windup': {
        this.flash = 0.06;
        if (this.timer > 0) break;
        if (r.ai === 'charger') { this.state = 'charge'; this.timer = 0.6; this.hitThisCharge = false; break; }
        if (this.ranged) hit = { kind: 'shot', from: this, dmg: this.dmg, at: this.center(), to: { x: hero.x, y: hero.y - 16 } };
        else if (r.ai === 'boss' && this.attacks % 3 === 0) hit = { kind: 'slam', from: this, dmg: Math.round(this.dmg * 1.4), at: { x: this.x, y: this.y }, radius: 96 };
        else if (dist <= r.reach + 22) hit = { kind: 'strike', from: this, dmg: this.dmg, at: { x: this.x, y: this.y } };
        this.state = 'recover';
        this.timer = r.cd;
        break;
      }
      case 'charge': {
        const v = r.speed * 3.4 * dt;
        moving = this.step({ x: this.x + this.chargeDir.x * v * 4, y: this.y + this.chargeDir.y * v * 4 }, v, others);
        if (!this.hitThisCharge && dist < r.reach + 14) { this.hitThisCharge = true; hit = { kind: 'gore', from: this, dmg: this.dmg, at: { x: this.x, y: this.y } }; }
        if (this.timer <= 0 || !moving) { this.state = 'recover'; this.timer = r.cd; }
        break;
      }
      case 'recover':
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 0; }
        else if (!this.ranged && dist > r.reach + 30) moving = this.step(hero, r.speed * 0.6 * dt, others);
        break;
    }
    this.draw(t, moving);
    return hit;
  }

  /** Walk toward a point, sliding along walls, nudged apart from the others. True when it moved. */
  private step(to: Pt, len: number, others: Foe[]): boolean {
    let dx = to.x - this.x, dy = to.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || len <= 0) return false;
    dx = (dx / d) * Math.min(len, d); dy = (dy / d) * Math.min(len, d);
    for (const o of others) {
      if (o === this || o.dead) continue;
      const ox = this.x - o.x, oy = this.y - o.y, od = Math.hypot(ox, oy);
      if (od > 0 && od < this.row.size + o.row.size) { dx += (ox / od) * len * 0.5; dy += (oy / od) * len * 0.5; }
    }
    const ok = (x: number, y: number): boolean => this.ctx.world.passable({ x, y }) && !this.ctx.world.townAt({ x, y });
    const x0 = this.x, y0 = this.y;
    if (ok(this.x + dx, this.y + dy)) { this.x += dx; this.y += dy; }
    else if (ok(this.x + dx, this.y)) this.x += dx;
    else if (ok(this.x, this.y + dy)) this.y += dy;
    if (Math.abs(this.x - x0) > 0.05) this.dx = this.x - x0;
    return Math.hypot(this.x - x0, this.y - y0) > 0.05;
  }

  /** Shove it away from a point (knockback), against walls. */
  push(from: Pt, by: number): void {
    const dx = this.x - from.x, dy = this.y - from.y, d = Math.max(1, Math.hypot(dx, dy));
    const nx = this.x + (dx / d) * by, ny = this.y + (dy / d) * by;
    if (this.ctx.world.passable({ x: nx, y: ny })) { this.x = nx; this.y = ny; }
  }

  private draw(t: number, moving: boolean): void {
    const left = this.dx < 0;
    const white = this.flash > 0 && Math.floor(t * 30) % 2 === 0;
    if (this.fig) {
      this.fig.face(this.dx, 0);
      this.fig.place(this.x, this.y);
      this.fig.animate(this.dt, moving || this.state === 'charge', t);
      if (white) this.fig.sprite.setTintFill(0xffffff);
      else if (this.stun > 0) this.fig.sprite.setTint(0x9aa8ff);
      else { this.fig.sprite.clearTint(); this.fig.setTint(this.row.tint ? Number.parseInt(this.row.tint.slice(1), 16) : 0xffffff); }
    } else if (this.sprite && this.shadow) {
      const frame = moving || this.row.art === 'wraith' || this.row.art === 'colossus' ? String(Math.floor(t * 6) % 2) : '0';
      const bob = this.row.art === 'wraith' ? Math.sin(t * 3) * 3 - 6 : 0;
      this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 0.5);
      this.sprite.setPosition(this.x, this.y + bob).setDepth(this.y).setFlipX(left).setFrame(frame);
      if (white) this.sprite.setTintFill(0xffffff); else if (this.stun > 0) this.sprite.setTint(0x9aa8ff); else this.sprite.clearTint();
    }
    // Health bar once hurt (always for bosses).
    this.bar.clear();
    const top = this.y - this.height - 8;
    if (this.hp < this.maxHp || this.row.boss) {
      const w = this.row.boss ? 60 : 26;
      this.bar.fillStyle(0x0b0a0f, 0.75).fillRect(this.x - w / 2 - 1, top - 1, w + 2, 5);
      this.bar.fillStyle(this.row.boss ? 0xe8602a : 0xc84a3a, 1).fillRect(this.x - w / 2, top, w * (this.hp / this.maxHp), 3);
      this.bar.setDepth(this.y + 2000);
    }
    this.label?.setPosition(this.x, top - 3).setDepth(this.y + 2000);
    // A boss's slam: a ring on the ground while it winds up.
    if (this.row.ai === 'boss' && this.state === 'windup' && this.attacks % 3 === 0) {
      this.ring ??= this.ctx.scene.add.graphics();
      this.ring.clear().lineStyle(2, 0xe8602a, 0.8).strokeEllipse(this.x, this.y, 192, 96).fillStyle(0xe8602a, 0.12).fillEllipse(this.x, this.y, 192, 96).setDepth(this.y - 1);
    } else this.ring?.clear();
  }

  kill(): void {
    this.dead = true;
    this.destroy();
  }
  destroy(): void {
    this.fig?.destroy();
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.bar.destroy();
    this.label?.destroy();
    this.ring?.destroy();
  }
}
