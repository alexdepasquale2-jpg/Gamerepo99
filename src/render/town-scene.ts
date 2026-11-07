/** Town view — people as figures, tap one to see what you can do for (or to) them. */

import Phaser from 'phaser';
import { createEventBus, type PlaySession } from '../sim';
import { FEEL } from './feel';
import { HERO_TEX } from './sheet-frames';
import { attachSparkFx } from './spark-fx';

type TownData = { townId?: string };

const W = 640;
const H = 360;
const INK = '#f4e6c8';
const DIM = '#a89068';
const GOLD = '#f2b84b';
const SERIF = 'Georgia, serif';
const KIND = 0x84b8b0;
const SAVAGE = 0xc8664a;

/** marta_ellison -> Marta Ellison; marrow_den -> Marrow Den. */
export const pretty = (id: string): string =>
  id
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');

const METHOD_VERB: Record<string, string> = {
  inspire: 'Inspire',
  carry_burden: 'Carry their burden',
  challenge: 'Challenge',
  shame: 'Shame',
  lie: 'Lie to',
  show_up: 'Show up for',
  listen: 'Listen to',
};

export class TownScene extends Phaser.Scene {
  private session!: PlaySession;
  private townId = 'unknown';
  private sparkFill = 1;
  private sparkBar!: Phaser.GameObjects.Rectangle;
  private actionUi: Phaser.GameObjects.GameObject[] = [];
  private figures = new Map<string, Phaser.GameObjects.Sprite>();
  private selected?: string;
  private feedback!: Phaser.GameObjects.Text;
  private localBus = createEventBus();

  constructor() {
    super('town');
  }

  init(data: TownData): void {
    this.townId = data.townId ?? 'unknown';
    this.selected = undefined;
    this.figures.clear();
    this.actionUi = [];
  }

  create(): void {
    this.session = this.registry.get('playSession') as PlaySession;
    if (!this.session) throw new Error('town scene requires playSession in registry');

    // Warm hearth backdrop: dusk gradient + ground band.
    const g = this.add.graphics();
    g.fillGradientStyle(0x1a1420, 0x1a1420, 0x3a2a22, 0x3a2a22, 1);
    g.fillRect(0, 0, W, H * 0.62);
    g.fillStyle(0x2c2419, 1).fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle(0x4a3826, 1).fillRect(0, H * 0.62, W, 2);
    const glow = this.add.circle(W / 2, H * 0.62, 70, 0xf2b84b, 0.12);
    this.tweens.add({ targets: glow, alpha: 0.05, scale: 1.15, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(16, 12, pretty(this.townId), { fontFamily: SERIF, fontSize: '22px', color: GOLD });
    this.add.text(16, 40, 'Tap someone to go to them.', { fontFamily: SERIF, fontSize: '12px', color: DIM });

    this.createSparkHud();
    this.drawPeople();
    this.feedback = this.add
      .text(W / 2, H - 14, '', { fontFamily: SERIF, fontSize: '13px', color: '#84b8b0', align: 'center' })
      .setOrigin(0.5, 1);

    attachSparkFx(this, this.localBus, {
      getPlayerPos: () => this.figurePos(),
      onSparkSpentHud: (amount01) => {
        const next = Math.max(0, this.sparkFill - amount01);
        this.tweens.add({
          targets: { v: this.sparkFill },
          v: next,
          duration: FEEL.spark.lifespanMs,
          onUpdate: (tw) => {
            const v = (tw.targets[0] as { v: number }).v;
            this.sparkFill = v;
            this.sparkBar.width = FEEL.hud.sparkBarWidth * v;
          },
        });
      },
    });

    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('overworld'));
    this.add
      .text(W - 12, 12, 'Leave', { fontFamily: SERIF, fontSize: '16px', color: INK, backgroundColor: '#2a2420', padding: { x: 12, y: 6 } })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('overworld'));

    const first = this.peopleIds()[0];
    if (first) this.select(first);
  }

  private peopleIds(): string[] {
    const ids = this.session
      .listActions()
      .map((a) => {
        const at = a.id.indexOf('@');
        return at > 0 ? a.id.slice(at + 1) : null;
      })
      .filter((x): x is string => Boolean(x));
    return [...new Set(ids)].slice(0, 6);
  }

  private figurePos(): { x: number; y: number } {
    const f = this.selected ? this.figures.get(this.selected) : undefined;
    return f ? { x: f.x, y: f.y - 30 } : { x: W / 2, y: H / 2 };
  }

  private drawPeople(): void {
    const ids = this.peopleIds();
    const span = Math.min(W - 80, ids.length * 92);
    ids.forEach((id, i) => {
      const x = W / 2 - span / 2 + 46 + i * (span / Math.max(1, ids.length));
      const y = H * 0.62 - 4 + (i % 2) * 10;
      this.add.ellipse(x, y + 2, 34, 10, 0x000000, 0.35);
      const s = this.add.sprite(x, y, HERO_TEX, this.textures.get(HERO_TEX).has('7') ? '7' : undefined);
      s.setOrigin(0.5, 1).setScale(3).setInteractive({ useHandCursor: true });
      s.on('pointerdown', () => this.select(id));
      this.tweens.add({ targets: s, y: y - 2, duration: 900 + i * 130, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.add
        .text(x, y + 10, pretty(id), { fontFamily: SERIF, fontSize: '12px', color: INK })
        .setOrigin(0.5, 0);
      this.figures.set(id, s);
    });
  }

  private select(personId: string): void {
    this.selected = personId;
    for (const [id, s] of this.figures) {
      s.setTint(id === personId ? 0xffffff : 0x8a7a6a);
      s.setAlpha(id === personId ? 1 : 0.75);
    }
    this.showActions();
  }

  private showActions(): void {
    for (const o of this.actionUi) o.destroy();
    this.actionUi = [];
    if (!this.selected) return;
    const mine = this.session.listActions().filter((a) => a.id.endsWith('@' + this.selected));
    const name = pretty(this.selected).split(' ')[0];
    const colW = 196;
    mine.slice(0, 6).forEach((a, i) => {
      const method = a.id.slice(0, a.id.indexOf('@'));
      const label = `${METHOD_VERB[method] ?? pretty(method)} ${method === 'carry_burden' ? '' : name}`.trim();
      const x = 16 + (i % 3) * (colW + 8);
      const y = 72 + Math.floor(i / 3) * 40;
      const col = a.family === 'savage' ? SAVAGE : KIND;
      const bg = this.add.rectangle(x, y, colW, 32, 0x2a2420, 0.92).setOrigin(0, 0).setStrokeStyle(1, col, 0.8);
      const t = this.add
        .text(x + 10, y + 16, label, { fontFamily: SERIF, fontSize: '14px', color: INK })
        .setOrigin(0, 0.5);
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => bg.setFillStyle(0x3a3028, 1))
        .on('pointerout', () => bg.setFillStyle(0x2a2420, 0.92))
        .on('pointerdown', () => this.commit(a.id, label));
      this.actionUi.push(bg, t);
      const key = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i];
      if (key) this.input.keyboard?.once(`keydown-${key}`, () => this.commit(a.id, label));
    });
  }

  private createSparkHud(): void {
    const snap = this.session.snapshot();
    this.sparkFill = Math.max(0, Math.min(1, snap.spark / 100));
    const h = FEEL.hud;
    this.add.text(W - 156, 52, 'spark', { fontFamily: SERIF, fontSize: '11px', color: DIM }).setOrigin(1, 0.5);
    this.add.rectangle(W - 150, 52, 138, 6, h.emptyColor).setOrigin(0, 0.5);
    this.sparkBar = this.add.rectangle(W - 150, 52, 138 * this.sparkFill, 4, h.fillColor).setOrigin(0, 0.5);
    // Keep width math in one place: bar width scales from the shortened track.
    const track = 138;
    this.sparkBar.setData('track', track);
  }

  private commit(actionId: string, label: string): void {
    const before = this.session.snapshot().spark;
    this.session.act(actionId);
    const after = this.session.snapshot().spark;
    const r = this.session.lastResolve();
    const spent = Math.max(0, (before - after) / 100);
    const p = this.figurePos();
    this.localBus.emit('vfx.spark_spent', { x: p.x, y: p.y, amount01: spent > 0 ? spent : 0.12 });
    const track = (this.sparkBar.getData('track') as number) ?? FEEL.hud.sparkBarWidth;
    this.sparkFill = Math.max(0, after / 100);
    this.tweens.add({ targets: this.sparkBar, width: track * this.sparkFill, duration: 300 });
    const who = this.selected ? pretty(this.selected).split(' ')[0] : 'They';
    const line =
      r?.kind === 'refused'
        ? `${who} turns away.`
        : (r?.flameDelta ?? 0) > 0
          ? `${label}. Something in ${who} catches.`
          : (r?.flameDelta ?? 0) < 0
            ? `${label}. ${who} goes quiet.`
            : `${label}.`;
    this.feedback.setText(line).setAlpha(0);
    this.tweens.add({ targets: this.feedback, alpha: 1, duration: 250 });
    const f = this.selected ? this.figures.get(this.selected) : undefined;
    if (f) this.tweens.add({ targets: f, scale: 3.3, duration: 120, yoyo: true });
    this.showActions();
  }
}
