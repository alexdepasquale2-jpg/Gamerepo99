/** Minimal town view — people chips + method commit path + spark lerp. */

import Phaser from 'phaser';
import { createEventBus, type PlaySession } from '../sim';
import { FEEL } from './feel';
import { attachSparkFx } from './spark-fx';

const TILE = 32;

type TownData = { townId?: string };

/** Registry menu shape — mirrored so render never imports ui/. */
type RegistryMethodMenu = {
  show: (
    actions: Array<{ id: string; family?: string }>,
    onPick: (actionId: string) => void,
  ) => Array<{ id: string; label: string; family?: string }>;
};

export class TownScene extends Phaser.Scene {
  private session!: PlaySession;
  private townId = 'unknown';
  private sparkFill = 1;
  private sparkBar!: Phaser.GameObjects.Rectangle;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private localBus = createEventBus();

  constructor() {
    super('town');
  }

  init(data: TownData): void {
    this.townId = data.townId ?? 'unknown';
  }

  create(): void {
    this.session = this.registry.get('playSession') as PlaySession;
    if (!this.session) {
      throw new Error('town scene requires playSession in registry');
    }

    this.add.rectangle(200, 150, 400, 300, 0x3a3228).setDepth(0);
    this.add
      .text(8, 8, `Town: ${this.townId} — pick a method (1–5) · Esc back`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2e9e4',
      })
      .setDepth(10);

    this.drawPeople();
    this.createSparkHud();
    this.openMethodMenu();

    attachSparkFx(this, this.localBus, {
      getPlayerPos: () => ({ x: 200, y: 150 }),
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

    this.input.keyboard?.on('keydown-ESC', () => {
      this.scene.start('overworld');
    });
  }

  private drawPeople(): void {
    const actions = this.session.listActions();
    const personIds = [
      ...new Set(
        actions
          .map((a) => {
            const at = a.id.indexOf('@');
            return at > 0 ? a.id.slice(at + 1) : null;
          })
          .filter((x): x is string => Boolean(x)),
      ),
    ].slice(0, 6);

    personIds.forEach((id, i) => {
      const x = 60 + (i % 3) * TILE * 2;
      const y = 80 + Math.floor(i / 3) * TILE * 2;
      this.add.rectangle(x, y, TILE - 4, TILE - 4, 0x85dcb8).setDepth(2);
      this.add
        .text(x, y + TILE * 0.7, id.slice(0, 12), {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#cfc6b8',
        })
        .setOrigin(0.5)
        .setDepth(3);
    });
  }

  private createSparkHud(): void {
    const h = FEEL.hud;
    const snap = this.session.snapshot();
    this.sparkFill = Math.max(0, Math.min(1, snap.spark / 100));
    this.add
      .rectangle(h.sparkBarX, h.sparkBarY, h.sparkBarWidth, h.sparkBarHeight, h.emptyColor)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(40);
    this.sparkBar = this.add
      .rectangle(
        h.sparkBarX,
        h.sparkBarY,
        h.sparkBarWidth * this.sparkFill,
        h.sparkBarHeight - 2,
        h.fillColor,
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
  }

  private openMethodMenu(): void {
    for (const t of this.menuTexts) t.destroy();
    this.menuTexts = [];

    const actions = this.session.listActions().slice(0, 5);
    const menu = this.registry.get('methodMenu') as RegistryMethodMenu | undefined;
    const items = menu
      ? menu.show(actions, (id) => this.commit(id))
      : actions.map((a) => ({ id: a.id, label: a.id, family: a.family }));

    items.forEach((item, i) => {
      const label = `${i + 1}. ${item.label}`;
      const text = this.add
        .text(8, 200 + i * 18, label, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#f2b84b',
        })
        .setDepth(15)
        .setInteractive({ useHandCursor: true });
      text.on('pointerdown', () => this.commit(item.id));
      this.menuTexts.push(text);

      const key = [
        'keydown-ONE',
        'keydown-TWO',
        'keydown-THREE',
        'keydown-FOUR',
        'keydown-FIVE',
      ][i];
      if (key) {
        this.input.keyboard?.once(key, () => this.commit(item.id));
      }
    });
  }

  private commit(actionId: string): void {
    const before = this.session.snapshot().spark;
    this.session.act(actionId);
    const after = this.session.snapshot().spark;
    const spent = Math.max(0, (before - after) / 100);
    this.localBus.emit('vfx.spark_spent', {
      x: 200,
      y: 150,
      amount01: spent > 0 ? spent : 0.12,
    });
    this.openMethodMenu();
  }
}
